from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from .tests import AccountTests, PASSWORD
from .models import RegistrationPolicy, Referral, ReferralRedemption
from django.contrib.admin.models import LogEntry


@override_settings(API_RATE_LIMITS_ENABLED=False)
class ReferralTests(TestCase):
    send = AccountTests.send
    register = AccountTests.register

    def setUp(self):
        AccountTests.setUp(self)
        self.owner = get_user_model().objects.create_user("inviter", "inviter@example.com", PASSWORD)
        self.referral = Referral.objects.create(user=self.owner)
        self.policy = RegistrationPolicy.objects.create(invite_required=True, referrals_per_user=1)

    # Keep referral scenarios separate from inherited baseline account tests.
    def test_invite_validation_and_consumption(self):
        self.assertEqual(self.register().status_code, 400)
        self.assertEqual(self.register(referral_code="wrong").status_code, 400)
        self.assertEqual(self.register(referral_code=self.referral.code, password2="bad").status_code, 400)
        self.referral.refresh_from_db()
        self.assertEqual(self.referral.used, 0)
        self.assertEqual(self.register(referral_code=self.referral.code).status_code, 201)
        self.assertEqual(self.register(username="another", email="another@example.com", referral_code=self.referral.code).status_code, 400)
        self.assertEqual(ReferralRedemption.objects.count(), 1)
        self.policy.referrals_per_user = 2
        self.policy.save()
        self.assertEqual(self.register(username="another", email="another@example.com", referral_code=self.referral.code).status_code, 201)

    def test_switch_off_and_existing_login(self):
        self.assertEqual(self.send("/api/auth/login/", {"username": "inviter", "password": PASSWORD}).status_code, 200)
        self.token = self.client.get("/api/auth/session/").json()["data"]["csrfToken"]
        self.policy.invite_required = False
        self.policy.save()
        self.assertEqual(self.register().status_code, 201)

    def test_inactive_inviter_and_zero_allowance(self):
        self.owner.is_active = False
        self.owner.save()
        self.assertEqual(self.register(referral_code=self.referral.code).status_code, 400)
        self.owner.is_active = True
        self.owner.save()
        self.policy.referrals_per_user = 0
        self.policy.save()
        self.assertEqual(self.register(referral_code=self.referral.code).status_code, 400)

    def test_private_codes_and_deleted_account_consumption(self):
        self.assertEqual(self.client.get("/api/auth/referrals/").status_code, 401)
        self.assertEqual(self.client.get("/api/auth/registration-policy/").json()["data"], {"invite_required": True})
        self.assertEqual(self.register(referral_code=self.referral.code).status_code, 201)
        code = self.client.get("/api/auth/referrals/").json()["data"]["code"]
        self.assertNotEqual(code, self.referral.code)
        get_user_model().objects.get(username="bluestudio").delete()
        self.referral.refresh_from_db()
        self.assertEqual(self.referral.used, 1)

    def test_admin_permissions_settings_overrides_and_rotation(self):
        path = '/api/auth/admin/referrals/settings/'
        self.assertEqual(self.client.get(path).status_code, 401)
        self.client.force_login(self.owner)
        self.token = self.client.get('/api/auth/session/').json()['data']['csrfToken']
        self.assertEqual(self.send(path, {'invite_required': False}, method='patch').status_code, 403)
        admin = get_user_model().objects.create_superuser('admin', 'admin@example.com', PASSWORD)
        self.client.force_login(admin)
        self.token = self.client.get('/api/auth/session/').json()['data']['csrfToken']
        self.assertEqual(self.send(path, {'referrals_per_user': True}, method='patch').status_code, 400)
        self.assertEqual(self.send(path, {'referrals_per_user': 2}, method='patch').status_code, 200)
        target = f'/api/auth/admin/referrals/members/{self.owner.pk}/'
        self.assertEqual(self.send(target, {'allowance_override': 0}, method='patch').status_code, 200)
        self.assertEqual(self.register(referral_code=self.referral.code).status_code, 400)
        self.assertEqual(self.send(target, {'allowance_override': None, 'enabled': False}, method='patch').status_code, 200)
        self.assertEqual(self.register(referral_code=self.referral.code).status_code, 400)
        self.assertEqual(self.send(target, {'enabled': True, 'regenerate': True}, method='patch').status_code, 200)
        old = self.referral.code
        self.referral.refresh_from_db()
        self.assertNotEqual(old, self.referral.code)
        self.assertEqual(self.register(referral_code=old).status_code, 400)
        self.assertEqual(self.register(referral_code=self.referral.code).status_code, 201)
        self.assertEqual(LogEntry.objects.count(), 4)

    def test_admin_changes_require_csrf(self):
        admin = get_user_model().objects.create_superuser('admin', 'admin@example.com', PASSWORD)
        self.client.force_login(admin)
        self.assertEqual(self.client.patch('/api/auth/admin/referrals/settings/', '{}', content_type='application/json').status_code, 403)
