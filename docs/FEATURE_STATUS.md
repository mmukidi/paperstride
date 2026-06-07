# PaperStride Feature Status

Last updated: June 7, 2026

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
- Fast blueprint model path with in-memory cache
- Deterministic blueprint fallback when Ollama is unavailable
- Printable HTML workbook generation
- Deterministic worksheet fallback when AI generation fails
- Reading passage, vocabulary, question sections, fun zone, and answer key
- Open, print, and download HTML actions for generated worksheets
- Docker Compose deployment with Caddy HTTPS reverse proxy
- Oracle Cloud deployment guide
- Lightweight WebP hero image for faster first page load

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
- Add a small queue or generation lock before opening to multiple users.
- Add subject focus controls to the frontend if backend subject focus variants
  are kept.
- Add basic analytics-free health logging: request duration, fallback used, model
  used, and generation stage.
- Add more deterministic banks for math, science, writing, history, and logic by
  grade band so fallback mode is stronger worldwide.
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
- Server `.env` has the intended `LLM_BASE_URL`, model names, public site URL,
  and contact email.

## Git And Oracle Rule

Do not deploy undocumented product changes. Update this file first, run
`npm run predeploy`, commit, push to GitHub, then deploy Oracle Cloud from the
GitHub-tracked code.
