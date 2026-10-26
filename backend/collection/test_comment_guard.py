import json
from datetime import timedelta
from django.contrib.auth import get_user_model
from django.test import override_settings
from django.utils import timezone
from .models import Comment, Post
from .tests import MediaTestCase

@override_settings(API_RATE_LIMITS_ENABLED=False)
class CommentGuardTests(MediaTestCase):
    def setUp(self):
        super().setUp()
        self.user = get_user_model().objects.create_user('commenter', 'commenter@example.invalid', password='Example!Garden945')
        self.pin = Post.objects.create(owner=self.user, title='An idea', image=self.image(), moderation_status='approved')
        self.client.force_login(self.user)
        self.path = f'/api/posts/{self.pin.pk}/comments/'

    def send(self, text):
        return self.client.post(self.path, json.dumps({'text': text}), content_type='application/json')

    def test_trim_minimum_and_duplicate_window(self):
        self.assertEqual(self.send(' x ').status_code, 400)
        self.assertEqual(self.send('  A useful detail  ').status_code, 201)
        self.assertEqual(Comment.objects.get().text, 'A useful detail')
        self.assertEqual(self.send('A useful detail').status_code, 429)
        Comment.objects.update(created_at=timezone.now() - timedelta(seconds=61))
        self.assertEqual(self.send('A useful detail').status_code, 201)

    def test_latest_first_total_and_pagination(self):
        for n in range(4):
            Comment.objects.create(post=self.pin, author=self.user, text=f'Thought {n}')
        data = self.client.get(self.path + '?page_size=2').json()['data']
        self.assertEqual(data['total'], 4)
        self.assertEqual([c['text'] for c in data['items']], ['Thought 3', 'Thought 2'])
        next_page = self.client.get(self.path, {'page_size': 2, 'cursor': data['next_cursor']}).json()['data']
        self.assertEqual([c['text'] for c in next_page['items']], ['Thought 1', 'Thought 0'])
