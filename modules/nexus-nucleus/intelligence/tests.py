"""
Tests for intelligence/oauth_client.py -- run with:
    python manage.py test intelligence

Only the two functions that make real HTTP calls (OAuth2Client.fetch_token,
OAuth2Client.refresh_token) are mocked. Everything else -- state signing,
URL building, the storage logic in _store_token -- runs for real, so these
tests prove the actual code, not a simulation of it.
"""
from unittest.mock import patch

from django.core import signing
from django.test import TestCase

from intelligence import oauth_client
from nucleus.models import Company, MCPServer


class ClientOAuthTests(TestCase):
    def setUp(self):
        self.company = Company.objects.create(name="Test Co", slug="test-co")
        self.server = MCPServer.objects.create(
            company=self.company,
            name="Fake Provider",
            transport=MCPServer.Transport.HTTP,
            url="http://fake-provider.example/mcp",   # satisfies the http transport CheckConstraint
            auth_type=MCPServer.AuthType.OAUTH2,
            oauth_config={
                "authorize_endpoint": "https://fake-provider.example/oauth/authorize",
                "token_endpoint": "https://fake-provider.example/oauth/token",
                "client_id": "test-client-id",
                "scopes": ["read", "write"],
                "token_env_var": "FAKE_PROVIDER_TOKEN",
            },
        )
        self.server.set_secrets({"client_secret": "test-client-secret"})
        self.server.save()

    # ── build_authorize_url ──────────────────────────────────────────────

    def test_build_authorize_url_contains_expected_params(self):
        url = oauth_client.build_authorize_url(self.server, frontend_origin="http://localhost:3000")
        self.assertIn("https://fake-provider.example/oauth/authorize", url)
        self.assertIn("client_id=test-client-id", url)
        self.assertIn("response_type=code", url)
        self.assertIn("state=", url)

    def test_build_authorize_url_state_round_trips(self):
        """The state embedded in the URL must decode back to server_id + frontend_origin --
        this is the entire CSRF/session-less-state mechanism, so it's worth proving directly."""
        url = oauth_client.build_authorize_url(self.server, frontend_origin="http://localhost:3000")
        state = url.split("state=")[1].split("&")[0]
        from urllib.parse import unquote
        decoded = signing.loads(unquote(state), salt=oauth_client._SIGNING_SALT)
        self.assertEqual(decoded["server_id"], str(self.server.id))
        self.assertEqual(decoded["frontend_origin"], "http://localhost:3000")

    # ── complete_callback ────────────────────────────────────────────────

    def _valid_state(self, frontend_origin="http://localhost:3000"):
        return signing.dumps(
            {"server_id": str(self.server.id), "frontend_origin": frontend_origin},
            salt=oauth_client._SIGNING_SALT,
        )

    @patch("intelligence.oauth_client.OAuth2Client.fetch_token")
    def test_complete_callback_stores_token(self, mock_fetch):
        mock_fetch.return_value = {
            "access_token": "fake-access-token",
            "refresh_token": "fake-refresh-token",
            "expires_in": 3600,
        }
        result = oauth_client.complete_callback(code="fake-code", state=self._valid_state())

        self.assertEqual(result["server_id"], str(self.server.id))
        self.assertEqual(result["frontend_origin"], "http://localhost:3000")

        self.server.refresh_from_db()
        secrets = self.server.get_secrets()
        self.assertEqual(secrets["FAKE_PROVIDER_TOKEN"], "fake-access-token")
        self.assertEqual(secrets["refresh_token"], "fake-refresh-token")
        self.assertIn("expires_at", self.server.oauth_config)

    def test_complete_callback_rejects_bad_state(self):
        with self.assertRaises(signing.BadSignature):
            oauth_client.complete_callback(code="fake-code", state="garbage-not-signed")

    def test_complete_callback_rejects_unknown_server(self):
        fake_state = signing.dumps(
            {"server_id": "00000000-0000-0000-0000-000000000000", "frontend_origin": "http://x"},
            salt=oauth_client._SIGNING_SALT,
        )
        with self.assertRaises(ValueError):
            oauth_client.complete_callback(code="fake-code", state=fake_state)

    # ── refresh_if_needed ────────────────────────────────────────────────

    def test_refresh_if_needed_true_for_non_oauth2_server(self):
        static_server = MCPServer.objects.create(
            company=self.company, name="Static", transport=MCPServer.Transport.HTTP,
            url="http://x.example/mcp", auth_type=MCPServer.AuthType.STATIC_SECRETS,
        )
        with patch("intelligence.oauth_client.OAuth2Client.refresh_token") as mock_refresh:
            self.assertTrue(oauth_client.refresh_if_needed(static_server))
            mock_refresh.assert_not_called()   # must not even try -- proves the early-return works

    def test_refresh_if_needed_false_when_never_connected(self):
        # no refresh_token in secrets at all
        self.assertFalse(oauth_client.refresh_if_needed(self.server))

    def test_refresh_if_needed_true_when_still_valid_skips_network(self):
        from django.utils import timezone
        from datetime import timedelta

        self.server.set_secrets({"refresh_token": "still-good", "client_secret": "test-client-secret"})
        self.server.oauth_config["expires_at"] = (timezone.now() + timedelta(hours=1)).isoformat()
        self.server.save()

        with patch("intelligence.oauth_client.OAuth2Client.refresh_token") as mock_refresh:
            self.assertTrue(oauth_client.refresh_if_needed(self.server))
            mock_refresh.assert_not_called()   # proves the 60s-buffer check actually skips the call

    @patch("intelligence.oauth_client.OAuth2Client.refresh_token")
    def test_refresh_if_needed_refreshes_when_expired(self, mock_refresh):
        from django.utils import timezone
        from datetime import timedelta

        self.server.set_secrets({"refresh_token": "old-refresh", "client_secret": "test-client-secret"})
        self.server.oauth_config["expires_at"] = (timezone.now() - timedelta(seconds=1)).isoformat()
        self.server.save()

        mock_refresh.return_value = {"access_token": "new-access-token", "expires_in": 3600}
        self.assertTrue(oauth_client.refresh_if_needed(self.server))

        self.server.refresh_from_db()
        self.assertEqual(self.server.get_secrets()["FAKE_PROVIDER_TOKEN"], "new-access-token")
        self.assertEqual(self.server.get_secrets()["refresh_token"], "old-refresh")  # preserved, provider omitted it

    @patch("intelligence.oauth_client.OAuth2Client.refresh_token", side_effect=Exception("invalid_grant"))
    def test_refresh_if_needed_false_when_provider_rejects(self, mock_refresh):
        from django.utils import timezone
        from datetime import timedelta

        self.server.set_secrets({"refresh_token": "dead-refresh-token"})
        self.server.oauth_config["expires_at"] = (timezone.now() - timedelta(seconds=1)).isoformat()
        self.server.save()

        self.assertFalse(oauth_client.refresh_if_needed(self.server))

    # ── _store_token ─────────────────────────────────────────────────────

    def test_store_token_preserves_refresh_token_when_response_omits_it(self):
        oauth_client._store_token(self.server, {"access_token": "t1", "refresh_token": "r1", "expires_in": 3600})
        oauth_client._store_token(self.server, {"access_token": "t2"})  # no refresh_token this time
        secrets = self.server.get_secrets()
        self.assertEqual(secrets["FAKE_PROVIDER_TOKEN"], "t2")
        self.assertEqual(secrets["refresh_token"], "r1")   # unchanged from the first call