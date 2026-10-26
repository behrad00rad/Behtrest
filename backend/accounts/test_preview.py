import io
import json
import tempfile
from pathlib import Path
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import Client, TestCase, override_settings
from PIL import Image

from collection.models import Board, Follow, Post, SavedPost
from messaging.models import Membership, Message
from .models import RegistrationPolicy


@override_settings(API_RATE_LIMITS_ENABLED=False)
class PreviewTests(TestCase):
    def setUp(self):
        self.client = Client(enforce_csrf_checks=True)

    def send(self, path, data=None, client=None):
        client = client or self.client
        token = client.get('/api/auth/session/').json()['data']['csrfToken']
        return client.post(path, json.dumps(data or {}), content_type='application/json', HTTP_X_CSRFTOKEN=token)

    def test_guest_is_disabled_in_normal_app(self):
        self.assertFalse(self.client.get('/api/auth/session/').json()['data']['previewMode'])
        self.assertEqual(self.send('/api/auth/guest/').status_code, 404)
        self.assertFalse(get_user_model().objects.exists())
        with self.assertRaises(CommandError):
            call_command('seed_preview', stdout=io.StringIO())

    @override_settings(PREVIEW_MODE=True)
    def test_guest_requires_csrf_and_gets_separate_non_admin_identity(self):
        self.assertEqual(self.client.post('/api/auth/guest/', '{}', content_type='application/json').status_code, 403)
        first = self.send('/api/auth/guest/').json()['data']['user']
        second = self.send('/api/auth/guest/', client=Client(enforce_csrf_checks=True)).json()['data']['user']
        self.assertNotEqual(first['id'], second['id'])
        self.assertEqual(self.send('/api/auth/guest/').json()['data']['user']['id'], first['id'])
        user = get_user_model().objects.get(pk=first['id'])
        self.assertFalse(user.has_usable_password())
        self.assertFalse(user.is_staff)
        self.assertFalse(user.is_superuser)
        self.assertEqual(Board.objects.filter(owner=user).count(), 1)
        self.assertFalse(first['can_moderate'])
        self.assertFalse(first['can_manage_referrals'])

    @override_settings(PREVIEW_MODE=True, AUTH_PASSWORD_VALIDATORS=[{'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 6}}])
    def test_simple_signup_ignores_referral_policy_but_validates_password_and_username(self):
        RegistrationPolicy.objects.create(invite_required=True)
        self.assertFalse(self.client.get('/api/auth/registration-policy/').json()['data']['invite_required'])
        self.assertEqual(self.send('/api/auth/register/', {'username': 'new_friend', 'password1': 'tiny'}).status_code, 400)
        response = self.send('/api/auth/register/', {'username': 'New_Friend', 'password1': 'simple123'})
        self.assertEqual(response.status_code, 201, response.content)
        user = get_user_model().objects.get(username='new_friend')
        self.assertTrue(user.check_password('simple123'))
        self.assertTrue(user.email.endswith('@preview.invalid'))
        self.assertFalse(user.is_staff)
        self.assertEqual(self.send('/api/auth/register/', {'username': 'NEW_FRIEND', 'password1': 'simple123'}).status_code, 400)
        self.assertEqual(self.send('/api/auth/login/', {'username': 'new_friend', 'password': 'simple123'}).status_code, 200)

    @override_settings(PREVIEW_MODE=True)
    def test_guest_has_sample_collection_follow_and_conversation(self):
        guide = get_user_model().objects.create_user('preview_maya', 'maya@preview.invalid')
        response = self.send('/api/auth/guest/')
        self.assertEqual(response.status_code, 200, response.content)
        user_id = response.json()['data']['user']['id']
        self.assertTrue(Follow.objects.filter(follower_id=user_id, target=guide).exists())
        self.assertEqual(Membership.objects.filter(user_id=user_id, accepted=True).count(), 1)
        self.assertIn('sample conversation', Message.objects.get(sender=guide).text)

    @override_settings(PREVIEW_MODE=True, AUTH_PASSWORD_VALIDATORS=[{'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator', 'OPTIONS': {'min_length': 6}}])
    def test_guest_upgrade_preserves_identity_and_starter_board(self):
        guest = self.send('/api/auth/guest/').json()['data']['user']
        self.assertTrue(guest['is_guest'])
        board = Board.objects.get(owner_id=guest['id'])
        response = self.send('/api/auth/register/', {'username': 'my_playground', 'password1': 'simple123'})
        self.assertEqual(response.status_code, 201, response.content)
        account = response.json()['data']['user']
        self.assertEqual(account['id'], guest['id'])
        self.assertFalse(account['is_guest'])
        self.assertEqual(account['username'], 'my_playground')
        self.assertTrue(Board.objects.filter(pk=board.pk, owner_id=account['id']).exists())

    @override_settings(PREVIEW_MODE=True)
    def test_photo_seed_is_repeatable_and_keeps_source_credit(self):
        from collection.preview_catalog import PHOTOS
        with tempfile.TemporaryDirectory() as directory:
            cache = Path(directory) / 'cache'
            cache.mkdir()
            Image.new('RGB', (800, 1000), '#367b9a').save(cache / '10.jpg')
            (cache / '10.json').write_text(json.dumps({'author': 'Sample Photographer', 'url': 'https://unsplash.com/photos/example'}))
            with override_settings(MEDIA_ROOT=Path(directory) / 'media', PREVIEW_PHOTO_CACHE=cache), patch('collection.management.commands.seed_preview.PHOTOS', PHOTOS[:1]):
                call_command('seed_preview', stdout=io.StringIO())
                call_command('seed_preview', stdout=io.StringIO())
                self.assertEqual(Post.objects.count(), 1)
                post = Post.objects.get()
                self.assertIn('Sample Photographer', post.description)
                self.assertEqual(post.source_url, 'https://unsplash.com/photos/example')
                self.assertTrue(Path(post.image.path).exists())
                self.assertEqual(get_user_model().objects.count(), 4)
                self.assertEqual(Board.objects.count(), 8)
                self.assertEqual(SavedPost.objects.count(), 1)
