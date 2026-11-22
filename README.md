# Places, Please

An iOS app for memorizing lines. Import a script by photographing its pages or uploading a PDF or Word file, then rehearse with an AI scene partner.

- **Run Lines**: your partner reads the other parts aloud, then listens while you say your line. A chime means word perfect, a soft tone means close (a little off), and a buzz means missed; after a miss you hear the correct line. It keeps running with the screen off.
- **Warm Up**: flash cards. You see a cue line and pick your next line from four choices.
- **Listen**: the whole scene read aloud with a different voice for each character. You can leave gaps to say your own lines.

Built with Expo SDK 58 and Expo Router. Data lives in Supabase (Postgres), and AI calls go through OpenRouter via a Supabase Edge Function.

## Architecture

```
iPhone app (Expo)                       Supabase
─────────────────                       ────────────────────────────────────────────
Guest sign-in → email code (optional) ─→ Auth
scripts / practice_history / profiles  → Postgres (row level security: own rows only)
pages, audio  ────────────────────────→ Edge Function `places-ai` ──→ OpenRouter
                                          • holds OPENROUTER_API_KEY (never in the app)
                                          • logs every call + cost to `places_ai_calls`
                                          • daily spend caps
```

- **Script import**: photos are resized on the device and sent in batches of 3 pages. PDF and Word text is extracted on the server and parsed in chunks. A scanned PDF is sent to the model whole.
- **Line checking**: your recording (16 kHz WAV) is transcribed word for word by the AI. Scoring happens on the device with a word-level edit distance. Perfect means every word matches; close means at least 75% match. Recordings are deleted from the phone right after checking and are never stored.
- **Voices**: free Microsoft neural voices (the Edge "Read Aloud" service, the same one the Python edge-tts package and Ignatius at Home use), with a woman's or man's voice per character. The AI guesses genders when it reads a script; change them under **Voices** on the script page. The phone fetches each line directly from Microsoft (Microsoft refuses these requests from cloud servers, including Supabase), caches it, and fetches the next lines ahead of time. It's unofficial, so there are fallbacks: the `places-ai` function (Azure AI Speech, if `AZURE_SPEECH_KEY` is set), then the phone's built-in voices. **Settings › Scene partner voices** switches between Microsoft and iPhone voices. In a web browser the free voices can't connect, so it uses the browser's voices.
- **Screen-off practice**: background audio mode, plus a silent keep-alive loop so iOS doesn't suspend the app between lines.

## Setup

### 1. Supabase project (shared with Ignatius at Home)

This app shares the `ben@collier.phd` Supabase project with Ignatius at Home. To stay out of the other apps' way:

- Every table, index, function and trigger is prefixed `places_` (`places_scripts`, `places_profiles`, `places_practice_history`, `places_ai_calls`).
- There is **no trigger on `auth.users`**. The app creates its own `places_profiles` row when it first needs one.
- The edge function is named `places-ai`.
- Sign-ins are shared: the same email signs in to both apps. **Delete my data** removes only this app's rows, and deletes the login itself only for a guest.

Apply the schema once: paste each file in `supabase/migrations/` (in order) into the dashboard's **SQL Editor** and run it. (Avoid `supabase db push` here; the shared project's migration history belongs to the other apps.)

### 2. Sign-in (email, same model as Ignatius at Home)

Nobody has to sign in to start: the app creates a silent guest account on first launch. Guests are offered **Save my scripts** after their first finished session and in **Settings › Account**: enter your email, then the emailed code. That signs you in (to a new account, or the one you already use for Ignatius at Home) and copies this phone's guest scripts and history into it; the leftover guest copy is then deleted.

The shared project is already set up for this: anonymous sign-ins are on, and the **Magic link or OTP** and **Confirm sign up** templates already include the code (`{{ .Token }}`). The emails say "Ignatius at Home" because templates are per project; don't change them, Ignatius uses them. (The app doesn't use the link-only **Change email address** template.) The files in `supabase/templates/` are only for the local test stack (`npx supabase start`).

### 3. AI edge function

Set the secrets in the dashboard (**Edge Functions › Secrets**) or with the CLI, then deploy:

```bash
npx supabase login
npx supabase secrets set --project-ref <project-ref> OPENROUTER_API_KEY=sk-or-... ALLOWED_EMAILS=you@example.com
npx supabase functions deploy places-ai --project-ref <project-ref>
```

**Microsoft voices:** nothing to set up; the app uses the free Edge voices. Optional backup: create an Azure **Speech** resource (Free F0 tier) and add `AZURE_SPEECH_KEY` and `AZURE_SPEECH_REGION` secrets. Voice calls made through the function are logged in `places_ai_calls` with purpose `tts`.

`ALLOWED_EMAILS` works like Ignatius at Home's: when it's set, only those signed-in emails can use the AI (script reading and line checking). Guests and other accounts get a "sign in with your email" message. Leave it unset to allow everyone, with only the daily spending caps.

Optional secrets:

| Secret | Default | Purpose |
|---|---|---|
| `OPENROUTER_PARSE_MODELS` | `google/gemini-3.8-flash,google/gemini-2.5-flash` | Script reading (first = preferred, the rest are fallbacks) |
| `OPENROUTER_TRANSCRIBE_MODELS` | `google/gemini-3.5-flash-lite,google/gemini-2.5-flash` | Line transcription |
| `DAILY_USER_LIMIT_USD` | `3` | Per-user daily AI budget |
| `DAILY_TOTAL_LIMIT_USD` | `10` | Total daily AI budget for this app |

### 4. App environment

```bash
cp .env.example .env.local
# fill in EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY (Project Settings › API)
npm install
npx expo start
```

The anon (publishable) key is meant to ship in apps; row level security protects the data. Never put the OpenRouter key or the `service_role` key in `.env.local`.

### Running on a phone

Expo Go works for trying things out. Screen-off practice needs background audio, which only works in a development or production build:

```bash
npx expo run:ios            # local dev build (needs Xcode)
# or
npx eas-cli@latest build --profile development --platform ios
```

## Data persistence (on the device)

The app keeps data on the device so it survives closing and reopening the app, even with no connection:

- **AsyncStorage** (`src/lib/local-store.ts`, `@react-native-async-storage/async-storage`): the user's scripts, settings and current script, saved after every change under a per-user key (`places-please:v1:<user id>`). On launch the home screen shows this copy right away, then refreshes from Supabase. (On web, AsyncStorage uses the browser's localStorage.)
- **Keychain** (`src/lib/secure-storage.ts`, `expo-secure-store`): the sign-in session, so you stay signed in.
- **File cache** (`expo-file-system`): each scene-partner line's audio, so lines play instantly the next time.

Supabase remains the source of truth (and syncs across devices).

## Voices in the web version

Browsers can't connect to Microsoft's free voices directly. For the web build, run the local voice helper next to the dev server:

```bash
npm run voices        # in a second terminal, next to `npx expo start`
```

Without it the browser uses its own voices. The iPhone app doesn't need it.

## AI cost logging

Every OpenRouter request is written to `public.places_ai_calls`: purpose, model requested, model used, tokens, `cost_usd`, latency, status and error. Failed requests and retries are logged too. Only the edge function can write to this table; users can read their own rows, and **Settings › AI usage** shows the 30-day total.

```sql
-- spend by day and purpose
select date_trunc('day', created_at) as day, purpose, count(*), sum(cost_usd)
from places_ai_calls group by 1, 2 order by 1 desc;
```

## Development

```bash
npx tsc --noEmit      # typecheck
npx expo lint         # lint
npx expo-doctor       # dependency check
node scripts/generate-sounds.mjs   # regenerate the sound effects in assets/sounds
```

Local Supabase (needs Docker): `npx supabase start` applies the migration, then put the printed API URL and anon key in `.env.local`.

## Adding exercises

Practice modes share `src/lib/types.ts` (`PracticeMode`), `src/lib/api.ts` (`savePracticeSession`) and the audio helpers in `src/lib/audio/`. To add a new exercise:

1. Add a mode value in `PracticeMode` and in the `practice_history.mode` check constraint (in a new migration).
2. Put the exercise logic in `src/lib/rehearsal/` and the screen in `src/app/scripts/[id]/`.
3. Register the screen in `src/app/_layout.tsx` and add a tile on the home screen (`src/app/index.tsx`).
