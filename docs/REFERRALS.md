# Referral registration

Existing accounts sign in normally. New accounts require an available member code when invite-only registration is enabled.

In Django admin (`/admin/`), open **Accounts → Registration policies → Registration settings**. Enable **Invite required**, and set **Referrals per user** (default 5). The same allowance applies to every member, including existing members. Zero prevents referral registrations; increasing the allowance grants additional invites. Disabling the switch allows registration without a code. This feature starts disabled.

Members find **Invite friends** on their own profile, with their private code, remaining allowance, and a copyable signup link. Codes from suspended accounts do not work. Successful signup consumes one invite atomically; failed validation consumes none. Deleting an invited account does not restore the allowance. Codes supplied while open registration is enabled are still checked and counted.

Superusers can change registration settings. Other staff need the `accounts.change_registrationpolicy` permission. Referral codes and usage are read-only in admin to preserve allowance accounting.

API: `GET /api/auth/registration-policy/` returns the public invite-required flag. `GET /api/auth/referrals/` requires a session and returns only the current member's code and allowance. `POST /api/auth/register/` accepts `referral_code` in addition to the existing fields.
