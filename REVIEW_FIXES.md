# Fixes for `REVIEW.md`

Every FAIL and WARN in `REVIEW.md` except item 15. Item numbers match the review.

| # | Finding | Status |
|---|---|---|
| 7 | Warm Up not guaranteed multiple choice | Fixed |
| 15 | Offline behavior | Not a fail (see below) |
| 16 | Not every OpenRouter call logged | Fixed |
| 17 | Azure TTS: no send-time record, estimated cost | Fixed where possible |
| 18 | Failed guest merge can strand scripts | Fixed |
| 19 | Account change races stale data requests | Fixed |
| 20 | Post-sign-in refresh uses the guest's ID | Fixed |
| 21 | Audio session left active after errors | Fixed |
| 22 | Failed history save treated as saved | Fixed |
| 23 | Listen history counts the wrong lines | Fixed |
| 24 | Cancel doesn't stop the network request or its cost | Partly fixed |
| 25 | No automated tests | Fixed |
| 26 | Moderate transitive vulnerability (`minimatch`) | Fixed |
| 27 | Local settings skip validation | Fixed |
| 28 | Spend caps not atomic | Fixed |

## Checks after the fixes

- `npm run typecheck` (app and tests): no errors
- `npx expo lint`: no problems
- `npm test`: 21 of 21 pass
- `npx expo-doctor`: 20 of 20 checks pass
- `npm audit --omit=dev`: 0 vulnerabilities
- `deno check` on the edge function: passes
- Deployed to the shared Supabase project: migration `20261122020000_places_ai_call_ledger.sql` and the updated `places-ai` function. Both ledger tests in item 16 ran against it.
- The app loads in the browser with no console errors.

---

## 7. Warm Up is now always multiple choice — Fixed

`src/lib/rehearsal/warmup.ts`

- Every card has the right answer plus at least one wrong answer, and up to three.
- Wrong answers must read differently from the answer and from each other, after ignoring case and punctuation (`normalizeForChoice`). They come from your other lines first, then other characters' lines, and are never the cue itself.
- Cues that can't get a wrong answer are skipped. `warmupAvailable` is true only if at least one real multiple-choice card can be built, so the Warm Up button is disabled otherwise.
- **Tests** (`test/warmup.test.ts`):
  - Across 50 random seeds, every card has at least 2 choices, includes the answer, has no two choices that read the same, and never offers the cue.
  - A script whose only other lines are "Here?", "here" and "HERE!" correctly gets no Warm Up.

## 15. Offline behavior — Not a fail

Per Ben: the spec line "This app relies on API's … and can't be used offline" means offline support isn't *required*, not that it's forbidden. Offline features were added on top of it. No change.

## 16. Every OpenRouter call is logged when sent — Fixed

New migration `supabase/migrations/20261122020000_places_ai_call_ledger.sql`; `supabase/functions/places-ai/index.ts` (`beginCall`, `finishCall`, `callOpenRouter`).

- **Before sending:** each attempt calls the Postgres function `places_begin_ai_call`. It inserts a row with `status = 'pending'` and an estimated cost (`cost_is_estimate = true`), and the call is only sent once that row exists. If the row can't be written, the call is not sent (fail closed).
- **After the reply:** the row is updated with the status, model, tokens, latency and OpenRouter's reported `usage.cost` (`cost_is_estimate = false`), plus `completed_at`. The update is retried 3 times.
- **If the function dies mid-call:** the row stays `pending` with its estimate, so a sent call is never missing from the log. A failed final update has the same effect: the call still appears, with a conservative cost.
- **Timeouts:** they keep the estimate, because the provider may still bill them. Error responses record OpenRouter's reported cost if there is one, otherwise $0.
- **Covers all three paid calls:** script parsing, gender guessing and transcription all go through `callOpenRouter`.
- **Verified live:**
  - A gender-guessing call was logged as `pending` before sending, then completed with OpenRouter's reported cost ($0.000156, `cost_is_estimate = false`).
  - A parse call cancelled after 0.5 s already had its `pending` row with the $0.05 estimate.

## 17. Azure TTS backup — Fixed where possible

- **Send-time record:** Azure calls now go through the same ledger. They're logged as `pending` before sending and completed after.
- **Cost:** Azure's API doesn't report billed usage per request, so the cost has to be the list price for the characters sent. That's now labelled explicitly with `cost_is_estimate = true`, instead of looking like a real billed amount.
- **Still applies:** this backup only runs if `AZURE_SPEECH_KEY` is set (it isn't now). Voices normally come free from Microsoft's Edge voices on the phone.

## 18. A failed guest-to-email merge no longer strands scripts — Fixed

`src/lib/guest-merge.ts` (new), `src/lib/api.ts` (`importGuestData`, `MergeProgress`), `src/lib/local-store.ts` (pending-merge storage), `src/lib/account.ts`, `src/providers/data-provider.tsx`, `src/app/account.tsx`

- **Saved first:** before copying starts, the guest's scripts and history are saved on the device (AsyncStorage) as a *pending merge* for the new account.
- **Resumable:** progress is saved after every copied script and history batch (old→new script IDs, batches done). A retry skips anything already copied, so nothing is duplicated.
- **Automatic resume:** if copying fails (no network, app closed), the account still signs in and the user is told the copy will finish automatically. `DataProvider` resumes it the next time that account loads, then refreshes.
- **Cleanup only after success:** the leftover guest data is deleted only after the copy completes.
- **One copy at a time:** an in-memory lock stops the sign-in screen and `DataProvider` from copying at the same time.

## 19. No more stale account data — Fixed

`src/providers/data-provider.tsx`

- `refresh` now reads the *current* user from a ref and tags each request with a generation number. Results are thrown away if the account changed or a newer request started while it was in flight.
- So a late response for a previous account can't overwrite the new account's scripts, and can't be saved to the new account's device storage. The device copy is also only applied if it still belongs to the current user.

## 20. Post-sign-in refresh uses the right account — Fixed

`src/providers/data-provider.tsx`

- `refresh` no longer captures `userId` when the component renders; it reads the signed-in user when it runs. So the sign-in screen's `refresh()` after the email code loads the new account's scripts and profile, not the guest's.

## 21. Audio is released after errors — Fixed

`src/lib/rehearsal/line-runner.ts`, `src/lib/rehearsal/listen-player.ts`

- When Run Lines or Listen stops on an error, it now cancels speech and recording and calls `releaseAudioSession()`. That stops the silent keep-alive and returns the audio session to normal, so other apps' audio can resume and the battery isn't drained in the background.

## 22. A failed history save can be retried — Fixed

`src/hooks/use-session-saver.ts`, `src/components/session-summary.tsx`, `src/app/scripts/[id]/run.tsx`, `src/app/scripts/[id]/warmup.tsx`

- A session is marked saved only *after* the insert succeeds. An in-flight flag stops duplicate saves.
- If saving fails, the summary shows **Try saving again**, and leaving the screen tries once more. The session isn't lost because of one network hiccup.

## 23. Listen history counts the lines actually heard — Fixed

`src/lib/rehearsal/listen-player.ts`, `src/app/scripts/[id]/listen.tsx`

- The player records which lines were played (or left as a gap for you) all the way through, in a set, so a line counts once.
- History is saved with that count. Hearing just the first line, or finishing a one-line scene, is now saved. Starting at line 10 no longer claims 11 lines.

## 24. Cancelling an import — Partly fixed

`src/lib/ai.ts`, `src/lib/script-import.ts`, `src/app/scripts/new.tsx`, `supabase/functions/places-ai/index.ts`

**Fixed:**
- Cancel (and leaving the screen) now aborts the in-flight network request through an `AbortController` passed to `functions.invoke({ signal })`. The import stops immediately and doesn't retry after a cancel.
- The edge function aborts its outgoing OpenRouter request when it sees the app disconnect, and doesn't start a retry after a cancel.

**Not fixable here:**
- **Hosted Supabase doesn't tell the function the app disconnected.** In a live test, a parse cancelled after 0.5 s still ran on the server for 18.8 s.
- **OpenRouter bills a non-streaming request once it has started.** So a cancelled import can still cost money.

What *is* guaranteed: the call is always recorded with its real cost (see 16). Stopping the cost itself would mean switching parsing to streaming responses.

## 25. Automated tests — Fixed

`test/` (new), `package.json` (`test`, `typecheck` scripts), `test/tsconfig.json`

`npm test` runs 21 tests with Node's built-in test runner. There are no new test-framework dependencies; `test/alias-hooks.mjs` resolves the app's `@/` imports.

- **Scoring:** perfect, close and missed; case and punctuation; numbers and spelling variants; extra words.
- **Script model:** name normalization, merging a speech across a page break, cue pairs, scenes.
- **Warm Up:** the multiple-choice guarantees (item 7).
- **Validation:** settings and gender sanitizing (item 27).
- **Voice token:** the Microsoft voice token matches reference values produced by the official edge-tts 7.3.1 Python package.

**Still not covered:** account migration, background-audio state and the network paths need device/integration tests. Their pure logic was moved into tested modules where possible.

## 26. Vulnerable `minimatch` — Fixed

`package.json` → `"overrides": { "@expo/fingerprint": { "minimatch": "11.0.4" } }`

- Pins the patched `minimatch` (the advisory covers `< 11.0.1`) inside Expo's fingerprint tool, without the breaking Expo downgrade `npm audit fix` suggested. 11.0.4 was released 2026-11-02.
- **Verified:** `npm audit --omit=dev` reports 0 vulnerabilities, `@expo/fingerprint` still computes a project fingerprint, and `expo-doctor` passes 20 of 20.

## 27. Local settings are validated — Fixed

`src/lib/sanitize.ts` (new), `src/lib/api.ts`, `src/lib/local-store.ts`

- One `sanitizeSettings` function (and `sanitizeGenders`) now validates settings from Supabase *and* the on-device copy. Unknown or out-of-range values (speech rate, pause length, enums, booleans) fall back to safe defaults before any audio code uses them.
- **Tests:** `test/sanitize.test.ts`.

## 28. Atomic spend caps — Fixed

`places_begin_ai_call` in the ledger migration.

- **Atomic:** the cap check and the pending-row insert happen in one transaction under `pg_advisory_xact_lock`. Simultaneous requests are handled one at a time, so they can't all pass the check and overshoot together.
- **Reservations count:** each pending call reserves its estimated cost, so calls still in flight count toward the cap.
- **No truncation:** totals are computed with SQL `SUM` over today's rows, instead of fetching up to 20,000 unordered rows.

---

## Also fixed while doing this: Listen going silent in the browser

Reported during this work: "the Listen function doesn't play sound".

- **Cause:** Microsoft's free voice service sometimes stalls on one voice (Ava). Each stalled line waited 15 s before falling back, so it sounded broken. Browsers with stale pages also still had Willy cast as a woman.
- **Fix** (`src/lib/audio/tts.ts`, `src/lib/audio/edge-tts.ts`, `scripts/tts-proxy.mts`):
  - Voice requests now give up after 6 s.
  - Before falling back to the device voice, the app tries the next voice of the same gender.
- **Verified:** in a fresh browser page, Listen played Microsoft audio for each line.
