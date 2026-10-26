import json

from django.contrib.auth import get_user_model
from django.test import Client, TestCase, override_settings

from collection.models import Post, Tag


@override_settings(API_RATE_LIMITS_ENABLED=False)
class InterestTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user('curious', 'curious@example.invalid', 'Curious!Garden29')
        self.client = Client(enforce_csrf_checks=True)
        self.client.force_login(self.user)
        self.token = self.client.get('/api/auth/session/').json()['data']['csrfToken']
        self.tags = [Tag.objects.create(name=name) for name in ['nature', 'architecture', 'coffee', 'travel']]
        self.posts = []
        for index, tag in enumerate(self.tags):
            post = Post.objects.create(owner=self.user, title=f'Idea {index}', image='fixture.webp', thumbnail='thumb.webp', image_width=800, image_height=600)
            post.tags.add(tag)
            self.posts.append(post)

    def save(self, value):
        return self.client.patch('/api/auth/interests/', json.dumps({'interests': value}), content_type='application/json', HTTP_X_CSRFTOKEN=self.token)

    def test_interests_require_authentication_csrf_and_three_existing_tags(self):
        anonymous = Client(enforce_csrf_checks=True)
        token = anonymous.get('/api/auth/session/').json()['data']['csrfToken']
        self.assertEqual(anonymous.patch('/api/auth/interests/', '{}', content_type='application/json', HTTP_X_CSRFTOKEN=token).status_code, 401)
        self.assertEqual(self.client.patch('/api/auth/interests/', '{}', content_type='application/json').status_code, 403)
        for value in ['nature', 'nature,coffee,unknown', 'nature,nature,coffee', 'x' * 701, None]:
            self.assertEqual(self.save(value).status_code, 400)
        self.assertEqual(self.user.profile.interests, [])

    def test_saved_interests_survive_new_session_and_only_update_current_user(self):
        response = self.save('nature,coffee,architecture')
        self.assertEqual(response.status_code, 200, response.content)
        expected = ['architecture', 'coffee', 'nature']
        self.user.profile.refresh_from_db()
        self.assertEqual(self.user.profile.interests, expected)
        self.assertEqual(self.client.get('/api/auth/session/').json()['data']['user']['profile']['interests'], expected)
        client = Client()
        client.force_login(self.user)
        self.assertEqual(client.get('/api/auth/session/').json()['data']['user']['profile']['interests'], expected)

    def test_feed_matches_any_interest_without_duplicates_and_binds_cursor(self):
        self.posts[0].tags.add(self.tags[1])
        self.posts[3].is_hidden = True
        self.posts[3].save(update_fields=['is_hidden'])
        response = self.client.get('/api/feed/?interests=nature,architecture,coffee&page_size=1')
        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()['data']
        ids = [item['id'] for item in data['items']]
        cursor = data['next_cursor']
        mismatch = self.client.get('/api/feed/', {'interests': 'travel', 'cursor': cursor, 'page_size': 1})
        self.assertEqual(mismatch.status_code, 400)
        while cursor:
            data = self.client.get('/api/feed/', {'interests': 'nature,architecture,coffee', 'cursor': cursor, 'page_size': 1}).json()['data']
            ids.extend(item['id'] for item in data['items'])
            cursor = data['next_cursor']
        self.assertCountEqual(ids, [post.pk for post in self.posts[:3]])
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(self.client.get('/api/feed/?interests=bad!').status_code, 400)

    def test_hidden_only_tags_cannot_be_selected(self):
        self.posts[3].moderation_status = 'pending'
        self.posts[3].save(update_fields=['moderation_status'])
        self.assertEqual(self.save('nature,coffee,travel').status_code, 400)
