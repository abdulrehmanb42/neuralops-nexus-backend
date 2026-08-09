"""
Celery tasks for the authn app.

poll_device_activation (device-activation polling) was removed — the
frontend never used the /auth/init/ + /auth/status/ device flow; it signs
in via Supabase directly and calls /auth/verify/ instead. See
authn/services.py and authn/api.py for the live sign-in flow.
"""
