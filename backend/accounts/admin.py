from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import Profile, User, RegistrationPolicy, Referral, ReferralRedemption


@admin.register(RegistrationPolicy)
class RegistrationPolicyAdmin(admin.ModelAdmin):
    list_display = ("invite_required", "referrals_per_user")

    def has_add_permission(self, request):
        return super().has_add_permission(request) and not RegistrationPolicy.objects.exists()

    def has_delete_permission(self, request, obj=None):
        return False


@admin.register(Referral)
class ReferralAdmin(admin.ModelAdmin):
    list_display = ("user", "code", "used")
    search_fields = ("user__username", "code")
    readonly_fields = ("user", "code", "used")

    def has_add_permission(self, request):
        return False

    def has_delete_permission(self, request, obj=None):
        return False


class ProfileInline(admin.StackedInline):
    model = Profile
    can_delete = False
    readonly_fields = ("avatar",)


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
    readonly_fields = ("avatar",)
    list_display = ("user", "display_name")
    search_fields = ("user__username", "display_name")
