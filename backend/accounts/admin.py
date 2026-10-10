from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import Profile, User


class ProfileInline(admin.StackedInline):
    model = Profile
    can_delete = False


@admin.register(User)
class BehtrestUserAdmin(UserAdmin):
    inlines = [ProfileInline]
    list_display = ("username", "email", "is_staff", "is_active", "date_joined")
    add_fieldsets = UserAdmin.add_fieldsets + ((None, {"fields": ("email",)}),)

    def get_inline_instances(self, request, obj=None):
        # The creation signal supplies the initial profile; edit it afterward.
        return super().get_inline_instances(request, obj) if obj else []


@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "display_name")
    search_fields = ("user__username", "display_name")
