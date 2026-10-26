import json
import tempfile
from pathlib import Path
from django.contrib.auth import get_user_model
from django.test import Client, override_settings
from .models import Board, Comment, CommentLike, Post, SavedPost
from .tests import MediaTestCase


@override_settings(API_RATE_LIMITS_ENABLED=False)
class PinActionTests(MediaTestCase):
    def setUp(self):
        super().setUp()
        User = get_user_model()
        self.owner = User.objects.create_user('creator', 'creator@example.invalid')
        self.viewer = User.objects.create_user('viewer', 'viewer@example.invalid')
        self.pin = Post.objects.create(owner=self.owner, title='A Calm Place!', image=self.image(), source_url='https://example.com/photo')
        self.comment = Comment.objects.create(post=self.pin, author=self.owner, text='The afternoon light makes this feel inviting.')
        self.client = Client(enforce_csrf_checks=True)
        self.login(self.viewer)

    def login(self, user):
        self.client.force_login(user)
        self.token = self.client.get('/api/auth/session/').json()['data']['csrfToken']

    def send(self, path, body=None, method='post'):
        return getattr(self.client, method)(path, json.dumps(body or {}), content_type='application/json', HTTP_X_CSRFTOKEN=self.token)

    def test_download_streams_full_image_and_slug_filename(self):
        response = self.client.get(f'/api/pins/{self.pin.pk}/download')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.streaming)
        self.assertEqual(response['Content-Disposition'], 'attachment; filename="a-calm-place.png"')
        with self.pin.image.open('rb') as image:
            self.assertEqual(b''.join(response.streaming_content), image.read())
        response.close()

    async def test_asgi_download_uses_bounded_async_chunks(self):
        from django.test import AsyncClient
        response = await AsyncClient().get(f'/api/pins/{self.pin.pk}/download')
        self.assertEqual(response.status_code, 200)
        self.assertTrue(response.is_async)
        chunks = [chunk async for chunk in response.streaming_content]
        self.assertTrue(chunks)
        self.assertTrue(all(len(chunk) <= 64 * 1024 for chunk in chunks))
        with self.pin.image.open('rb') as image:
            self.assertEqual(b''.join(chunks), image.read())
        response.close()

    def test_download_disabled_and_hidden_or_pending_pins_are_unavailable(self):
        for field, value in [('allow_download', False), ('is_hidden', True), ('moderation_status', 'pending')]:
            Post.objects.filter(pk=self.pin.pk).update(**{field: value})
            self.assertEqual(self.client.get(f'/api/pins/{self.pin.pk}/download').status_code, 404)
            Post.objects.filter(pk=self.pin.pk).update(allow_download=True, is_hidden=False, moderation_status='approved')

    @override_settings(API_RATE_LIMITS_ENABLED=True)
    def test_get_download_rate_limit(self):
        for _ in range(30):
            response = self.client.get(f'/api/pins/{self.pin.pk}/download')
            self.assertEqual(response.status_code, 200)
            response.close()
        response = self.client.get(f'/api/pins/{self.pin.pk}/download')
        self.assertEqual(response.status_code, 429)
        self.assertIn('Retry-After', response)

    def test_download_obeys_blocks(self):
        from messaging.models import Block
        Block.objects.create(user=self.owner, target=self.viewer)
        self.assertEqual(self.client.get(f'/api/pins/{self.pin.pk}/download').status_code, 404)

    def test_create_default_and_explicit_download_permission(self):
        for extra, expected in [({}, True), ({'allow_download':'false'}, False)]:
            response = self.client.post('/api/posts/', {'title':'An idea','image':self.image(),**extra}, HTTP_X_CSRFTOKEN=self.token)
            self.assertEqual(response.status_code, 201, response.content)
            self.assertIs(response.json()['data']['allow_download'], expected)

    def test_only_owner_can_edit_permission_and_invalid_booleans_fail(self):
        path = f'/api/posts/{self.pin.pk}/'
        self.assertEqual(self.send(path, {'allow_download':False}, 'patch').status_code, 404)
        self.login(self.owner)
        response = self.send(path, {'allow_download':False}, 'patch')
        self.assertEqual(response.status_code, 200, response.content)
        self.assertFalse(response.json()['data']['allow_download'])
        self.assertEqual(self.send(path, {'allow_download':'false'}, 'patch').status_code, 400)

    def test_comment_likes_are_idempotent_and_serialized_for_viewer(self):
        path = f'/api/comments/{self.comment.pk}/likes/'
        for _ in range(2):
            self.assertEqual(self.send(path).json()['data'], {'liked':True,'like_count':1})
        item = self.client.get(f'/api/posts/{self.pin.pk}/comments/').json()['data']['items'][0]
        self.assertTrue(item['liked']); self.assertEqual(item['like_count'], 1)
        self.assertEqual(CommentLike.objects.count(), 1)
        self.assertEqual(self.send(path, method='delete').json()['data'], {'liked':False,'like_count':0})
        self.assertEqual(self.send(path, method='delete').json()['data']['like_count'], 0)

    def test_comment_likes_require_csrf_and_visibility(self):
        path = f'/api/comments/{self.comment.pk}/likes/'
        self.assertEqual(self.client.post(path, '{}', content_type='application/json').status_code, 403)
        self.comment.is_hidden=True; self.comment.save()
        self.assertEqual(self.send(path).status_code, 404)

    def test_save_receipt_distinguishes_existing_save_for_safe_undo(self):
        board = Board.objects.create(owner=self.viewer, name='Weekend ideas')
        path = f'/api/boards/{board.pk}/saves/'
        self.assertTrue(self.send(path, {'post_id':self.pin.pk}).json()['data']['created'])
        self.assertFalse(self.send(path, {'post_id':self.pin.pk}).json()['data']['created'])
        self.assertEqual(self.send(f'{path}{self.pin.pk}/', method='delete').status_code, 200)
        self.assertFalse(SavedPost.objects.filter(board=board).exists())

    def test_link_preview_html_is_escaped_and_uses_public_pin(self):
        with tempfile.TemporaryDirectory() as folder:
            Path(folder,'index.html').write_text('<html><head><title>Behtrest</title></head><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>')
            with override_settings(FRONTEND_DIST=folder):
                self.pin.title='Blue <script>alert(1)</script> "sky"'; self.pin.save()
                response=self.client.get(f'/pin/{self.pin.pk}')
                self.assertEqual(response.status_code, 200)
                content=response.content.decode()
                self.assertIn('property="og:title"', content)
                self.assertIn('name="twitter:card" content="summary_large_image"', content)
                self.assertNotIn('<script>alert(1)</script>', content)
                self.assertIn('&lt;script&gt;', content)
                self.assertIn('/assets/app.js',content)
                self.pin.is_hidden=True;self.pin.save()
                self.assertEqual(self.client.get(f'/pin/{self.pin.pk}').status_code,404)
                self.assertEqual(self.client.get(f'/api/pins/{self.pin.pk}/metadata/').status_code,404)
