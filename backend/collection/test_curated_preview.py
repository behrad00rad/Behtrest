from pathlib import Path
import tempfile

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import TestCase, override_settings

from .models import Post


class CuratedPreviewTests(TestCase):
    def test_refuses_normal_database(self):
        with self.assertRaises(CommandError):
            call_command('seed_curated_preview', verbosity=0)

    def test_repeatable_complete_seed_preserves_real_posts(self):
        root = settings.BASE_DIR.parent / 'preview'
        with tempfile.TemporaryDirectory() as directory, override_settings(PREVIEW_MODE=True, PREVIEW_CURATED_ROOT=root, MEDIA_ROOT=directory):
            owner = get_user_model().objects.create_user('real_person', 'real@example.invalid')
            original = Post.objects.create(owner=owner, title='Keep this')
            call_command('seed_curated_preview', verbosity=0)
            call_command('seed_curated_preview', verbosity=0)
            samples = Post.objects.exclude(pk=original.pk)
            self.assertEqual(samples.count(), 18)
            self.assertTrue(Post.objects.filter(pk=original.pk, title='Keep this').exists())
            for post in samples:
                self.assertTrue(post.title and post.description and post.alt_text and post.tags.exists())
                self.assertTrue(post.image_width > 0 and post.image_height > 0)
                self.assertFalse(post.allow_download)
