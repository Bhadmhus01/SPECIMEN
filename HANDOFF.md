# SPECIMEN: handoff

> Reconstructed from the handoff message that started this build, then checked line by line against the two business-plan PDFs in [`docs/business-plan/`](docs/business-plan). Where this file and the plan disagree, the plan wins. Where either disagrees with the code, the code wins.

## Status

| Phase | Weeks | Status |
| --- | --- | --- |
| **0. Validation spike** (clickable reveal) | 1–2 | **Built. Playtest not run yet.** |
| 1. Core loop (care, growth, garden, local save) | 3–6 | Not started. **Gated on the Phase 0 result.** |
| 2. Economy (server-authoritative rolls, albums) | 7–10 | Not started |
| 3. Social and live-ops (challenge cards, gifting, first auction drop) | 11–14 | Not started |
| 4. Launch | 15–16 | Not started |
| 5. Scale (African Specimens pack, second category, first brand deal) | 17+ | Not started |

**The gate.** Build nothing beyond Phase 0 until more than 60% of about 50 playtesters want one more reveal. How to run it and read it: [`docs/phase0-playtest.md`](docs/phase0-playtest.md).

## What SPECIMEN is

A free-to-play, global, asynchronous **rare-plant collector economy**. Players care for plants, open blind-box "pots" (species plus variegation reveal), complete collection albums, bid in time-limited live auctions and send rival challenge cards. The thesis: farming and shop sims exist, but nobody models the real rare-houseplant collector market, with its rarity tiers, blind reveals and auctions.

The plan's framing: **the session is the reveal.** Care exists to create the habit and gate progress, never to be the point. "Reveal polish and ASMR audio are the product."

## Decisions already made (standing)

- **Server-authoritative rolls in production**, signed so a client cannot forge a rarity. (Phase 0 rolls on the device by design; see below.)
- **Procedural plant rendering**: leaf shape × colour × variegation pattern × pot, so 100+ species ship without a hand-drawn pipeline.
- **Web-first PWA**, HTML5 Canvas 2D / WebGL, TypeScript. Backend later: Node or Bun, PostgreSQL, Redis.
- **Disclose AI use from day one.**
- **Published odds, no cash-out, no gambling framing**, and you buy a *specific* sealed pot.
- **Reveal drives acquisition; albums and auctions drive monetisation.** Unboxing monetises poorly through in-app purchase, so it is used for growth.
- **Keep reveals generous and collection-first.** No pity-timer exploitation.
- **Asynchronous only.** Real-time co-op: never. No plant death state.
- **African Specimens is the differentiator.** Whether it launches with v1 or as the first post-launch pack is still open (below).

## v1 cuts, KPIs and risks (from the plan, sections 11–12)

- **Cut for v1:** full trading UI (ship gifting only), persistent auction house (ship time-limited drops only), real-time co-op (never), African Specimens pack (post-launch), exploration tracks, a second category.
- **KPIs:** Phase-0 replay intent above 60% want one more · day-1 retention above 40% · day-7 above 18% · reveal-to-share above 5% · IAP conversion above 2% of DAU · DAU/MAU at day 60 above 25% · auction participation above 20% of actives · cost per install below $0.80.
- **Modelled revenue** (scenarios, not forecasts): Year 1 $4.38M, Year 2 $17.52M, Year 3 $51.10M.
- **Risks to design around:** gacha regulation (Singapore blind-box rules, February 2026): published odds, no cash-out · review-bombing over AI art: disclose · review-bombing over gacha fairness: generous odds · care becoming a chore: make the session the reveal · unboxing monetising poorly: use it for acquisition.

## What the Phase 0 build is

The reveal loop, end to end: a sealed clay egg drops into a terracotta pot, three taps (two cracks, then the break), a burst, a procedurally drawn plant grows out, the rarity is announced, a specimen tag appears, **One more**. About 4 to 5 seconds of animation per pot, plus however long the player looks at the result, which puts a typical pot inside the plan's 5 to 15 second target. Plus the instrumentation to measure the exit criterion. Architecture and commands are in the [README](README.md).

## Choices I made that you should review

None of these were specified, so they are mine. All are one-line edits in [`src/config.ts`](src/config.ts) unless noted.

| Choice | What I picked | Why, and what to check |
| --- | --- | --- |
| **Rarity names** | Common, Uncommon, Rare, **Grail** (1 to 4 pips) | The plan names no tiers. "Grail" is collector slang for a most-wanted plant. Check it against the brand voice. |
| **Odds** | 50 / 30 / 15 / **5** % | About one pot in two is better than Common, and a Grail is 1 in 20: generous, per "collection-first". Over a five-pot session about 1 person in 4 (1 − 0.95⁵) sees a Grail. These are not an economy design. |
| **The plants** | *Monstera deliciosa*, snake plant, *Pilea peperomioides* | Three deliberately different silhouettes (split heart, upright blades, round coins) so variety is visible at a glance. Equal chance, independent of rarity. |
| **Four looks per plant** | Classic green, speckled, half-moon, pink tricolor marble | One look per rarity in Phase 0 (rarity ↔ form is 1:1). The plan's separate "variegation roll" arrives with the album in Phase 1–2. |
| **When the roll happens** | When the pot drops, **before any tap** | Lets the plant be built while the pot idles, and means the animation can never decide an outcome. A unit-tested trust property. Production moves this to the server. |
| **Pre-burst "tell"** | The cracks glow a little more, and slightly toward the tier colour, on tap 2 (`TUNING.tell`) | Builds anticipation, but it also shows a Common coming. Worth an A/B: set `tell` to `{ tint: [0, 0], bias: 0 }` for a pure surprise. |
| **"One sound"** | A small set of synthesised cues (crack, burst, leaf pops that climb a scale, rarity chimes) | The plan says "one sound", but a reveal with no crack or burst cannot feel right. Escalates with rarity. No audio files. |
| **No rigged first pull** | The first pot is rolled like any other | A rigged first pull would inflate the exact number the test measures. `?force=` exists for demos and is excluded from results. |
| **No mini-album** | None | It would confound a test of whether the *reveal* feels good. |
| **Disclosure copy** | AI use, "free, no cash-out" and data collection, in the Odds & info dialog | Written to be true of this build. Have it reviewed before any public release. |
| **Where results live** | The device's `localStorage`, moved by Copy or Download | Remote, unattended testing needs a collection endpoint, which I left out of scope. |

## Still open (need you)

These do not block Phase 0. They are the plan's own section 13.3, unchanged:

1. **Launch differentiator:** lead with the African Specimens category at launch, or hold it as the first post-launch content pack? (The plan's scope section currently holds it for post-launch.)
2. **First platform:** web and PWA first, or straight to the app stores? (The plan leans web and PWA first.)
3. **Funding route:** bootstrap, raise, or pursue a platform or publisher deal?
4. **Regional rollout:** single-region soft launch, or global on day one?
5. **First brand partnership target**, and what is commercially acceptable.

One more to settle **before** the test, because the plan words the failure case two ways: the phase table says that if Phase 0 fails, "the concept is wrong, not the execution"; the KPI table says "rework the reveal before building anything." Those lead to different next steps (shelve or re-test). Decide which you mean before you see the number.

## What I could not verify

- **Real devices.** Browser testing ran in headless Chromium with software rendering, which is slower than any phone and behaves differently (it showed time-based frame-rate collapses even for a trivial control page). The frame-rate governor and cached sprites are there for weak phones, but dry-run on the actual devices, especially an older Android and an iPhone, before the real sessions.
- **iOS audio.** Not testable here. See the playtest guide for the silent-switch caveat.
- **Business-plan figures.** I read the PDFs to align the build and these notes; I did not independently check their market numbers.

## Environment notes (from the original handoff)

- The handoff named the project path `/home/user/specimen/`. The repository is `Bhadmhus01/SPECIMEN`.
- Do **not** use the `penalty-kingz` repository. It is unrelated to this project.
- Document generation: weasyprint does not work in the sandbox (missing pango and cairo); use `fpdf2` plus `python-docx`. DejaVu fonts are expected at `/usr/share/fonts/truetype/dejavu/`. The sandbox may wipe files between sessions: verify files exist before relying on them.
- The generator scripts `build_plan.py` (full plan) and `build_all.py` (earlier, shorter plan) were pasted into the chat but are **not** in this repository, and the `.docx` and `.html` outputs were never supplied. I did not retype them from the chat, to avoid transcription errors. If you want them in the repo, paste or attach the original files.

## Next steps

1. Dry-run the build on the real test devices. Check sound, smoothness and that the specimen tag fits.
2. Settle the failure-case question above, and who facilitates.
3. Run the playtest: [`docs/phase0-playtest.md`](docs/phase0-playtest.md). Aim for about 50 people.
4. `npm run playtest:report -- *.jsonl` for the verdict.
5. **Pass:** start Phase 1 (core loop). **Fail:** do not build further; act on the failure rule you chose.
