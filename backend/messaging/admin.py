from django.contrib import admin
from .models import Report


@admin.register(Report)
class ReportAdmin(admin.ModelAdmin):
    list_display = ["id", "user", "message", "created_at", "resolved"]
    list_filter = ["resolved"]
    readonly_fields = ["user", "message", "reason", "evidence", "created_at"]

    def has_add_permission(self, request):
        return False
