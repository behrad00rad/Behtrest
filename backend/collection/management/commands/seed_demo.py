import io

from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from PIL import Image, ImageDraw

from collection.models import Board, Comment, Post, SavedPost


class Command(BaseCommand):
    help = "Create repeatable synthetic demo data. Accounts have unusable passwords until explicitly set."

    @transaction.atomic
    def handle(self, *args, **options):
        User = get_user_model()
        users = []
        for name in ("demo_blue", "demo_studio"):
            user, created = User.objects.get_or_create(username=name, defaults={"email": f"{name}@example.invalid"})
            if not created and user.email != f"{name}@example.invalid":
                raise CommandError("Demo username already belongs to a non-demo account; nothing was changed.")
            if created:
                user.set_unusable_password()
                user.save(update_fields=["password"])
                user.profile.display_name = name.replace("demo_", "").title() + " Studio"
                user.profile.bio = "Synthetic account for local development."
                user.profile.save()
            users.append(user)
        titles = ("Blue hour", "Quiet geometry", "Ocean notes", "Light study", "Midnight shapes", "Open skies")
        for index, title in enumerate(titles):
            owner = users[index % 2]
            if not Post.objects.filter(owner=owner, title=title).exists():
                image = Image.new("RGB", (480, 600 + index * 40), (15, 27 + index * 4, 52 + index * 8))
                draw = ImageDraw.Draw(image)
                draw.ellipse((60, 100, 420, 460), fill=(40 + index * 10, 115 + index * 12, 210))
                draw.rectangle((0, 420, 480, image.height), fill=(12, 22, 38))
                buffer = io.BytesIO()
                image.save(buffer, "PNG")
                post = Post(owner=owner, title=title, description="Synthetic artwork generated for development.")
                post.image.save("demo.png", ContentFile(buffer.getvalue()), save=True)
        for owner in users:
            board, _ = Board.objects.get_or_create(owner=owner, name="Blue inspiration")
            Board.objects.get_or_create(owner=owner, name="Private sketches", defaults={"is_private": True})
            for post in Post.objects.filter(owner=owner):
                SavedPost.objects.get_or_create(board=board, post=post)
                Comment.objects.get_or_create(author=users[1] if owner == users[0] else users[0], post=post, text="A little inspiration for the next project.")
        self.stdout.write(self.style.SUCCESS("Demo ready: 2 users, 6 posts, 4 boards. No shared passwords were created."))
        self.stdout.write("To sign in as a demo account: python manage.py changepassword demo_blue")
