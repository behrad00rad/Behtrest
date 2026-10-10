from django.contrib import admin
from .models import Board, Comment, Post, SavedPost, Tag
from .models import ContentReport, ModerationLog


@admin.register(Post)
class PostAdmin(admin.ModelAdmin):
    list_display = ("title", "owner", "created_at")
    search_fields = ("title", "description", "owner__username")
    list_filter = ("created_at",)
    readonly_fields = ("image", "thumbnail", "image_width", "image_height", "created_at", "updated_at", "moderation_status")
    autocomplete_fields = ("owner",)

    def has_add_permission(self, request): return False


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


@admin.register(ContentReport)
class ContentReportAdmin(admin.ModelAdmin):
    list_display = ("id", "kind", "target_id", "target_user", "status", "created_at")
    list_filter = ("status", "kind")
    search_fields = ("reason", "target_user__username", "reporter__username")
    readonly_fields = ("reporter", "kind", "target_id", "target_user", "reason", "evidence", "status", "created_at", "updated_at")

    def has_add_permission(self, request): return False
    def has_delete_permission(self, request, obj=None): return False
    def has_change_permission(self, request, obj=None): return False
    def has_view_permission(self, request, obj=None):
        return request.user.has_perm("collection.review_reports")


@admin.register(ModerationLog)
class ModerationLogAdmin(admin.ModelAdmin):
    list_display = ("id", "report", "moderator", "action", "created_at")
    readonly_fields = ("report", "moderator", "action", "reason", "created_at")
    def has_add_permission(self, request): return False
    def has_delete_permission(self, request, obj=None): return False
    def has_change_permission(self, request, obj=None): return False
    def has_view_permission(self, request, obj=None):
        return request.user.has_perm("collection.review_reports")
