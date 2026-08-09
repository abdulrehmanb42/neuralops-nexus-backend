"""
python manage.py backfill_avatars

One-off: assign_avatar() (authn/services.py) only ever fires at creation
time -- create_persona() for personas, auth_verify() for humans (on their
next login/token-verify). Any User row created before #148 shipped, or any
human who hasn't re-hit /auth/verify/ since, has no avatar yet. Run once
to fix every existing row in one pass; safe to re-run (assign_avatar()
skips anyone who already has one).
"""
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.db.models import Q

User = get_user_model()


class Command(BaseCommand):
    help = "Backfill avatars for existing users/personas created before #148 (assign_avatar didn't exist yet)."

    def handle(self, *args, **options):
        from authn.services import assign_avatar

        # AddField on a nullable column defaults EXISTING rows to NULL in
        # the DB, not "" -- an exact avatar="" filter misses every one of
        # them (SQL NULL != ''). Newly-created rows (via assign_avatar()'s
        # own `if not user.avatar` truthiness check) do start out as "",
        # so both need to be treated as "unset" here.
        users = User.objects.filter(is_active=True).filter(
            Q(avatar="") | Q(avatar__isnull=True)
        )
        total = users.count()
        assigned, skipped = 0, 0

        for user in users:
            result = assign_avatar(user)
            if result:
                assigned += 1
                self.stdout.write(f"  {user.user_type:8s} {user.username or user.email} -> {result}")
            else:
                skipped += 1
                self.stderr.write(self.style.WARNING(
                    f"  {user.user_type:8s} {user.username or user.email} -> SKIPPED (pool missing/empty?)"
                ))

        self.stdout.write(self.style.SUCCESS(
            f"Done. {total} users had no avatar -- assigned {assigned}, skipped {skipped}."
        ))
