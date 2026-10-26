import json

from django.contrib.auth import get_user_model
from django.db import IntegrityError, transaction
from django.test import Client, TestCase, override_settings

from .models import Post, PinLike, PinEvent, Tag, UserTagInterest, Board, SavedPost


@override_settings(API_RATE_LIMITS_ENABLED=False)
class PinTests(TestCase):
    def setUp(self):
        self.user = get_user_model().objects.create_user('pin_guest', 'pin@example.invalid')
        self.other = get_user_model().objects.create_user('pin_other', 'other@example.invalid')
        self.pin = Post.objects.create(owner=self.other, title='A calm place', image='fixture.webp', thumbnail='thumb.webp', image_width=800, image_height=600)
        self.client = Client(enforce_csrf_checks=True)
        self.client.force_login(self.user)
        self.token = self.client.get('/api/auth/session/').json()['data']['csrfToken']

    def send(self, path, data=None, method='post'):
        return getattr(self.client, method)(path, json.dumps(data or {}), content_type='application/json', HTTP_X_CSRFTOKEN=self.token)

    def test_like_is_idempotent_and_counter_tracks_account_deletion(self):
        url = f'/api/pins/{self.pin.pk}/likes/'
        for _ in range(2):
            response = self.send(url)
            self.assertEqual(response.status_code, 200, response.content)
            self.assertEqual(response.json()['data'], {'liked': True, 'like_count': 1})
        self.assertEqual(PinLike.objects.count(), 1)
        with self.assertRaises(IntegrityError), transaction.atomic():
            PinLike.objects.create(user=self.user, pin=self.pin)
        self.user.delete()
        self.pin.refresh_from_db(fields=['like_count'])
        self.assertEqual(self.pin.like_count, 0)

    def test_unlike_is_idempotent_and_liked_collection_is_private(self):
        url = f'/api/pins/{self.pin.pk}/likes/'
        self.send(url)
        data = self.client.get(f'/api/profiles/{self.user.username}/liked/').json()['data']
        self.assertEqual(data['items'][0]['id'], self.pin.pk)
        self.assertTrue(data['items'][0]['liked'])
        self.assertEqual(self.client.get(f'/api/profiles/{self.other.username}/liked/').status_code, 404)
        for _ in range(2):
            self.assertEqual(self.send(url, method='delete').json()['data'], {'liked': False, 'like_count': 0})

    def test_csrf_and_hidden_image_boundaries(self):
        url = f'/api/pins/{self.pin.pk}/likes/'
        self.assertEqual(self.client.post(url, '{}', content_type='application/json').status_code, 403)
        self.pin.moderation_status = 'pending'
        self.pin.save(update_fields=['moderation_status'])
        self.assertEqual(self.send(url).status_code, 404)
        self.assertFalse(PinLike.objects.exists())

    def test_events_are_deduplicated_and_hide_changes_tag_weight(self):
        self.pin.tags.add(Tag.objects.create(name='nature'))
        url = f'/api/pins/{self.pin.pk}/events/'
        for _ in range(2):
            self.assertEqual(self.send(url, {'type': 'view'}).status_code, 200)
            self.assertEqual(self.send(url, {'type': 'click'}).status_code, 200)
        self.assertEqual(PinEvent.objects.filter(type='view').count(), 1)
        self.assertEqual(PinEvent.objects.filter(type='click').count(), 1)
        self.assertEqual(UserTagInterest.objects.get(user=self.user, tag='nature').weight, 1)
        self.send(url, {'type': 'hide'})
        self.assertAlmostEqual(UserTagInterest.objects.get(user=self.user, tag='nature').weight, -4, places=4)
        self.assertEqual(self.client.get('/api/feed/?tag=nature').json()['data']['items'], [])
        self.assertEqual(self.send(url, {'type': 'like'}).status_code, 400)

    def test_like_and_save_events_only_follow_successful_new_writes(self):
        self.pin.tags.add(Tag.objects.create(name='blue'))
        board = Board.objects.create(owner=self.user, name='Kept')
        for _ in range(2):
            self.send(f'/api/pins/{self.pin.pk}/likes/')
            self.send(f'/api/boards/{board.pk}/saves/', {'post_id': self.pin.pk})
        self.assertEqual(PinEvent.objects.filter(type='like').count(), 1)
        self.assertEqual(PinEvent.objects.filter(type='save').count(), 1)
        self.assertAlmostEqual(UserTagInterest.objects.get(user=self.user, tag='blue').weight, 8, places=4)
        self.send(f'/api/pins/{self.pin.pk}/likes/', method='delete')
        self.assertAlmostEqual(UserTagInterest.objects.get(user=self.user, tag='blue').weight, 5, places=4)

    def test_related_excludes_seen_hidden_and_private_board_signal(self):
        second = Post.objects.create(owner=self.other, title='Second idea', image='fixture.webp', thumbnail='thumb.webp', image_width=800, image_height=600)
        third = Post.objects.create(owner=self.other, title='Third idea', image='fixture.webp', thumbnail='thumb.webp', image_width=800, image_height=600)
        tag = Tag.objects.create(name='design')
        for pin in (self.pin, second, third):
            pin.tags.add(tag)
        self.send(f'/api/pins/{second.pk}/events/', {'type': 'view'})
        data = self.client.get(f'/api/pins/{self.pin.pk}/related?page_size=1').json()['data']
        self.assertEqual([item['id'] for item in data['items']], [third.pk])
        self.assertIsNone(data['next_cursor'])
        private = Board.objects.create(owner=self.other, name='Private', is_private=True)
        SavedPost.objects.create(board=private, post=third)
        from .pins import candidates, visible_pins
        pool = candidates(visible_pins(self.user), boards=True)
        self.assertFalse(next(item for item in pool if item.id == third.pk).boards)

    def test_ranked_cursor_is_stable_and_user_bound(self):
        authors = [self.other, self.user]
        for index in range(8):
            pin = Post.objects.create(owner=authors[index % 2], title=f'Idea {index}', image='fixture.webp', thumbnail='thumb.webp', image_width=800, image_height=600)
            pin.tags.add(Tag.objects.get_or_create(name=f'tag-{index % 3}')[0])
        response = self.client.get('/api/feed?page_size=2')
        self.assertEqual(response.status_code, 200, response.content)
        data = response.json()['data']
        cursor = data['next_cursor']
        seen = [item['id'] for item in data['items']]
        other_client = Client()
        other_client.force_login(self.other)
        self.assertEqual(other_client.get('/api/feed/', {'cursor': cursor}).status_code, 400)
        while cursor:
            response = self.client.get('/api/feed/', {'cursor': cursor, 'page_size': 2})
            self.assertEqual(response.status_code, 200, response.content)
            data = response.json()['data']
            seen.extend(item['id'] for item in data['items'])
            cursor = data['next_cursor']
        self.assertEqual(len(seen), len(set(seen)))
