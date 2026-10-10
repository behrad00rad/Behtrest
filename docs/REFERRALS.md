# Referral registration

Existing accounts sign in normally. New accounts require an available member code when invite-only registration is enabled.

In Django admin (`/admin/`), open **Accounts → Registration policies → Registration settings**. Enable **Invite required**, and set **Referrals per user** (default 5). The same allowance applies to every member, including existing members. Zero prevents referral registrations; increasing the allowance grants additional invites. Disabling the switch allows registration without a code. This feature starts disabled.

Members find **Invite friends** on their own profile, with their private code, remaining allowance, and a copyable signup link. Codes from suspended accounts do not work. Successful signup consumes one invite atomically; failed validation consumes none. Deleting an invited account does not restore the allowance. Codes supplied while open registration is enabled are still checked and counted.

Superusers can change registration settings. Other staff need both `accounts.change_registrationpolicy` and `accounts.change_referral` for the in-app controls. Code/usage remain read-only in Django admin; enabled state and personal allowance can be edited.

## In-app administration

Open **Manage invites** on your own profile, or `/settings/referrals`. Administrators can toggle invite-only signup, change the global allowance, find members by username/display name, set a personal allowance (empty means global), disable a member's invites, and replace a compromised code. Replacement immediately invalidates the previous code and keeps its successful-signup count. A disabled code cannot be redeemed even when registration is open.

Every in-app change records the administrator and changed fields in Django admin history. The API requires a staff session, both change permissions, CSRF protection and write rate limits. Suspended members cannot invite regardless of their enabled setting.

Staff APIs: GET/PATCH `/api/auth/admin/referrals/settings/`, GET `/api/auth/admin/referrals/members/?q=&page=1`, PATCH `/api/auth/admin/referrals/members/<user_id>/`. Allowed member controls: `enabled`, nullable `allowance_override`, and boolean `regenerate`. Allowances range from 0 to 10,000. Member lists return 20 entries per page.

API: `GET /api/auth/registration-policy/` returns the public invite-required flag. `GET /api/auth/referrals/` requires a session and returns only the current member's code and allowance. `POST /api/auth/register/` accepts `referral_code` in addition to the existing fields.
