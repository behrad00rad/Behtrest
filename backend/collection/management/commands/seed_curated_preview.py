"""Repeatable, isolated seed from the user's locally supplied moodboard images."""
import hashlib
import json
from pathlib import Path

from django.conf import settings
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from common.media import prepare_image, store_images, delete_files
from collection.models import Board, Comment, Post, SavedPost, Tag


class Command(BaseCommand):
    help = 'Replace legacy demo photography with curated local samples; never touch normal accounts.'

    def handle(self, *args, **options):
        if not settings.PREVIEW_MODE:
            raise CommandError('Curated samples require isolated preview settings.')
        catalog = json.loads((Path(__file__).resolve().parents[2] / 'curated_preview.json').read_text(encoding='utf-8'))
        root = Path(settings.PREVIEW_CURATED_ROOT)
        if any(not (root / item['file']).is_file() for item in catalog):
            raise CommandError('Missing curated preview images. Keep the preview/ folder with the release.')
        from .seed_preview import PEOPLE
        files = []
        try:
            with transaction.atomic():
                users = []
                for slug, name, _ in PEOPLE:
                    username = f'preview_{slug}'
                    user, created = get_user_model().objects.get_or_create(username=username, defaults={'email': f'{username}@preview.invalid'})
                    if user.email != f'{username}@preview.invalid':
                        raise CommandError('Sample username belongs to another account; refusing to change it.')
                    if created:
                        user.set_unusable_password()
                        user.save(update_fields=['password'])
                    user.profile.display_name = name
                    user.profile.bio = 'Cinema, strange graphics, night creatures and things worth keeping. Fictional preview profile.'
                    user.profile.save()
                    users.append(user)
                posts = []
                for index, item in enumerate(catalog):
                    owner = users[index % len(users)]
                    key = hashlib.sha256(item['file'].encode()).hexdigest()[:16]
                    source = f'https://www.pinterest.com/behradghrad/cool/#behtrest-sample-{key}'
                    post = Post.objects.filter(owner=owner, source_url=source).first()
                    if not post:
                        names, width, height = store_images(prepare_image(ContentFile((root / item['file']).read_bytes())), owner.pk)
                        files.extend(names)
                        post = Post.objects.create(owner=owner, title=item['title'], source_url=source, image=names[0], thumbnail=names[1], image_width=width, image_height=height)
                    post.title = item['title']
                    post.description = item['description'] + '\n\nSample image supplied by the site owner from their Pinterest moodboard. Original creator not verified; no ownership claimed.'
                    post.alt_text = item['alt']
                    post.allow_download = False
                    post.save()
                    post.tags.set([Tag.objects.get_or_create(name=tag)[0] for tag in item['tags']])
                    Comment.objects.get_or_create(post=post, author=users[(index + 1) % 4], text=('The composition is what makes this work.', 'Saving this for my next moodboard.', 'The contrast here is so good.', 'This has such a specific atmosphere.')[index % 4])
                    posts.append(post)
                # Exact legacy catalog sources plus verified fictional owners only.
                cache = Path(getattr(settings, 'PREVIEW_PHOTO_CACHE', settings.BASE_DIR.parent / '.local' / 'preview-photos'))
                from collection.preview_catalog import PHOTOS
                legacy = []
                for photo_id, *_ in PHOTOS:
                    metadata = cache / f'{photo_id}.json'
                    if metadata.is_file():
                        legacy.append(json.loads(metadata.read_text(encoding='utf-8'))['url'])
                Post.objects.filter(owner__in=users, source_url__in=legacy).delete()
                for index, user in enumerate(users):
                    board, _ = Board.objects.get_or_create(owner=user, name='After dark', defaults={'description': 'Cinema, ink, owls and graphic references. Sample collection.'})
                    for post in posts[index::4]:
                        SavedPost.objects.get_or_create(board=board, post=post)
                    board.cover = posts[index]
                    board.save(update_fields=['cover'])
        except Exception:
            delete_files(files)
            raise
        self.stdout.write(self.style.SUCCESS(f'Curated preview ready: {len(posts)} pins, original aspect ratios, complete metadata.'))
