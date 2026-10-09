from django.contrib.auth.models import AbstractUser, UserManager
from django.db import models
from django.db.models.functions import Lower


class NormalizedUserManager(UserManager):
    def _create_user(self, username, email, password, **extra_fields):
        return super()._create_user(username.strip().lower(), email.strip().lower(), password, **extra_fields)


class User(AbstractUser):
    email = models.EmailField(unique=True)
    objects = NormalizedUserManager()

    class Meta:
        constraints = [
            models.UniqueConstraint(Lower("username"), name="user_username_case_insensitive"),
            models.UniqueConstraint(Lower("email"), name="user_email_case_insensitive"),
            models.CheckConstraint(condition=~models.Q(email=""), name="user_email_required"),
        ]

    def clean(self):
        super().clean()
        self.username = self.username.strip().lower()
        self.email = self.email.strip().lower()


class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name="profile")
    display_name = models.CharField(max_length=80, blank=True)
    bio = models.CharField(max_length=500, blank=True)
    avatar = models.ImageField(upload_to="avatars/%Y/%m/", blank=True)

    def __str__(self):
        return self.user.username


class RateLimitBucket(models.Model):
    key = models.CharField(max_length=64, primary_key=True)
    count = models.PositiveIntegerField(default=0)
    expires_at = models.DateTimeField(db_index=True)
