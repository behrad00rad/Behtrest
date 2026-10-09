from django.contrib import admin
from .models import Board, Comment, Post, SavedPost, Tag


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ("title", "owner", "created_at")
    search_fields = ("title", "description", "owner__username")
    list_filter = ("created_at",)
    readonly_fields = ("image_width", "image_height", "created_at", "updated_at")
    autocomplete_fields = ("owner",)


@admin.register(Comment)
class CommentAdmin(admin.ModelAdmin):
    list_display = ("id", "author", "post", "created_at")
    search_fields = ("text", "author__username")
    autocomplete_fields = ("author", "post")


@admin.register(Board)
class BoardAdmin(admin.ModelAdmin):
    list_display = ("name", "owner", "is_private", "updated_at")
    list_filter = ("is_private",)
    search_fields = ("name", "owner__username")
    autocomplete_fields = ("owner",)


@admin.register(SavedPost)
class SavedPostAdmin(admin.ModelAdmin):
    list_display = ("post", "board", "created_at")
    autocomplete_fields = ("board", "post")


@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    search_fields = ("name",)
