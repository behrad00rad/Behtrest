import io
import json
from datetime import timedelta
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from django.utils import timezone
from PIL import Image, ImageOps

from common.media import delete_files, prepare_image, store_images
from collection.models import Board, Comment, Follow, Post, SavedPost, Tag
from collection.preview_catalog import PHOTOS

PEOPLE = [
    ('maya', 'Maya Bennett', 'Weekend walks, warm interiors, and a camera that goes everywhere.'),
    ('leo', 'Leo Martin', 'Designer collecting interesting spaces and small details.'),
    ('noor', 'Noor Haddad', 'Plants by the window. Travel plans in the notebook.'),
    ('sam', 'Sam Rivera', 'Good coffee, slow dinners, and the occasional mountain.'),
]
COMMENTS = ['This light is so lovely.', 'Adding this to my weekend ideas.', 'The colors work so well together.', 'Saving this palette for my living room.', 'I would happily spend an afternoon here.', 'The shadows make the whole composition work.']


class Command(BaseCommand):
    help = 'Seed only the isolated preview with credited photos and fictional profiles.'

    def handle(self, *args, **options):
        if not settings.PREVIEW_MODE:
            raise CommandError('Use --settings=config.preview_settings. Normal app data must stay separate.')
        cache = Path(getattr(settings, 'PREVIEW_PHOTO_CACHE', Path(__file__).resolve().parents[4] / '.local' / 'preview-photos'))
        for photo_id, *_ in PHOTOS:
            if not (cache / f'{photo_id}.jpg').exists() or not (cache / f'{photo_id}.json').exists():
                raise CommandError('First run: python scripts/fetch_preview_photos.py')
        files = []
        try:
            with transaction.atomic():
                self.seed(cache, files)
        except Exception:
            delete_files(files)
            raise
        self.stdout.write(self.style.SUCCESS('Preview ready: 24 credited photographs, 4 fictional profiles, 8 boards.'))

    def seed(self, cache, files):
        users = []
        for slug, name, bio in PEOPLE:
            username = f'preview_{slug}'
            email = f'{username}@preview.invalid'
            user, created = get_user_model().objects.get_or_create(username=username, defaults={'email': email})
            if user.email != email:
                raise CommandError('A sample username is already in use. Nothing changed.')
            if created:
                user.set_unusable_password()
                user.save(update_fields=['password'])
                user.profile.display_name = name
                user.profile.bio = bio + ' Fictional preview profile.'
                user.profile.save()
            users.append(user)
        posts = []
        for index, (photo_id, title, alt, tags, caption) in enumerate(PHOTOS):
            owner = users[index % len(users)]
            info = json.loads((cache / f'{photo_id}.json').read_text(encoding='utf-8'))
            post = Post.objects.filter(owner=owner, source_url=info['url']).first()
            if not post:
                with Image.open(cache / f'{photo_id}.jpg') as source:
                    image = ImageOps.fit(source, (800, (1000, 650, 800, 1100)[index % 4]))
                    buffer = io.BytesIO()
                    image.save(buffer, 'JPEG', quality=90)
                names, width, height = store_images(prepare_image(ContentFile(buffer.getvalue())), owner.pk)
                files.extend(names)
                post = Post.objects.create(owner=owner, title=title, description=f'{caption}\n\nPhoto: {info["author"]} / Unsplash, via Lorem Picsum. Sample pin for the Behtrest preview.', alt_text=alt, source_url=info['url'], image=names[0], thumbnail=names[1], image_width=width, image_height=height)
                Post.objects.filter(pk=post.pk).update(created_at=timezone.now() - timedelta(hours=(24-index)*5))
                post.tags.set([Tag.objects.get_or_create(name=tag)[0] for tag in tags.split()])
            Comment.objects.get_or_create(post=post, author=users[(index+1) % 4], text=COMMENTS[index % len(COMMENTS)])
            # Varied fictional authors and repeatable, contextual sample comments.
            for offset in range(1, 1 + index % 4):
                Comment.objects.get_or_create(post=post, author=users[(index+offset+1) % len(users)], text=COMMENTS[(index+offset) % len(COMMENTS)])
            posts.append(post)
        for index, user in enumerate(users):
            Follow.objects.get_or_create(follower=user, target=users[(index+1) % 4])
            for offset, name in enumerate(('Places to disappear', 'Everyday inspiration')):
                board, _ = Board.objects.get_or_create(owner=user, name=name, defaults={'description': 'A sample collection of little things worth keeping.'})
                for post in posts[offset*12:(offset+1)*12][index::2]:
                    SavedPost.objects.get_or_create(board=board, post=post)
                if not board.cover_id:
                    board.cover = board.saved_posts.first().post if board.saved_posts.exists() else None
                    board.save(update_fields=['cover'])
