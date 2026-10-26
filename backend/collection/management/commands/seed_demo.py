import io
import math

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from PIL import Image, ImageDraw

from common.media import delete_files, prepare_image, store_images
from collection.models import Board, Comment, Post, SavedPost, Tag

TITLES = ('Blue hour', 'Quiet geometry', 'Ocean notes', 'Light study', 'Midnight shapes', 'Open skies', 'Coastal rhythm', 'Window into blue', 'Mountain hush', 'A little growth', 'Circles of calm', 'Soft horizons', 'Slow mornings', 'Archways', 'Wandering peaks', 'Botanical blue', 'A quiet orbit', 'Tide lines', 'Evening light', 'Room to breathe', 'Beyond the ridge', 'Small beginnings', 'Color conversation', 'Endless summer')


def artwork(index):
    width, height = 480, 580 + index % 5 * 60
    colors = ((24, 54, 79), (157, 181, 193), (43, 83, 110), (193, 203, 180), (21, 37, 63), (85, 142, 175))
    image = Image.new('RGB', (width, height), colors[index % 6]); draw = ImageDraw.Draw(image)
    kind = index % 6
    if kind == 0:
        draw.ellipse((300, 60, 400, 160), fill='#d9cead')
        for row, color in enumerate(('#346b8c', '#4e97b4', '#8ebfc9')):
            points = [(x, height * (.48 + row * .15) + math.sin(x / 65 + row) * 25) for x in range(0, width + 1, 8)]
            draw.polygon(points + [(width, height), (0, height)], fill=color)
    elif kind == 1:
        draw.rectangle((60, 195, 420, height), fill='#526f83'); draw.pieslice((60, 15, 420, 375), 180, 360, fill='#526f83')
        draw.rectangle((105, 190, 375, height), fill='#203e57'); draw.pieslice((105, 55, 375, 325), 180, 360, fill='#203e57')
        draw.ellipse((170, 155, 290, 275), fill='#9bc5dc')
    elif kind == 2:
        draw.ellipse((55, 75, 145, 165), fill='#d7d0b2')
        draw.polygon([(0, height), (160, 200), (370, height)], fill='#84a8b8')
        draw.polygon([(130, height), (350, 280), (480, height)], fill='#456e8b')
        draw.polygon([(0, height), (80, height - 170), (270, height)], fill='#23465e')
    elif kind == 3:
        draw.line((240, height, 240, 110), fill='#355963', width=8)
        for i in range(5):
            y = 145 + i * 77
            draw.ellipse((120, y, 240, y + 105), fill='#4c7981'); draw.ellipse((240, y - 28, 365, y + 77), fill='#6d9598')
    elif kind == 4:
        for i in range(5):
            draw.ellipse((30 + i * 38, 75 + i * 38, 450 - i * 38, 495 - i * 38), fill=('#27415b', '#3e6487', '#6e9dbe', '#aacada', '#e5ddc8')[i])
        draw.rectangle((0, height - 80, 480, height), fill='#162b41')
    else:
        for i, color in enumerate(('#d7d9c6', '#bad0cf', '#95b7c8', '#6b9cb8', '#3b718f', '#234e6a')):
            draw.polygon([(0, height * (.2 + i * .12)), (480, height * (.05 + i * .12)), (480, height), (0, height)], fill=color)
    buffer = io.BytesIO(); image.save(buffer, 'PNG')
    return buffer.getvalue()


class Command(BaseCommand):
    help = 'Create repeatable synthetic demo art, tags, boards, and comments. No shared passwords.'

    def handle(self, *args, **options):
        new_files = []
        try:
            with transaction.atomic():
                self.seed(new_files)
        except Exception:
            delete_files(new_files)
            raise
        self.stdout.write(self.style.SUCCESS('Demo ready: 2 users, 24 posts, 4 boards. No shared passwords were created.'))
        self.stdout.write('To sign in as a demo account: python manage.py changepassword demo_blue')

    def seed(self, new_files):
        User = get_user_model(); users = []
        for name in ('demo_blue', 'demo_studio'):
            user, created = User.objects.get_or_create(username=name, defaults={'email': f'{name}@example.invalid'})
            if not created and user.email != f'{name}@example.invalid':
                raise CommandError('Demo username belongs to a non-demo account; nothing was changed.')
            if created:
                user.set_unusable_password(); user.save(update_fields=['password'])
                user.profile.display_name = name.replace('demo_', '').title() + ' Studio'
                user.profile.bio = 'Synthetic artwork and a little curiosity. A local demonstration account.'
                user.profile.save()
            users.append(user)
        for index, title in enumerate(TITLES):
            owner = users[index % 2]
            post = Post.objects.filter(owner=owner, title=title).first()
            if not post or not post.thumbnail:
                names, width, height = store_images(prepare_image(ContentFile(artwork(index))), owner.pk)
                new_files.extend(names)
                old = [post.image.name, post.thumbnail.name] if post else []
                post = post or Post(owner=owner, title=title)
                post.image, post.thumbnail = names
                post.image_width, post.image_height = width, height
                post.description = 'Synthetic illustration for local development. A study in color, light, and quiet shapes.'
                post.alt_text = f'{title}: a geometric blue illustration.'
                post.save()
                transaction.on_commit(lambda old=old: delete_files(old))
            tags = ('blue', 'illustration', ('nature', 'architecture', 'mountains', 'botanical', 'abstract', 'coastal')[index % 6])
            post.tags.set([Tag.objects.get_or_create(name=name)[0] for name in tags])
        for owner in users:
            board, _ = Board.objects.get_or_create(owner=owner, name='Blue inspiration')
            Board.objects.get_or_create(owner=owner, name='Private sketches', defaults={'is_private': True})
            for post in Post.objects.filter(owner=owner):
                SavedPost.objects.get_or_create(board=board, post=post)
                Comment.objects.get_or_create(author=users[1] if owner == users[0] else users[0], post=post, text=['The warm colors make this feel really inviting.', 'Saving this palette for my next sketch.', 'I like the way the shapes balance each other.'][post.pk % 3])
