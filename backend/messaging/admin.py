from django.contrib import admin
from .models import Report


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ["id", "user", "message", "created_at", "resolved"]
    list_filter = ["resolved"]
    readonly_fields = ["user", "message", "reason", "evidence", "created_at", "resolved"]

    def has_add_permission(self, request):
        return False

    def has_change_permission(self, request, obj=None):
        return False

    def has_delete_permission(self, request, obj=None):
        return False

    def has_view_permission(self, request, obj=None):
        return request.user.has_perm("collection.review_reports")
