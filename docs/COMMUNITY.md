# Behtrest community features

Follow people from their profiles and open Following on the home feed. Profiles include paginated follower/following lists. Mutual blocks prevent new follows and exclude accounts from the following feed.

Activity includes followers, comments on your pins, public saves, and new pins from people you follow. Private saves and your own actions do not create notifications. Preferences apply to future activity. Blocked actors are excluded; hidden pins lose their title/destination. All activity and Unread are paginated. Mark all read uses an inbox boundary so concurrent new activity stays unread. The navigation badge refreshes periodically and when the tab becomes visible.

## Reports and decisions

Report pins, comments, or accounts from their screens, or messages through chat actions. A reason is required. Reports store a text snapshot; repeat reports by the same person for the same target are deduplicated. Existing chat reports are imported by migration.

Authorized staff open Activity → Moderation. Review evidence, available images, and history; select an action and give a reason. Dismiss/reopen reports, hide/restore content, or suspend/restore accounts. Each decision records its moderator, timestamp, and reason. Staff accounts are protected from suspension through this queue.

Hiding preserves records for reversal and excludes content from feeds, details, comments, board counts/covers, activity links, and chat media. Hidden messages appear unavailable and ordinary private attachment downloads are rejected. Moderators may inspect an attachment belonging to a reported message through a permission-checked endpoint. Previously public pin image URLs are not recalled. Suspension disables login and revokes current sessions; restoring an account requires fresh login. These actions do not delete records or files.

## Grant moderator access

Run `python backend/manage.py createsuperuser` using the project virtual environment for an administrator. Superusers have access. For a narrower role, use Django admin to create a group with **Can review content reports**, assign it to the intended user, and enable **Staff status**. Both staff status and `collection.review_reports` are required. Ordinary staff status alone is insufficient. Queue and audit records are read-only in Django admin; make decisions through the application queue.

## API

Paths below are under `/api/`; authenticated writes require CSRF.

| Method | Path | Behavior |
| --- | --- | --- |
| POST / DELETE | `profiles/<username>/follow/` | Follow / unfollow |
| GET | `profiles/<username>/followers/`, `profiles/<username>/following/` | People lists |
| GET | `feed/?following=1` | Authenticated following feed |
| GET | `notifications/?unread=0` or `1` | Activity, cursor, unread count, latest ID |
| POST | `notifications/` | Mark `{id}` or `{through_id}` read |
| GET / PATCH | `notifications/settings/` | Boolean `follows`, `comments`, `saves`, `pins` |
| POST | `reports/` | `{kind, target_id, reason}`; post/comment/user/message |
| GET | `moderation/?status=open` | Queue; open/actioned/dismissed/all |
| GET / POST | `moderation/<id>/` | Evidence/history or `{action, reason}` |
| GET | `moderation/<id>/media/` | Reported private image, moderators only |

Actions: `dismiss`, `reopen`, `hide`, `restore`, `suspend`, `restore_account`. Content actions apply to posts/comments/messages; account actions apply to the report's target user. Sessions expose `can_moderate` for navigation; the server independently enforces authorization.
