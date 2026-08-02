"""
manage.py seed_permissions

Loads the Right registry (authn/permissions/rights.py) into the database,
and seeds the four default Roles (Owner, Admin, Member, Viewer) — with
their default RoleRight sets — for every existing Company.

Safe to re-run: everything is get_or_create, so running this again after
adding a new right to the registry only adds what's missing, it never
duplicates or resets rights a company has already customized.

NOTE: this file must live at authn/management/commands/ specifically —
Django's management command discovery only looks in <app>/management/commands/,
it will NOT find commands nested inside authn/permissions/. Every other
piece of the permission system lives in authn/permissions/; this one file
is the sole exception, for that framework reason.

Usage:
    python manage.py seed_permissions
"""
from django.core.management.base import BaseCommand
from django.db import transaction

from authn.permissions.models import Right, Role, RoleRight
from authn.permissions.rights import REGISTRY, DEFAULT_ROLE_RIGHTS


class Command(BaseCommand):
    help = "Seed the Right registry and the four default Roles for every company."

    @transaction.atomic
    def handle(self, *args, **options):
        from nucleus.models import Company

        # ── 1. Load the Right registry ──────────────────────────────────────
        right_by_code = {}
        created_rights = 0
        for code, object_type, scope, description in REGISTRY:
            right, created = Right.objects.update_or_create(
                code=code,
                defaults={
                    "object_type": object_type,
                    "scope": scope,
                    "description": description,
                },
            )
            right_by_code[code] = right
            created_rights += int(created)
        self.stdout.write(f"Rights: {len(right_by_code)} in registry, {created_rights} newly created.")

        # ── 2. Seed default roles for every company ─────────────────────────
        companies = Company.objects.filter(is_active=True)
        role_count = 0
        right_link_count = 0

        for company in companies:
            for role_name, right_codes in DEFAULT_ROLE_RIGHTS.items():
                role, _created = Role.objects.get_or_create(
                    company=company,
                    name=role_name,
                    scope="company",  # default roles are seeded at company scope;
                                       # they get re-used at project/topic scope via
                                       # RoleAssignment.scope_object_type at grant time.
                    defaults={"description": f"Default {role_name} role."},
                )
                role_count += 1

                for code in right_codes:
                    right = right_by_code.get(code)
                    if right is None:
                        self.stderr.write(
                            self.style.WARNING(
                                f"DEFAULT_ROLE_RIGHTS references unknown right '{code}' "
                                f"(role={role_name}) — skipping."
                            )
                        )
                        continue
                    _, created = RoleRight.objects.get_or_create(role=role, right=right)
                    right_link_count += int(created)

        self.stdout.write(
            self.style.SUCCESS(
                f"Done. {companies.count()} companies, {role_count} role rows touched, "
                f"{right_link_count} new role-right links created."
            )
        )
