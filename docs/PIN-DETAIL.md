# Pin detail behavior

Updated October 26, 2026. This extends the existing Django/React V2 without adding dependencies or changing the preserved legacy app.

## Reading and navigation

Mobile order is image, actions, title/author/description/source/tags, latest-two comments, then More to explore. The comment icon opens a mobile bottom sheet or expands comments inline on larger screens. View all appears only when more than two comments exist. The composer trims input and disables send until two characters remain. Comment likes, author-only editing/deletion and reporting retain ownership and CSRF checks.

Desktop uses a real `.pin-top` two-column grid containing the image and the details/comments column. Related pins follow this box in normal block flow with a 32px gap. The image is sticky only inside `.pin-top`, at 16px, and uses max-height 80vh with contain sizing. The modal owns scrolling; its top section has no independent scroll container or fixed height. This replaces `display: contents`, which let the image remain sticky into the related-feed area.

On phones, actions remain available after the image leaves view. Back-to-top appears after the image, and navigating back from a chained pin restores its parent's scroll position. Related pins load in batches of 20: three automatic batches, then Show more, up to six batches before the sleeping-owl end state. Offscreen card contents unmount while placeholders retain measured height. Loaded related-page metadata is kept in a bounded history cache.

## Actions

- Download is a desktop icon and a menu item; on smaller screens it appears only in the menu. The owner controls Allow downloads on create/edit. Source credit remains visible. The endpoint streams the stored full-size normalized image, not its thumbnail; raw uploads are not retained.
- Save uses the last-used available board. The adjacent picker puts that board first and supports inline board creation. Change reopens the picker; existing multi-board behavior is preserved. Undo removes only the row created by that save, never an older save.
- Share offers Copy link with feedback, native Web Share when available on mobile, and Send in message. Opening the message composer does not send anything automatically.
- Other authors have Follow/Following; the owner sees Edit/Delete in the single pin menu. Pin and comment popovers fit the viewport, flip vertically when necessary, trap focus, support arrow/Home/End/Tab navigation, and close on Esc/outside click.
- Shortcuts: L likes, S saves, Esc closes, and left/right move through the related sequence. Typing fields ignore letter/arrow shortcuts. Nested dialogs and open popovers keep their own keyboard handling. Active history state avoids stale next/previous navigation during route transitions.

## Link previews and operations

Public `/pin/<id>` HTML contains escaped Open Graph/Twitter metadata before JavaScript runs. Vite injects metadata in development; Django injects it into the packaged frontend shell behind Caddy in production. Unpublished/hidden pins do not receive a public preview. In-app transitions also update document metadata.

Migration `0010_post_allow_download_commentlike` adds the default-true permission and unique comment likes. Only the isolated preview has been migrated during this verification. Rebuild backend and web from the same revision before any controlled deployment. See [API](API.md), [deployment](DEPLOYMENT.md) and [verification](VERIFICATION.md).
