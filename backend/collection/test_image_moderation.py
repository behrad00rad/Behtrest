import json
import tempfile
import uuid
from datetime import timedelta
from django.conf import settings
from django.contrib.auth import get_user_model
from django.contrib.auth.models import Permission
from django.core.files.storage import default_storage
from django.test import Client, override_settings
from django.utils import timezone
from messaging.models import Conversation, Membership
from .models import Post, ImageScan, ContentReport, Follow, ActivityNotification, ModerationLog
from .tests import MediaTestCase
from .image_moderation import run_one, storage, finish, Detector, decision


class FakeDetector:
    def __init__(self, score): self.score = score
    def predict(self, data):
        if isinstance(self.score, Exception): raise self.score
        return {'FEMALE_BREAST_EXPOSED': self.score}


@override_settings(IMAGE_MODERATION_ENABLED=True, API_RATE_LIMITS_ENABLED=False, PASSWORD_HASHERS=['django.contrib.auth.hashers.MD5PasswordHasher'])
class ImageModerationTests(MediaTestCase):
    @override_settings(IMAGE_UPLOADS_PER_DAY=1)
    def test_daily_quota_survives_deleted_upload(self):
        scan = self.upload()
        scan.post.delete()
        response = self.client.post('/api/posts/', {'image': self.image(), 'title': 'Second'}, HTTP_X_CSRFTOKEN=self.token)
        self.assertEqual(response.status_code, 429)
        self.assertEqual(Post.objects.filter(owner=self.owner).count(), 0)

    @override_settings(IMAGE_PENDING_PER_USER=1)
    def test_pending_quota_and_avatar_replacement(self):
        scan = self.upload(avatar=True)
        replaced = self.upload(avatar=True)
        scan.refresh_from_db()
        self.assertEqual(scan.status, 'canceled')
        self.assertNotEqual(scan.pk, replaced.pk)
        response = self.client.post('/api/posts/', {'image': self.image(), 'title': 'Queued'}, HTTP_X_CSRFTOKEN=self.token)
        self.assertEqual(response.status_code, 429)

    @override_settings(IMAGE_QUARANTINE_TOTAL_BYTES=1)
    def test_storage_quota_leaves_no_files_or_budget_consumption(self):
        from .models import ImageUploadUsage
        response = self.client.post('/api/posts/', {'image': self.image(), 'title': 'Too large'}, HTTP_X_CSRFTOKEN=self.token)
        self.assertEqual(response.status_code, 429)
        self.assertFalse(ImageScan.objects.exists())
        self.assertFalse(ImageUploadUsage.objects.exists())
    def setUp(self):
        super().setUp()
        root = tempfile.TemporaryDirectory()
        self.addCleanup(root.cleanup)
        override = override_settings(PRIVATE_MEDIA_ROOT=root.name, IMAGE_MODERATION_ENABLED=True)
        override.enable(); self.addCleanup(override.disable)
        users = get_user_model()
        self.owner = users.objects.create_user('image_owner', 'image-owner@example.invalid', 'testing')
        self.other = users.objects.create_user('image_other', 'image-other@example.invalid', 'testing')
        self.staff = users.objects.create_user('image_staff', 'image-staff@example.invalid', 'testing', is_staff=True)
        self.staff.user_permissions.add(Permission.objects.get(codename='review_reports'))
        self.client = Client(enforce_csrf_checks=True)
        self.login(self.owner)

    def login(self, user):
        self.client.force_login(user)
        self.token = self.client.get('/api/auth/session/').json()['data']['csrfToken']

    def write(self, path, data, status=200):
        response = self.client.post('/api' + path, json.dumps(data), content_type='application/json', HTTP_X_CSRFTOKEN=self.token)
        self.assertEqual(response.status_code, status, response.content)
        return response.json()['data'] if status < 400 else None

    def upload(self, avatar=False):
        response = self.client.post('/api/profile/avatar/' if avatar else '/api/posts/', {'image': self.image(), **({} if avatar else {'title': 'Private until checked', 'tags': 'quarantined'})}, HTTP_X_CSRFTOKEN=self.token)
        self.assertEqual(response.status_code, 202 if avatar else 201, response.content)
        return ImageScan.objects.order_by('-id').first()

    def test_pending_image_is_private_everywhere(self):
        scan = self.upload()
        self.assertFalse(scan.post.image)
        response = self.client.get(f'/api/image-scans/{scan.pk}/image/')
        self.assertEqual(response.status_code, 200); response.close()
        self.assertEqual(self.client.get('/api/feed/').json()['data']['items'], [])
        self.assertEqual(len(self.client.get('/api/feed/?owner=image_owner').json()['data']['items']), 1)
        self.upload()
        cursor = self.client.get('/api/feed/?owner=image_owner&page_size=1').json()['data']['next_cursor']
        self.login(self.other)
        self.assertEqual(self.client.get('/api/feed/', {'owner': 'image_owner', 'page_size': 1, 'cursor': cursor}).status_code, 400)
        self.assertEqual(self.client.get(f'/api/posts/{scan.post_id}/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/image-scans/{scan.pk}/image/').status_code, 404)
        self.assertEqual(self.client.get(f'/api/image-scans/{scan.pk}/').status_code, 404)
        self.assertEqual(self.client.get('/api/feed/?owner=image_owner').json()['data']['items'], [])
        self.assertNotIn('quarantined', self.client.get('/api/tags/').json()['data']['items'])
        self.assertEqual(self.client.get(f'/api/posts/{scan.post_id}/comments/').status_code, 404)
        group = Conversation.objects.create(kind='group')
        Membership.objects.create(conversation=group, user=self.other, accepted=True)
        self.write(f'/chat/conversations/{group.pk}/messages/', {'client_id': str(uuid.uuid4()), 'text': '', 'pin_id': scan.post_id}, 404)

    def test_approval_publishes_and_notifies_once(self):
        Follow.objects.create(follower=self.other, target=self.owner)
        scan = self.upload()
        self.assertEqual(ActivityNotification.objects.count(), 0)
        self.assertTrue(run_one(FakeDetector(0.01)))
        scan.refresh_from_db(); scan.post.refresh_from_db()
        self.assertEqual(scan.status, 'approved')
        self.assertEqual(scan.post.moderation_status, 'approved')
        self.assertTrue(default_storage.exists(scan.post.image.name))
        self.assertEqual(ActivityNotification.objects.count(), 1)
        self.assertFalse(run_one(FakeDetector(0.01)))
        self.login(self.other)
        self.assertEqual(self.client.get(f'/api/posts/{scan.post_id}/').status_code, 200)

    def test_rejection_and_appeal_require_moderator(self):
        scan = self.upload(); run_one(FakeDetector(0.95))
        scan.refresh_from_db(); self.assertEqual(scan.status, 'rejected')
        report = ContentReport.objects.get(kind='image', target_id=scan.pk)
        self.write(f'/moderation/{report.pk}/', {'action': 'approve_image', 'reason': 'Not staff'}, 403)
        self.write(f'/image-scans/{scan.pk}/appeal/', {})
        report.refresh_from_db(); self.assertEqual(report.status, 'open')
        self.login(self.staff)
        self.write(f'/moderation/{report.pk}/', {'action': 'approve_image', 'reason': 'Reviewed false positive'})
        scan.refresh_from_db(); self.assertEqual(scan.status, 'approved')
        self.assertEqual(ModerationLog.objects.filter(report=report, action='approve_image').count(), 1)

    def test_uncertain_is_not_public_and_manual_restore_cannot_bypass(self):
        scan = self.upload(); run_one(FakeDetector(0.5))
        report = ContentReport.objects.get(kind='image', target_id=scan.pk)
        self.assertEqual(report.status, 'open')
        self.login(self.staff)
        self.write(f'/moderation/{report.pk}/', {'action': 'restore', 'reason': 'Wrong action'}, 400)
        self.write(f'/moderation/{report.pk}/', {'action': 'reject_image', 'reason': 'Confirmed nudity'})
        scan.refresh_from_db(); self.assertEqual(scan.status, 'rejected')
        self.assertFalse(scan.post.image)

    def test_scanner_failure_retries_without_publishing(self):
        scan = self.upload(); run_one(FakeDetector(RuntimeError('No scanner')))
        scan.refresh_from_db()
        self.assertEqual(scan.status, 'pending'); self.assertFalse(scan.post.image)
        self.assertGreater(scan.retry_at, timezone.now())
        self.assertFalse(run_one(FakeDetector(0.01)))

    def test_expired_lease_reclaimed_stale_worker_cannot_publish(self):
        scan = self.upload(); old = uuid.uuid4()
        ImageScan.objects.filter(pk=scan.pk).update(status='scanning', token=old, lease=timezone.now() - timedelta(seconds=1))
        run_one(FakeDetector(0.99))
        finish(scan.pk, old, 'approved', {})
        scan.refresh_from_db(); self.assertEqual(scan.status, 'rejected')
        self.assertFalse(scan.post.image)

    def test_avatar_replacement_cancels_old_job(self):
        old = self.upload(avatar=True)
        latest = self.upload(avatar=True)
        old.refresh_from_db(); self.assertEqual(old.status, 'canceled')
        self.owner.profile.refresh_from_db(); self.assertFalse(self.owner.profile.avatar)
        session = self.client.get('/api/auth/session/').json()['data']['user']
        self.assertEqual(session['profile']['avatar_scan']['id'], latest.pk)
        run_one(FakeDetector(0.01))
        self.owner.profile.refresh_from_db(); self.assertTrue(self.owner.profile.avatar)
        self.assertTrue(default_storage.exists(self.owner.profile.avatar.name))

    def test_canceling_avatar_prevents_late_approval(self):
        scan = self.upload(avatar=True)
        token = uuid.uuid4()
        ImageScan.objects.filter(pk=scan.pk).update(status='scanning', token=token)
        response = self.client.delete('/api/profile/avatar/remove/', HTTP_X_CSRFTOKEN=self.token)
        self.assertEqual(response.status_code, 200)
        finish(scan.pk, token, 'approved', {})
        self.owner.profile.refresh_from_db(); self.assertFalse(self.owner.profile.avatar)

    def test_pin_delete_removes_quarantine(self):
        scan = self.upload()
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.client.delete(f'/api/posts/{scan.post_id}/', HTTP_X_CSRFTOKEN=self.token).status_code, 200)
        self.assertFalse(storage().exists(scan.original)); self.assertFalse(ImageScan.objects.filter(pk=scan.pk).exists())

    def test_policy_thresholds_and_invalid_output(self):
        self.assertEqual(decision({'x': 0.8}), 'rejected')
        self.assertEqual(decision({'x': 0.4}), 'review')
        with self.assertRaises(ValueError): decision({'x': float('nan')})
        with self.assertRaises(ValueError): decision({'x': 0.01, 'y': float('nan')})
        with override_settings(IMAGE_MODERATION_MODEL='/missing/model.onnx'):
            with self.assertRaises(FileNotFoundError): Detector()

    def test_pending_review_queue_access_and_manual_approval(self):
        scan = self.upload()
        self.assertEqual(self.client.get('/api/moderation/images/').status_code, 403)
        self.write(f'/image-scans/{scan.pk}/review/', {}, 403)
        self.login(self.staff)
        self.assertEqual(self.client.get('/api/moderation/images/').json()['data']['items'][0]['id'], scan.pk)
        report = self.write(f'/image-scans/{scan.pk}/review/', {})
        self.write(f'/moderation/{report["id"]}/', {'action': 'approve_image', 'reason': 'Manual review during scanner outage'})
        self.assertFalse(run_one(FakeDetector(0.99)))
        scan.refresh_from_db(); self.assertEqual(scan.status, 'approved')
