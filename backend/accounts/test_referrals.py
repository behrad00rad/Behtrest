from django.contrib.auth import get_user_model
from django.test import TestCase, override_settings
from .tests import AccountTests, PASSWORD
from .models import RegistrationPolicy, Referral, ReferralRedemption


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
