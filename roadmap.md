# Custom X form labels
- [x] Make Custom X picture arrows high-contrast and touch-sized across all accounts; real phone/desktop form checks, retailer iframe scrolling, single/multi variants, keyboard, contrast and endpoint checks passed without submissions.
- [x] Remove unwanted green button/touch effects and use neutral scrollbars across public forms; checked nine real form views on phone/desktop, isolated Metal IQ popup, keyboard focus, step advancement and portal isolation without submissions.
- [x] Improve V1/Classic Quote Estimator phone scrolling; verify V1/V2 test journeys, new/legacy embeds, and V3 isolation; correct iframe height feedback without changing other widgets.
- [x] Balance 24k Ring OS bottom actions, restore price + Next, and make its website iframe fit the visible window.
- [x] Make 24k Ring OS ask ring size only in Details and use an inline desktop/mobile-popup carat slider.
- [x] Add 24k-only quarter-carat hand slider, catalogue-aware standard sliders, stable image bucketing, and theme accent colors.
- [x] Prewarm 24k carat hand images after shape selection and show a stable skeleton until each image is decoded.
- [x] Add client-controlled light/dark headers for customer-email logos without changing notification or lead workflows.
- [x] Center Sandbox V3 option layouts, show borders only when selected, auto-advance single-choice steps, and remove “Your design”.
- [x] Sandbox V3 gated estimate, 20 standard quality combinations, simplified controls, and desktop viewport fit.
- [x] Make Sandbox V3 image-led: compact opening copy, right-hand desktop pictures, smaller picture frames and controls, and no Compare and learn.
- [x] Match Sandbox V3's Your design popup to saved colors and make its bottom controls visibly translucent.
- [x] Make top-level Sandbox V3 preview links open from outside sites without changing iframe restrictions or V1/V2 behavior.
- [x] Sandbox V3 monochrome defaults, configurable colors, translucent options and navigation; V2 remains live.
- [x] Sandbox V3 editorial motion: directional steps, choice feedback, progress, estimates, upload confirmation, and reduced-motion support.
- [x] Sandbox V3: one question per step, mobile scroll cue, subtle motion; verify all branches and previews.
- [x] Show only “Next” on intermediate steps in Grillz Builder, Ring Builder, and Custom Enquiry.
- [x] Let clients edit custom-question step names in all three form settings; improve fallback names.
- [x] Verify label behavior and save/load path.
- [x] Add Sandbox-only Quote Estimator V3 test journey, isolated settings, and no-write preview completion.
- [x] Verify the V3 no-write journey and V1/V2 first-step behavior on desktop and phone.
- [ ] Map final V3 imagery when the new image bucket is provided; visual fidelity depends on those assets.
- [x] V3 review fixes: full summary rows, shared currency, write-free test links for V1/V2/V3, styled restart, draft memory.
- [ ] V3 funnel analytics and image-map setting (waiting on bucket)
- [ ] Validate live V3 submission only after release approval; Sandbox V2 stays live and test previews must not trigger CRM, email, or lead writes.- [x] 24k: natural -> quote form (no prices), lab -> full-price Shopify checkout, Ring Size & Details step with size guide. Open: push 24k ring catalogue to Shopify once (needs client action).

## Admin Email Campaigns
- [x] Lead upload with mapping, variables and duplicate checks
- [x] Template library (blocks + HTML), desktop/mobile preview, test send
- [x] Paced campaigns (batch size, interval, daily cap, window, start time), pause/resume/cancel, auto-pause brake
- [x] Reports, one-click unsubscribe page
- [ ] Verify news.jewlx.ai in Resend (blocked: DNS records needed from the team)
- [ ] Add Resend webhook + RESEND_MARKETING_WEBHOOK_SECRET for delivered/open/click/bounce stats (blocked: needs webhook set up in Resend)
- [x] Metal IQ volume tiers (whole-submission weight, 24K bullion rate, refinery cap) + multi-piece submissions — opt-in per account

- [ ] Forms outage: recover DB (restart/resize, awaiting user choice), then cap heavy diamond jobs, lean public lookups, graceful form fallback
