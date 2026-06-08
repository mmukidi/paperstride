# PaperStride Feature Status

Last updated: June 8, 2026

This file is the source of truth to update before committing or deploying. If a
feature changes, update this document before pushing to GitHub or deploying to
Oracle Cloud.

## Mission

PaperStride is intended to be free to run and useful worldwide: families,
teachers, and students should be able to generate printable worksheets by age,
grade, skill need, time available, and interest theme without creating student
accounts or sending learner data to a paid external API.

## Already Built

- Next.js landing page with PaperStride branding and privacy-first messaging
- Responsive worksheet creator form
- Inputs for nickname, grade/level, age, interests, struggling areas, goal, and
  time available
- Expert plan preview before worksheet generation
- Local Ollama backend path using native `/api/chat`
- Ollama `keep_alive` env parsing accepts numeric strings such as `-1` so the
  native API receives a valid number instead of an invalid duration string
- Fast blueprint model path with in-memory cache
- Oracle Compose defaults route blueprint, passage, and worksheet generation
  through the fast local model with bounded timeouts; the slower 7B model remains
  available by explicit env override on stronger hardware
- Oracle worksheet generation uses the dynamic deterministic engine by default
  (`WORKSHEET_AI_ENABLED=false`) so student-facing downloads stay fast and do not
  hang behind CPU-only local model calls; AI-authored worksheet sections remain
  available by explicit env opt-in
- Deterministic blueprint fallback when Ollama is unavailable
- Printable HTML workbook generation
- Deterministic worksheet fallback when AI generation fails
- Reading passage, vocabulary, question sections, age-aware activity challenge,
  and answer key
- History-aware fallback generation by grade band, including elementary source
  clues, middle-school chronology/cause-effect, and advanced source
  corroboration for high school, college, and Master's levels
- Books/reading-aware fallback generation by grade band, with stronger reading,
  vocabulary, writing, interpretation, and book-themed math instead of generic
  cross-subject scenarios
- Movies/media-aware fallback generation by grade band, including film evidence,
  scene interpretation, media vocabulary, review writing, and audience-data math
- Dynamic activity/challenge section that changes on each generation instead of
  repeating the same puzzle set for identical inputs
- Dynamic fallback reading scenarios that vary per generation when Ollama is
  unavailable or returns an incomplete passage bundle
- Broad-interest deterministic passages now avoid the old generic "learner who
  enjoys..." opening and use longer grade-band mission variants for stronger
  reading-level fit
- AI passage generation now has a bounded quality attempt plus a fast repair
  attempt before using the deterministic passage bank, preventing long waits and
  reducing unnecessary fallback worksheets when Ollama returns short JSON
- Fallback reading questions and answer keys now align with the fallback passage
  family instead of referencing stale generic passages
- AI question validation that drops incomplete model output before rendering
- Open, print, and download HTML actions for generated worksheets
- Docker Compose deployment with Caddy HTTPS reverse proxy
- Oracle Cloud deployment guide
- Lightweight WebP hero image for faster first page load
- Documented performance evolution in `docs/PERFORMANCE_NOTES.md`

## Current Known Constraints

- Local Ollama must be running for fully AI-authored plans and worksheets.
- When Ollama is offline, the app now remains usable through deterministic
  fallback plans and fallback worksheets.
- The current worksheet output is HTML, not PDF.
- There is no queue, rate limiter, or concurrency display yet.
- There are no saved learner profiles or teacher dashboard yet.
- `next.config.mjs` uses standalone output; production should run the standalone
  server entry, not plain `next start`.

## Major Improvements To Do Next

- Add a visible "local AI offline, using fallback" note for admins or local test
  mode without alarming ordinary users.
- Add PDF export for a true one-click printable file.
- Add print modes for worksheet-only and answer-key-only output.
- Improve answer-key quality with clearer sample answers for open-response
  science, writing, and critical-thinking questions.
- Add a small queue or generation lock before opening to multiple users.
- Add subject focus controls to the frontend if backend subject focus variants
  are kept.
- Expand analytics-free health logging beyond the passage path: request duration,
  fallback used, model used, and generation stage.
- Expand deterministic banks beyond the new history-grade bands into deeper
  math, science, writing, and logic variants for more countries and curricula.
- Add multilingual worksheet support, starting with Spanish.

## Pre-Deploy Checklist

Run these checks before committing, pushing to GitHub, or deploying to Oracle
Cloud:

```bash
npm run predeploy
```

Also verify:

- This `docs/FEATURE_STATUS.md` file reflects the latest shipped behavior.
- `README.md` still matches the current deployment and AI backend.
- `docs/ROADMAP.md` still matches the product direction.
- Local smoke test: homepage loads, expert plan appears, worksheet generates or
  falls back successfully.
- Performance notes are updated when generation speed, model routing, prompt
  shape, fallback behavior, or asset weight changes.
- Smoke generated worksheets should be checked for repeated fallback stories
  when using the same grade/interest inputs more than once.
- Smoke checks must verify passage/question/answer alignment across at least
  History, Books, Movies, Science, and one broad custom interest.
- Server `.env` has the intended `LLM_BASE_URL`, model names, public site URL,
  and contact email.

## Git And Oracle Rule

Do not deploy undocumented product changes. Update this file first, run
`npm run predeploy`, commit, push to GitHub, then deploy Oracle Cloud from the
GitHub-tracked code.
