from typing import Optional

from ninja import Schema


# ── Existing: Supabase JWT sign-in ─────────────────────────────────────────

class SignInRequest(Schema):
    access_token: str


class LocalUserOut(Schema):
    id: str
    email: str
    username: str
    is_new_user: bool


class ExternalIdentityOut(Schema):
    provider: str
    provider_user_id: str
    email: str
    email_verified: bool


class SignInResponse(Schema):
    user: LocalUserOut
    external_identity: ExternalIdentityOut


# ── Server connection verify ─────────────────────────────────────────────────

class AuthVerifyResponse(Schema):
    ok: bool
    email: str
    user_id: str
    is_new_user: bool
    company_exists: bool
    is_owner: bool
    role: Optional[str] = None
    company_name: Optional[str] = None
