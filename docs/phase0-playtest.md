# Phase 0 playtest guide

How to run the validation spike and read the result. Allow about an hour to prepare and a few minutes per participant.

## What this decides

From the [business plan](business-plan/SPECIMEN_Full_Business_Plan.pdf), section 11.1: *"Clickable reveal prototype: three plants, one pot, one sound. Test with 50 people. **More than 60% want one more reveal.** If not, the concept is wrong, not the execution."*

> **Decide before you start what a FAIL means.** The plan words it two ways: the phase table says "the concept is wrong, not the execution" (shelve or rethink the idea), while the KPI table says "rework the reveal before building anything" (iterate and re-test). They lead to different next steps. Agree with yourself which one you mean *before* you see the number, so the result cannot pick the interpretation.

## What the build measures

| Signal | How | Role |
| --- | --- | --- |
| **Pressed "One more" after their first reveal** | Automatic, logged per participant | **The headline number.** It is the behavioural reading of "want one more reveal". |
| **Said they would open another** | You tap **Yes** or **No** in the facilitator panel after asking | A second, independent reading. Reported beside the headline, not blended into it. |
| How long they paused before pressing | Automatic | Separates an instant reflex from a considered choice. |
| Appetite across pots | Automatic | Does "one more" hold after reveal 2, 3, 4? A first-pot bump that fades is a warning. |
| Poked the finished plant | Automatic | A sign of engagement rather than waiting. |
| Device had to lower render quality | Automatic | Flags laggy devices: discount those participants. |
| Observed rarity mix | Automatic | Sanity check against the published 50 / 30 / 15 / 5. |

**The verdict** applies your threshold exactly: *PASS* if the share who pressed "One more" is **strictly more than 60%** and at least 30 participants are logged; *FAIL* if not; *INSUFFICIENT DATA* below 30. It also prints a 95% confidence interval and says whether the result is **clear** (the whole interval is on one side of 60%) or **borderline**. At 50 people the interval is about ±13 points wide, so a result between roughly 47% and 73% is borderline and more participants would firm it up.

**Debug runs never count.** Any session started with `?force=`, `?species=` or `?seed=` is flagged and excluded, so a demo pull cannot move the number.

## Honest limits of this test

- **The button is big and inviting by design**, because it *is* the product's loop. Some presses will be reflex or politeness. That is why the verbal answer and the pause time are recorded. If the behavioural number looks high but the verbal answers and pauses do not, trust the cautious one.
- **It is free.** Wanting another free reveal is an upper bound on wanting one in a real game. It tests the *feel*, not willingness to pay.
- **Being watched inflates enthusiasm.** The script below keeps you quiet for exactly this reason.
- **Friends and family are kind.** Aim for at least 30 people who do not know you, and a mix of phones.
- **The roll happens on the device** in this build. That is fine for a feel test; nobody can gain anything by tampering with it.

## Before you start

1. **Host the build.** `npm run build`, then upload `dist/` anywhere that serves static files (GitHub Pages, Netlify, itch.io, S3), or run it on your own machine with `npm run dev` and open the Network URL on the phones (same Wi-Fi). Prefer **https**: the clipboard needs it for *Copy results*.
2. **Dry-run on every device you will use**, including the oldest Android and an iPhone. Check that it is smooth, the sound plays, and the specimen tag and button fit on the screen. If a device stutters, the build lowers its own resolution and logs it, but you want to know first.
3. **Sound.** Turn the volume up (about 70%), use the speaker, not headphones, in a reasonably quiet room. **iPhone:** if there is no sound, flip the ringer switch to ring: older iOS mutes web audio on silent. The very first crack on iOS can also be a beat late, because browsers only unlock audio after a touch.
4. **Open the facilitator link** on the device you will hand over: `https://your-host/?test=1`. The panel shows the participant number (P001...). Make your dry-run pulls, then press **Erase log** so practice does not count.
5. **Hide the panel** (the × button) before handing the phone over. It stays hidden through reloads.

## Running a session

**Say exactly this, then stop talking:**

> "This is a tiny prototype I'm working on. Have a go and do whatever you like. I won't say anything while you play, and there are no wrong answers."

Hand over the phone. Then:

- **Do not** explain, hint, say "tap again", or react out loud to what they get.
- **Do not** let the next person watch beforehand: the surprise is what you are testing.
- **Watch, and note** (on paper, outside the app): any hesitation before the first tap, laughs and "oh!"s, whether they showed someone, whether they tried to tap the plant, whether they seemed bored by pot 3.
- **The session ends** when they hand the phone back, or when a plant has finished and they have not pressed One more for **20 seconds**, or after **5 minutes**.

**Then ask, in this order:**

1. *"If you could open another one right now, would you?"* Press **Yes** or **No** in the facilitator panel (hold the SPECIMEN wordmark for a second to open it, or Shift+T on a keyboard).
2. *"What was the rarest one you could have got?"* A check that the rarity is legible (the plan's share KPI depends on it). Note their answer on paper.
3. One or two open questions: *"What did you notice?"* *"What felt good, or flat?"* Write the answers on paper.

Then press **Next participant**. The page reloads to a clean game with the panel hidden, ready to hand to the next person. Participant numbers continue (P002, P003...) and earlier data is kept.

## After the sessions

1. On **each device**, open the facilitator panel and **Download** (or **Copy results** and paste into a file). Save the `.jsonl` files together, for example in `playtest-results/` (git-ignored by default, because it holds per-participant data).
2. Run the report. Pass every file at once: each event carries a device id, so P001 on one phone and P001 on another stay separate people, and overlapping exports are de-duplicated.

   ```bash
   npm run playtest:report -- playtest-results/*.jsonl
   npm run playtest:report -- --json playtest-results/*.jsonl    # machine-readable
   ```

3. **Read it in this order:** the verdict and its *clear / borderline* note; then the verbal yes-rate; then appetite by reveal; then how many devices lowered their quality; then the rarity mix (it should hover near 50 / 30 / 15 / 5).

| You see | Meaning | Do |
| --- | --- | --- |
| PASS, clear | The reveal works | Start Phase 1 |
| PASS, borderline | Probably works, not proven | Run 20 more people before committing |
| FAIL, clear | The reveal does not pull people back | Apply the failure rule you chose before the test |
| FAIL, borderline | Could be a near miss | Read your paper notes: what did the "no" people say? Fix that, retest |
| INSUFFICIENT | Fewer than 30 counted | Keep going |
| Behavioural high, verbal low | Reflex presses | Treat as a weak pass; look at the pause times |

Findings from the open questions are worth more than the percentage when it fails: they say *why*.

## An experiment worth one afternoon

How much the cracks hint at the rarity before the burst is one setting, `TUNING.tell` in [`src/config.ts`](../src/config.ts). On, a Common is visibly coming on tap 2. Off (`{ tint: [0, 0], bias: 0 }`), every pot is a complete surprise. Run 25 people on each and compare. Serve the two builds from different hostnames or ports (browser storage is shared across all paths of one origin, so two paths on one host would mix their logs), and run the report on each set of exports separately.

## Data and privacy

The log holds no names and no typed text: only taps, which plants were opened, timings, a short browser string and the screen size. It stays on the device in `localStorage` until someone exports it. Tell participants it exists (the **Odds & info** dialog says so), delete the exports when you have the numbers, and do not add personal details to the file names.

## Troubleshooting

- **No sound on iPhone:** ringer switch (see above); also check the speaker button is on.
- **Copy results fails:** the clipboard needs https. Use **Download** instead.
- **A participant's number looks wrong after a reload:** reloads keep the same participant on purpose. Only **Next participant** moves on.
- **Private browsing:** logs may not persist. Use a normal tab.
- **Lost the panel:** hold the SPECIMEN wordmark for one second, or add `?test=1` and reload.

## Event reference

One JSON object per line. `t` is epoch milliseconds; `participant` is per-device (`P001`...); `device` is a random id for the browser profile.

| `type` | Extra fields | Logged when |
| --- | --- | --- |
| `session_start` | `build`, `ua`, `viewport`, `dpr`, `reducedMotion`, `sound`, `debug` | A participant starts, and on every reload |
| `pot_drop`, `pot_ready` | `index` | A pot falls; it lands and can be tapped |
| `tap` | `index`, `n` | Each accepted tap on the pot |
| `reveal` | `index`, `species`, `tier`, `form`, `msToOpen` | The shell breaks |
| `settled` | `index` | The plant finished growing (a reveal is *complete* from here) |
| `one_more` | `index`, `msSinceSettled` | The player pressed One more |
| `boop` | `index` | The player poked the finished plant |
| `quality_drop` | `scale` | The device was slow, so resolution was lowered |
| `verbal` | `answer` (`yes` / `no`) | You recorded the spoken answer |
