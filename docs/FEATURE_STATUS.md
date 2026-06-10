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
- Art-aware Grade 9 through adult fallback generation now uses authentic visual
  analysis, conservation, curation, composition, symbolism, exhibition math,
  pigment science, and public-art context instead of inserting the word "Art"
  into generic study-skills questions
- Advanced Art answer keys include worked quantitative solutions and concrete
  model responses for vocabulary, visual analysis, conservation science,
  curatorial writing, logic, and critical thinking
- A deterministic Grade 12 Art regression check blocks known quality failures
  including broken theme grammar, incorrect learner-level references,
  elementary algebra, generic answer placeholders, and missing art-domain content
- Deterministic plans now use the learner's selected goal, available time, and
  reported struggle areas: weak subjects receive extra guided practice,
  catching-up plans use confidence-first scaffolding, getting-ahead plans use an
  advanced profile, and quick sessions reduce overload
- Motivation strategy now changes by developmental band: short varied success
  loops for young learners, mission checkpoints for elementary learners,
  autonomy and meaningful products for middle grades, and authentic disciplinary
  decisions and trade-offs for older learners
- The frontend now exposes Balanced, More Math, More Reading, Math Focus, and
  Reading Focus choices instead of silently forcing every learner into a
  balanced worksheet
- Deterministic plans honor subject focus by changing the actual section mix and
  question allocation; focused plans remove unrelated sections while preserving
  a short context passage where useful
- Printable response space now scales to the task: compact working space for
  multiple choice, ruled short-response space, and extended space for writing,
  argument, design, comparison, and critical-thinking prompts
- Gaming, Coding, Robots, Minecraft, and Technology now have an advanced
  domain pathway covering algorithms, debugging, latency, controlled usability
  tests, optimization, robotics constraints, human factors, and product decisions
- Sports interests now have an advanced pathway covering biomechanics,
  periodized training, fatigue, recovery, performance variance, tactics,
  controlled comparisons, athlete voice, and evidence-based coaching decisions
- Music interests now have an advanced pathway covering rhythm, timbre, motifs,
  dynamics, arrangement, acoustics, controlled listening tests, performance
  interpretation, and production trade-offs
- Cooking and Baking interests now have an advanced pathway covering food
  chemistry, recipe ratios, sensory testing, allergen safety, cost, yield,
  controlled prototypes, kitchen workflow, and waste reduction
- Nature, Animals, Ocean Life, Ecology, and related interests now have an
  advanced pathway covering biodiversity, indicator species, sampling design,
  confounding variables, field evidence, ecological interventions, and
  stakeholder trade-offs
- Elementary Cooking and Nature worksheets now use concrete test-kitchen and
  backyard-field-team stories with ordered directions, equal groups, tally
  charts, safe observation, drawing, and hands-on final products
- Unrecognized custom interests now pass through an interest-interpretation
  layer instead of the old generic evidence-board fallback. The engine maps the
  topic to an authentic design, collection, performance, systems, exploration,
  or community lens and chooses a real role, audience, artifact, evidence type,
  decision, and final product
- Custom-interest grammar and math no longer insert the raw interest into
  awkward sentence templates. Advanced custom worksheets now use audience
  comprehension, weighted criteria, budgets, exceptions, constraints, and
  revision decisions that work naturally for arbitrary topics
- Quality regression checks now cover Grade 12 Art, Grade 10 Technology, a
  Grade 11 Sports learner, Grade 12 Music, a Grade 6 catching-up learner with
  Reading and Fractions needs, College Cooking, Grade 11 Nature, elementary
  Cooking and Nature, custom Vintage Trains and Ballet interests, and an
  advanced getting-ahead learner
- Regression checks also verify Math Focus and Reading Focus subject mixes and
  the task-aware printable response-space classes
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
