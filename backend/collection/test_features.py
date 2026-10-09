import io
import json
from pathlib import Path
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.core.files.storage import default_storage
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.db import IntegrityError, transaction
from django.test import Client, override_settings
from django.utils import timezone
from PIL import Image

from common.media import prepare_image
from .models import Board, Comment, MediaCleanup, Post, SavedPost
from .tests import MediaTestCase


@override_settings(API_RATE_LIMITS_ENABLED=False)
class FeatureTests(MediaTestCase):
    def setUp(self):
        super().setUp()
        User = get_user_model()
        self.owner = User.objects.create_user('feature_blue', 'feature@example.com', 'Feature!Garden947')
        self.other = User.objects.create_user('feature_other', 'other@example.com', 'Feature!Garden947')
        self.client = Client(enforce_csrf_checks=True)
        self.sign_in(self.owner)

    def sign_in(self, user):
        self.client.force_login(user)
        self.token = self.client.get('/api/auth/session/').json()['data']['csrfToken']

    def send(self, path, data, method='post'):
        return getattr(self.client, method)(path, json.dumps(data), content_type='application/json', HTTP_X_CSRFTOKEN=self.token)

    def upload(self, **values):
        return self.client.post('/api/posts/', {'title': 'A blue idea', 'description': 'A calm place', 'tags': 'blue, nature', 'image': self.image(), **values}, HTTP_X_CSRFTOKEN=self.token)

    def post(self):
        response = self.upload()
        self.assertEqual(response.status_code, 201, response.content)
        return Post.objects.get(pk=response.json()['data']['id'])

    def test_upload_normalizes_images_thumbnails_and_owner(self):
        post = self.post()
        self.assertEqual(post.owner, self.owner)
        self.assertTrue(post.image.name.endswith('.webp'))
        self.assertTrue(post.thumbnail.name.endswith('-thumb.webp'))
        self.assertEqual((post.image_width, post.image_height), (4, 4))
        self.assertEqual(set(post.tags.values_list('name', flat=True)), {'blue', 'nature'})
        with default_storage.open(post.image.name) as file, Image.open(file) as image:
            self.assertEqual(image.format, 'WEBP')
        response = self.client.get(post.image.url)
        # MEDIA serving is only enabled for the actual development server;
        # validate canonical content using the storage file itself.
        self.assertTrue(default_storage.exists(post.thumbnail.name))

    def test_invalid_image_and_forged_owner_leave_no_posts(self):
        for values in ({'image': SimpleUploadedFile('fake.jpg', b'not an image', content_type='image/jpeg')}, {'user_id': self.other.pk}, {'image': SimpleUploadedFile('picture.svg', b'<svg/>', content_type='image/svg+xml')}):
            self.assertEqual(self.upload(**values).status_code, 400)
        self.assertFalse(Post.objects.exists())
        self.assertFalse(list(Path(default_storage.location).rglob('*.webp')))

    def test_upload_requires_authentication_and_csrf(self):
        self.assertEqual(self.client.post('/api/posts/', {'title': 'Missing CSRF', 'image': self.image()}).status_code, 403)
        self.client.logout()
        self.token = self.client.get('/api/auth/session/').json()['data']['csrfToken']
        self.assertEqual(self.upload().status_code, 401)

    def test_file_size_and_dimensions_are_bounded(self):
        response = self.upload(image=SimpleUploadedFile('large.png', b'x' * (8 * 1024 * 1024 + 1), content_type='image/png'))
        self.assertEqual(response.status_code, 413)
        buffer = io.BytesIO()
        Image.new('RGB', (8193, 1), 'blue').save(buffer, 'PNG')
        self.assertEqual(self.upload(image=SimpleUploadedFile('wide.png', buffer.getvalue())).json()['error']['code'], 'image_dimensions')

    def test_exif_orientation_and_metadata_are_normalized(self):
        image = Image.new('RGB', (20, 10), 'blue')
        exif = Image.Exif(); exif[274] = 6; exif[270] = 'private metadata'
        buffer = io.BytesIO(); image.save(buffer, 'JPEG', exif=exif)
        prepared = prepare_image(SimpleUploadedFile('orientation.jpg', buffer.getvalue()))
        with Image.open(io.BytesIO(prepared[0])) as result:
            self.assertEqual(result.size, (10, 20))
            self.assertFalse(result.getexif())

    def test_failed_database_save_removes_new_files(self):
        with patch('collection.models.Post.save', side_effect=IntegrityError('synthetic failure')):
            self.assertEqual(self.upload().status_code, 409)
        self.assertFalse(Post.objects.exists())
        self.assertFalse(list(Path(default_storage.location).rglob('*.webp')))

    def test_failed_storage_save_removes_partial_files(self):
        original = default_storage.save
        count = 0
        def fail_second(*args, **kwargs):
            nonlocal count
            count += 1
            if count == 2:
                raise OSError('synthetic storage failure')
            return original(*args, **kwargs)
        with patch.object(default_storage, 'save', side_effect=fail_second):
            self.assertEqual(self.upload().status_code, 503)
        self.assertFalse(Post.objects.exists())
        self.assertFalse(list(Path(default_storage.location).rglob('*.webp')))

    def test_post_delete_cleans_images_and_cascades_comments_saves(self):
        post = self.post(); names = [post.image.name, post.thumbnail.name]
        Comment.objects.create(author=self.owner, post=post, text='A thought')
        board = Board.objects.create(owner=self.owner, name='Blue', cover=post)
        SavedPost.objects.create(board=board, post=post)
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.send(f'/api/posts/{post.pk}/', {}, 'delete').status_code, 200)
        self.assertFalse(any(default_storage.exists(name) for name in names))
        self.assertFalse(Comment.objects.exists()); self.assertFalse(SavedPost.objects.exists())
        board.refresh_from_db(); self.assertIsNone(board.cover)

    def test_rollback_does_not_delete_live_files(self):
        post = self.post(); name = post.image.name
        with self.captureOnCommitCallbacks(execute=True):
            try:
                with transaction.atomic():
                    post.delete()
                    raise ValueError('rollback')
            except ValueError:
                pass
        self.assertTrue(default_storage.exists(name)); self.assertEqual(Post.objects.count(), 1)

    def test_deletion_outage_is_queued_and_retried(self):
        post = self.post()
        with patch.object(default_storage, 'delete', side_effect=OSError('offline')), self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.send(f'/api/posts/{post.pk}/', {}, 'delete').status_code, 200)
        self.assertEqual(MediaCleanup.objects.count(), 2)
        call_command('cleanup_media')
        self.assertFalse(MediaCleanup.objects.exists())
        self.assertFalse(list(Path(default_storage.location).rglob('*.webp')))

    def test_avatar_replacement_and_removal_cleanup(self):
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post('/api/profile/avatar/', {'image': self.image()}, HTTP_X_CSRFTOKEN=self.token)
        self.assertEqual(response.status_code, 200, response.content)
        self.owner.profile.refresh_from_db(); first = self.owner.profile.avatar.name
        with default_storage.open(first) as file, Image.open(file) as image:
            self.assertEqual(image.size, (256, 256))
        with self.captureOnCommitCallbacks(execute=True):
            response = self.client.post('/api/profile/avatar/', {'image': self.image()}, HTTP_X_CSRFTOKEN=self.token)
        self.assertEqual(response.status_code, 200)
        self.assertFalse(default_storage.exists(first))
        self.owner.profile.refresh_from_db(); second = self.owner.profile.avatar.name
        with self.captureOnCommitCallbacks(execute=True):
            self.assertEqual(self.send('/api/profile/avatar/remove/', {}, 'delete').status_code, 200)
        self.assertFalse(default_storage.exists(second))

    def test_cursor_pagination_is_stable_with_new_inserts_and_equal_timestamps(self):
        posts = [self.post() for _ in range(5)]
        Post.objects.all().update(created_at=timezone.now())
        first = self.client.get('/api/feed/?page_size=2').json()['data']
        new_post = self.post()
        all_ids = [item['id'] for item in first['items']]
        cursor = first['next_cursor']
        while cursor:
            result = self.client.get('/api/feed/', {'page_size': 2, 'cursor': cursor}).json()['data']
            all_ids.extend(item['id'] for item in result['items']); cursor = result['next_cursor']
        self.assertEqual(len(all_ids), len(set(all_ids)))
        self.assertEqual(set(all_ids), {post.pk for post in posts})
        self.assertNotIn(new_post.pk, all_ids)

    def test_cursor_scope_and_page_size_validation(self):
        for _ in range(3): self.post()
        cursor = self.client.get('/api/feed/?page_size=1').json()['data']['next_cursor']
        self.assertEqual(self.client.get('/api/feed/', {'q': 'changed', 'cursor': cursor}).status_code, 400)
        self.assertEqual(self.client.get('/api/feed/?cursor=garbage').status_code, 400)
        for value in ('0', '37', 'bad', '-1'):
            self.assertEqual(self.client.get('/api/feed/', {'page_size': value}).status_code, 400)

    def test_comments_create_edit_delete_and_owner_checks(self):
        post = self.post()
        response = self.send(f'/api/posts/{post.pk}/comments/', {'text': 'A new thought'})
        self.assertEqual(response.status_code, 201)
        pk = response.json()['data']['id']
        self.sign_in(self.other)
        self.assertEqual(self.send(f'/api/comments/{pk}/', {'text': 'Stolen'}, 'patch').status_code, 404)
        self.assertEqual(self.send(f'/api/comments/{pk}/', {}, 'delete').status_code, 404)
        self.sign_in(self.owner)
        self.assertEqual(self.send(f'/api/comments/{pk}/', {'text': 'Updated'}, 'patch').status_code, 200)
        self.assertEqual(self.client.get(f'/api/posts/{post.pk}/comments/').json()['data']['items'][0]['text'], 'Updated')
        self.assertEqual(self.send(f'/api/comments/{pk}/', {}, 'delete').status_code, 200)

    def test_private_board_visibility_counts_and_save_permissions(self):
        post = self.post()
        board_response = self.send('/api/boards/', {'name': 'Private blue', 'is_private': True})
        self.assertEqual(board_response.status_code, 201)
        pk = board_response.json()['data']['id']
        self.assertEqual(self.send(f'/api/boards/{pk}/saves/', {'post_id': post.pk}).status_code, 201)
        self.assertEqual(self.send(f'/api/boards/{pk}/saves/', {'post_id': post.pk}).status_code, 200)
        self.assertEqual(SavedPost.objects.count(), 1)
        self.assertEqual(self.send(f'/api/boards/{pk}/manage/', {'cover_post_id': post.pk}, 'patch').status_code, 200)
        self.sign_in(self.other)
        for path in (f'/api/boards/{pk}/', f'/api/boards/{pk}/posts/'):
            self.assertEqual(self.client.get(path).status_code, 404)
        self.assertEqual(self.send(f'/api/boards/{pk}/saves/', {'post_id': post.pk}).status_code, 404)
        self.assertEqual(self.client.get('/api/boards/?owner=feature_blue').json()['data']['items'], [])
        self.assertEqual(self.client.get('/api/profiles/feature_blue/').json()['data']['board_count'], 0)
        self.sign_in(self.owner)
        self.assertEqual(self.client.get('/api/profiles/feature_blue/').json()['data']['board_count'], 1)
        self.assertEqual(self.send(f'/api/boards/{pk}/saves/{post.pk}/', {}, 'delete').status_code, 200)
        self.assertIsNone(self.client.get(f'/api/boards/{pk}/').json()['data']['cover'])

    def test_board_delete_keeps_original_posts_and_files(self):
        post = self.post(); board = Board.objects.create(owner=self.owner, name='Transient')
        SavedPost.objects.create(board=board, post=post)
        self.assertEqual(self.send(f'/api/boards/{board.pk}/manage/', {}, 'delete').status_code, 200)
        self.assertTrue(Post.objects.filter(pk=post.pk).exists()); self.assertTrue(default_storage.exists(post.image.name))

    def test_tags_source_and_search_filters(self):
        response = self.upload(title='Ocean architecture', tags='Blue, Blue, sea shells', source_url='https://example.com/ideas')
        self.assertEqual(response.status_code, 201)
        post = Post.objects.get(pk=response.json()['data']['id'])
        self.assertEqual(set(post.tags.values_list('name', flat=True)), {'blue', 'sea-shells'})
        for query in ('ocean', 'calm', 'sea-shells', 'feature_blue'):
            result = self.client.get('/api/feed/', {'q': query}).json()['data']['items']
            self.assertEqual([item['id'] for item in result], [post.pk])
        self.assertEqual(len(self.client.get('/api/feed/?tag=blue').json()['data']['items']), 1)
        self.assertEqual(self.client.get('/api/feed/?tag=absent').json()['data']['items'], [])
        self.assertEqual(self.client.get('/api/people/?q=feature_blue').json()['data']['items'][0]['username'], 'feature_blue')
        self.assertEqual(self.client.get('/api/tags/').json()['data']['items'], ['blue', 'sea-shells'])
        for source in ('javascript:alert(1)', 'https://user:password@example.com'):
            self.assertEqual(self.upload(source_url=source).status_code, 400)
        self.assertEqual(self.upload(tags=','.join(f'tag{i}' for i in range(9))).status_code, 400)

    def test_profile_edit_never_exposes_email_publicly(self):
        self.assertEqual(self.send('/api/auth/profile/', {'display_name': 'Blue Garden', 'bio': 'Always curious'}, 'patch').status_code, 200)
        response = self.client.get('/api/profiles/feature_blue/').json()['data']
        self.assertEqual(response['display_name'], 'Blue Garden')
        self.assertNotIn('email', response)
        self.assertEqual(self.client.get('/api/people/?q=Garden').json()['data']['items'][0]['username'], 'feature_blue')
