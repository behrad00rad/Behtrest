# Pin navigation, likes and discovery

Implemented October 26, 2026 in the existing Django/SQLite and React Router stack. The user approved `recommender.py` instead of a new TypeScript server runtime. No dependencies were added; earlier uncommitted work was preserved.

## Navigation and interactions

`/pin/:id` is the canonical client route. Feed links carry a background location and preserve the mounted feed and its activation-time scroll offset. Related links push another detail entry in the same native dialog. Back/Escape dismiss the overlay chain; browser Back steps through its history. Direct visits render the full detail page. Existing `/posts/:id` routes and API URLs remain supported. Native dialogs provide focus trapping; image dimensions and loading placeholders reserve space.

- `POST /api/pins/:id/likes/` and `DELETE` use the authenticated account, including a unique guest identity. Empty JSON bodies only. The unique user/pin relation and atomic counter updates make repeats idempotent; account deletion also decrements counters. Hearts optimistically update all visible instances and roll back on failure. Liked collections are owner-only at `GET /api/profiles/:username/liked/`.
- `POST /api/pins/:id/events/` accepts only `view`, `click`, or `hide`. The server records `like` and `save` only after successful new mutations. Views have a 500ms client dwell delay and ten-minute server buckets; clicks have thirty-second server buckets. Saves contribute once per user/pin/day, hides once, and likes only on new likes. Unlike reverses its decayed affinity contribution. Events store an irreversible session identifier hash, not the session token.
- Not interested hides the pin immediately, excludes it from later discovery/search/related results, and reduces its tag affinity. It does not delete the pin or another person's content. Existing reporting, comments, saves, owner controls and image moderation remain available.

## Ranking

All score calculations are in `backend/collection/recommender.py` and accept immutable candidate inputs.

Related pins use exactly `0.6 × tag Jaccard + 0.15 × same author + 0.15 × public-board Jaccard + 0.1 × recency`. Board overlap and popularity ignore private boards. Scores are cached per source pin for 180 seconds. Visibility, blocked users, user hides and session-seen pins are rechecked for every page. The source itself is excluded.

Personalized Discover uses decaying tag weights seeded at +1 from onboarding interests. New events add click +1, like +3, save +5, hide −5. Weights have a fourteen-day exponential half-life. Personal ranking combines affinity, logarithmic public popularity and freshness. The slot schedule is seven personal, two exploration and one newest per ten; unavailable lanes fall back. Exploration prefers tags not previously encountered. Cold starts use popular pins. No third consecutive author or primary tag is allowed.

`GET /api/feed` and `/api/feed/` accept signed cursors. Explicit tag, people/owner search, Following and chronological-sort filters retain their existing paths. Default Discover uses the personalized ranking. `GET /api/pins/:id/related` also accepts signed cursors. An ordered snapshot is bound to its viewer and query/source scope, preventing score updates from duplicating or skipping items between pages. Cached snapshots expire after one hour; refreshing starts a new ranking.

## Verification and limits

Phase formatting, TypeScript and production builds passed. There is no configured lint script; Prettier was used without installing a linter. Seventeen focused tests passed for score formulas, 70/20/10 blending, diversity, decay, cold starts, likes/counters, permissions, event deduplication/weights, private-board exclusion, related visibility and cursor stability. Migration drift and Django system checks passed. Local SQLite backups preceded the additive migrations on both normal and preview data.

Edge journeys passed at 375/768/1440px: modal versus direct routes, chained related navigation, browser Back/Escape, focus containment, exact feed scroll restoration, persisted guest likes, forced-network-error optimistic rollback, Liked tab, hiding, overflow and Axe A/AA. Full suites, physical-device acceptance and production deployment were not run.

The initial candidate pool is bounded to the newest 500 plus the most-liked 500 visible pins (up to 1000 distinct candidates). A very homogeneous pool can end early under the strict diversity rule. Larger catalogs need candidate retrieval/index tuning, cache/latency instrumentation and ranking evaluation before embeddings. Event retention and a user-facing undo/reset for hidden preferences remain operational follow-ups. No quality improvement or load-test result is claimed without real usage evidence.
