# UI audit — October 26, 2026

## Owl, tags and motion

Reused the exact owl shapes supplied in `Desktop/owl.txt`, recolored blue, in a reusable `Owl` with idle/blink/sleep/think/happy states and mug/backpack/lamp accessories. Logo pupils track the pointer at most 20 times per second; idle blinks are scheduled 3–6 seconds apart. Tag changes pop in the next accessory. Confirmed saves trigger a 280ms arcing thumbnail, 250ms Boards bounce and one-second happy state. Five logo clicks within three seconds trigger one 1.8-second flight. Reduced-motion preferences suppress decorative movement, including active browser animations when the preference changes.

Discover now has underlined text tabs, a divider, interest-first chips and a searchable single-select More popover with edge fades and no arrows. A measured shortest-column masonry layout fills the full container and transitions retained cards when filtering; new cards fade up at their destination. Loading uses a thinking owl; empty/long-feed completion uses the sleeping owl and requested line. Completion is omitted when the feed is shorter than two screens. Hover lift/image scaling and double-click saving with sparkles are included. Double-click saves to the last-used available board, or the first current board; without a board it opens the existing board chooser. Pointer navigation waits 300ms to distinguish double-clicks; keyboard navigation remains immediate.

Focused Edge checks passed at 375/768/1440px: full-width 2/3/5-column placement, popover/search and single-selection, short-feed completion suppression, and Axe A/AA. Confirmed double-click persistence, happy state, five-click flight, reduced-motion suppression and no runtime errors. Screenshots inspected. Formatting, typecheck/build and whitespace checks passed. No dependencies were added, no full suites were rerun, and no physical-device or guaranteed 60fps performance measurement is claimed.

## Discover feed-first refinement

Removed the visible hero, explanatory copy and duplicate upload action. Combined the preview/guest notices into one persistently dismissible line, made the shared header sticky with a translucent background layer, and widened search. Discover now has one tabs/chips row, keyboard scrolling with edge affordances, and image-only masonry cards with hover/focus title, author avatar/name, Save and a working share/copy menu. Existing per-image skeletons and aspect ratios remain. Other collection screens retain their metadata and owner controls.

The feed uses 2/3/4/5/6 columns at the requested 768/1024/1280/1536px thresholds, a 12px gap, 16px image corners, 24px page gutters and an 1800px shared container. Verified at 375/768/1440px: expected 2/3/5 columns, no horizontal page overflow, single-row controls, keyboard menu/focus parity, sticky header and correctly positioned mobile navigation, persisted combined-notice dismissal and Axe A/AA. Screenshots inspected. Formatting, typecheck and production build passed; no lint script exists and no dependency was added. Full suites were not rerun for this scoped refinement.

Completed the five requested phases on top of the existing uncommitted preview work. No dependencies were added and nothing was committed or deployed.

- Shared route-independent header, preview notice and page gutters; removed structural separators; single search-wrapper focus ring; shared pluralization; overflow-aware tag arrows and keyboard navigation.
- Neutral dark surface/text/border tokens, one primary-action accent, deliberate display/UI fonts, spacing tokens, readable helper text, neutral chat actions and clear hover/focus/selected states.
- Labeled Messages/Boards icon links, keyboard-accessible avatar dropdown with Escape/outside dismissal, Settings route, and persistent dismissible preview notice.
- Centered chat dates and clearer empty states; pin overlays and loading placeholders; image-first Create pin with metadata, alt-text guidance, inline API validation, progress and publish notices; profile actions, invite copy notice, unified avatar control and Cancel; guest badge and account upgrade preserving identity and collections.
- Account-persisted interests, a first-run picker requiring at least three tags, editable preferences, and interest-filtered Discover pagination. Explicit tag searches and Following retain their existing filters. The additive profile migration was applied locally after SQLite backups.

## Verification

Formatting, TypeScript and production builds passed after each phase. Final focused backend run: **49 tests passed**. Existing two-person messaging journeys passed on desktop/mobile; collection journeys passed on the final focused rerun after their navigation selectors were updated for the new header. Separate local Edge journeys passed at **375px, 768px and 1440px**, covering unchanged logo geometry, search focus, keyboard menu dismissal, onboarding/settings persistence, image publish, profile dialog/copy, guest upgrade and composer bounds. Axe A/AA and minimum text-size checks passed on the tested Discover/Create/Messages/settings-related dialogs. Migration drift, Django system checks and diff whitespace checks passed.

## Limits

The exact original stray 1px line did not reproduce in the baseline screenshots. Structural border rules were removed and affected routes were inspected after cleanup; no reproduced artifact is being claimed as definitively traced. There is no lint script or installed linter; the existing Prettier check was used without adding a dependency. Physical-device keyboard behavior, every application screen/state, the complete backend suite and deployment checks were not rerun. All public/demo data remains local.


## Pin detail and mobile Discover follow-up

The latest mobile Discover header keeps logo/search/notifications, hides on downward scrolling and reveals upward, with two control rows and fixed safe-area-aware navigation. More tags opens the focus-contained sheet. Active navigation/chips and the existing owl states use current tokens.

Pin detail comments now precede related pins. A real pin-top wrapper bounds the desktop sticky image; the related masonry follows in normal flow. Download permission, board picker/create/Change/safe Undo, share/follow/comment actions, edge-aware menus, shortcut navigation and initial-HTML social metadata are implemented. See [pin detail behavior](PIN-DETAIL.md) and the [latest verification record](VERIFICATION.md); that record includes the known feed-pagination failure and the missing lint configuration. No new dependency or deployment claim accompanies this checkpoint.
