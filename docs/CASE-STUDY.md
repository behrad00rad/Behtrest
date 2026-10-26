# Behtrest: revisiting a first full-stack project

## Original motivation

I built the original Pinterest-inspired app at age 13 for CS50x because I wanted a dark interface and blue accents. It was an early exercise in connecting accounts, images, comments and a database. The folder references the 2022 course; that is not evidence of the exact completion year.

The original implementation and README remain in `btrest/` and `docs/README-original.md`, with `legacy-v1` preserving the initial snapshot. The current Django/React app is a separate V2, not a rewrite of that historical source.

## The current product

V2 combines a React/TypeScript client with a Django API, session authentication, boards, follows, comments, messaging, moderation and a separate guest playground. The preview uses fictional profiles and credited sample photography, isolated from the normal database and sessions. Discover uses interests and bounded recommendation candidates rather than claiming a validated machine-learning recommendation quality improvement.

The October 26 pin-detail work focused on making discovery useful after someone opens an image. Comments now precede related pins; the related feed is bounded and releases offscreen content. Mobile controls stay reachable, and desktop has a real two-column top section that bounds its sticky image. This structural wrapper fixed an overlap caused by flattening the old wrapper with `display: contents`.

The completed actions include download permissions and streamed full-size images, a last-used-board picker with inline creation and safe Undo, copying/native share/message handoff, follows, comment likes/reporting, and owner editing/deletion. Keyboard navigation, focus management, reduced-motion behavior and server-rendered social metadata are part of the implementation. Existing design tokens and dependencies were reused.

## Engineering choices

- Keep the age-13 source and historical claims intact while improving V2 separately.
- Put discussion before an expanding feed and impose an explicit loading limit.
- Preserve server ownership, CSRF and visibility rules for every new action.
- Distinguish a newly created save from an existing save before offering Undo.
- Yield bounded async download chunks under ASGI instead of relying on a synchronous iterator that Django can buffer.
- Serve escaped social metadata in initial HTML, with the frontend shell packaged into the backend image and matching static assets served by Caddy.

## Evidence and honest limits

Local Edge journeys and pin Axe A/AA checks passed at 375/768/1440px. Separate layout checks covered tall/wide images and zero/40 comments at 375/1024/1440/1920px, including sticky boundaries, scroll restoration and Esc/back behavior. Typecheck, build, formatting, migration drift and 26 focused backend tests passed.

The broader collection/preview run passed 100 of 101 tests; an existing default-feed cursor-pagination regression remains open. There is no configured lint script. Native mobile sharing was invoked through a test stub; physical-device acceptance, the new container routing and public crawler behavior still need verification. The previous successful Linux CI deployment checks apply to an earlier revision. This work does not establish a new deployment or a fully passing suite.

This is repository case-study material. No external portfolio/CMS page was changed or published as part of this update. See [verification](VERIFICATION.md), [pin behavior](PIN-DETAIL.md), and [deployment](DEPLOYMENT.md) for supporting detail.


## A demo with a point of view

The October 27 preview replaces generic stock photography with 18 owner-supplied images: monochrome portraits, owls, tattoo references, typography and dark illustration. Every sample has a title, contextual caption, useful alt text and searchable tags. Original proportions survive normalization. Repeated seeding does not duplicate samples or replace user-created content. Sample provenance is labeled honestly; creator attribution and publication rights remain unverified.

One-click guest entry skips setup; optional accounts need only username and a six-character password. These rules are confined to the demo. A separate Compose project and production-derived HTTPS settings prepare it for hosting without sharing the real app database. A dependency-free Docker sampler measures resource use before choosing tighter limits. Linux container acceptance and deployment remain pending.
