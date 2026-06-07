# PaperStride — Product Roadmap

## What PaperStride Is

A self-hosted, AI-powered printable worksheet generator for students Pre-K through
college. Parents and teachers fill in a short form; an expert-panel LLM pipeline
designs and generates a complete, personalised, printable workbook — no student
accounts, no screen time, no external API dependency.

All AI inference runs on a local Ollama instance on the Oracle Cloud server.
No worksheet data ever leaves the server.

---

## Current Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 15, React 19, TypeScript |
| Styling | Scoped CSS (no Tailwind) |
| AI backend | Ollama — `qwen2.5:7b-instruct` + `llama3.2:3b` |
| Web server | Caddy 2 (HTTPS, reverse proxy) |
| Container | Docker Compose |
| Host | Oracle Cloud Always Free ARM — 4 cores, 24 GB RAM, 45 GB disk |
| Repo | github.com/mmukidi/paperstride |

---

## Current Live Features (as of June 2026)

### Input
- Learner nickname, grade (Pre-K → Master's), age (3–26), free-text interests
- Interest chips plus custom interest field
- Struggling area chips
- Today's goal selector
- Time available selector

### AI Pipeline
- **Blueprint call** — one LLM call designs the curriculum plan (subjects,
  question counts, skills, challenge level)
- **Blueprint fallback** — if the local Ollama backend is offline, a deterministic
  age/grade-aware plan is returned so the preview flow still works
- **Passage bundle call** — one LLM call writes an original reading passage,
  6–8 vocabulary cards, and reading comprehension questions
- **Deterministic fallback** — if any LLM call fails, static question banks
  fill in seamlessly; the worksheet always completes

### Worksheet Output (HTML)
- Original reading passage (AI-written, interest-themed)
- Vocabulary in context cards (word, definition, example, memory hint)
- Reading comprehension questions
- Math Reasoning, Grammar & Writing, Science Investigation, Logic & Patterns,
  Social Studies, Critical Thinking (all from static banks currently)
- Fun Zone: pattern puzzles, word search, spot the difference, crack the code
- Extension Challenge replaces Fun Zone for high-school/adult outputs, with
  source-analysis and argument tasks when the interest is History
- Books/reading interests bias fallback output toward literature, text evidence,
  vocabulary, writing, interpretation, and book-themed quantitative reasoning
- Movies/media interests bias fallback output toward scene evidence,
  interpretation, media vocabulary, review writing, and audience-data reasoning
- Answer sheet with explanations, watch-outs, and next-time tips
- Print / Download / Open buttons

### Infrastructure
- Fully containerised (Docker Compose — web + Caddy)
- Auto HTTPS via Caddy + DuckDNS
- Git-tracked deployment (pull → rebuild → run)
- Local Ollama inference (no external API key required)
- Feature/deploy status checklist in `docs/FEATURE_STATUS.md`
- Lightweight WebP hero image for faster first page load

---

## What Is Being Built Now — Phase 1

### 1. Richer Input Form
New fields alongside existing nickname / grade / age / interests:

| Field | Options |
|---|---|
| Struggling with | Reading · Fractions · Word Problems · Vocabulary · Grammar · Writing · Science · Logic |
| Subject focus | Balanced · More Math · More Reading · Math Only · Reading Only |
| Today's goal | General Practice · Test Prep · Catching Up · Getting Ahead |
| Time available | 20 min · 40 min · 60+ min |

### 2. Expert Panel Blueprint (Phase 1 — backend)
The blueprint LLM call becomes a five-persona expert panel. Each persona owns
a specific domain and can override others:

- **Educator** — subject mix, skills, curriculum standards, reading level
- **Developmental Psychologist** — question count, difficulty curve, confidence path
- **Motivational Coach** — interest integration, mission framing, fun zone design
- **Test Readiness Coach** — question formats, trap answers, SAT-style thinking
- **Learning Support Specialist** — weak area targeting, scaffolding hints, parent note

Blueprint output expands to include: `estimatedMinutes`, `themeThread`,
`parentNote`, per-section `isWeakArea` and `interestConnection`.

### 3. Expert Plan Preview Window (Phase 1 — frontend)
Before generating the worksheet, users see a live preview of what the expert
panel recommends:
- Theme thread and estimated time
- Reading passage topic and word count
- Section breakdown with question counts and visual bars
- Weak-area indicators
- Auto-generated parent note
- "Adjust" or "Generate Worksheet" choice

### 4. AI Generation Pipeline (Phase 1 — backend) — performance-tuned

The pipeline is now **3 LLM calls** (down from up to 7), and the blueprint runs on
the fast model:

```
Step 1 (preview)   Blueprint        →  llama3.2:3b   (internal plan, cached per input)
Step 2 (generate)  Passage bundle   →  qwen2.5:7b    (passage + vocab)
Step 2 (generate)  All sections     →  llama3.2:3b   (ONE batched call, all subjects)
```

When the frontend reuses the preview's blueprint, the generate step is just **2 calls**
(passage + batched sections).

Performance levers, all baked into the request (no server config needed):
- **Native `/api/chat`** instead of OpenAI-compat, so we can set:
- **`keep_alive: -1`** — models stay resident; swapping 7B↔3B never reloads from disk.
- **`num_thread: 4`** — pin to all physical cores (one request uses the whole CPU).
- **`num_ctx: 4096`** — capped context = smaller KV cache, faster prefill.
- **Blueprint on 3B** — internal planning is validated anyway; turns a ~3 min preview
  into well under a minute.
- **Batched sections** — one call pays the shared context prefill once instead of N times.
- **Blueprint cache** — identical inputs return the preview instantly (1 h TTL).
- **Grade-aware deterministic banks** — stronger fallback quality without extra
  model calls, now including history-specific source and timeline work.
- **Per-generation fallback variation** — when local AI misses a passage, the
  fallback story and question lens still change on each request.

Resilience preserved: if the batched call fails or omits a subject, that subject is
retried individually, then falls back to the deterministic bank. The worksheet always
completes.

Single-model experiment: set `LLM_PASSAGE_MODEL=llama3.2:3b` to run the *entire*
pipeline on the fast model — no 7B, no swaps, lowest latency — trading some passage
prose quality. Flip back by unsetting the var.

### 5. Streaming Progress Feedback (Phase 1 — frontend)
Live progress steps shown during generation so the ~50s wait feels active:
- Designing your worksheet plan…
- Writing reading passage…
- Building Math questions…
- Building Science & Logic…
- Assembling…

### 6. UI/UX Redesign (Phase 1 — frontend)
- Interest chips with emoji quick-picks + custom field
- Struggling-with chips
- Goal cards
- Time selector buttons
- Blueprint preview panel (animated, sectioned, with parent note)
- Cleaner, more conversational form language

---

## Phase 2 — Planned (Next Quarter)

| Feature | Notes |
|---|---|
| Separate print modes | "Print Worksheet Only" / "Print Answer Key Only" — CSS toggle, no new generation |
| PDF export | Headless browser (Puppeteer) so download is a real PDF |
| Worksheet summary header | "16 questions · Math + Reading focus · ~38 min" shown at top of worksheet |
| Difficulty stars per question | ⭐ easy / ⭐⭐ medium / ⭐⭐⭐ stretch on every question card |
| Cross-section coherence | Math/science/history problems reference the reading passage scenario |
| OLLAMA_NUM_PARALLEL=2 | Allows two worksheets to generate simultaneously |
| Queue position feedback | "2 worksheets ahead — ~90 seconds" shown to waiting users |

---

## Phase 3 — Future

| Feature | Notes |
|---|---|
| Saved learner profiles | Return user flow: "Continue with Ava?" with history |
| Progressive difficulty | Each new worksheet is slightly harder than the last |
| Teacher dashboard | Multiple learner profiles, batch generation |
| Subject-only mode | "Math only" or "Reading only" quickstart |
| Curriculum alignment | Map to Common Core or state standards |
| Multi-language | Spanish-language worksheets as first expansion |

---

## Deployment Process

Before pushing or deploying, update `docs/FEATURE_STATUS.md` and run:

```bash
npm run predeploy
```

Always follow this three-step flow:

```bash
# 1. Push local changes to GitHub
git push origin main

# 2. Pull on Oracle server
ssh -i oracle-ssh-key.pem ubuntu@129.80.57.54 \
  "cd ~/paperstride && git pull origin main"

# 3. Rebuild Docker
ssh -i oracle-ssh-key.pem ubuntu@129.80.57.54 \
  "cd ~/paperstride && docker compose up -d --build && docker image prune -f"
```

See `docs/oracle-cloud-deployment.md` for full details.

---

## Performance Targets

| Metric | Before | After tuning |
|---|---|---|
| Blueprint / preview time | ~170s (7B) | ~30–45s (3B), instant on cache hit |
| LLM calls per worksheet | up to 7 | 3 (2 when blueprint is prebuilt) |
| Model reloads between calls | every swap | none (`keep_alive: -1`) |
| Section AI coverage | ~20% (reading only) | 100% (all sections) |
| Concurrent users | 1 cleanly | 2 (`OLLAMA_NUM_PARALLEL=2`, server-side) |
| Fallback quality | Generic interest theme | Grade-aware history/books/media banks with aligned questions and per-run variation |

### Biggest remaining lever: the Oracle shape
Inference speed scales with cores. **Confirm the A1.Flex instance is using the full
free allowance — 4 OCPU / 24 GB** (the deployment doc once listed 1 OCPU / 6 GB). Going
1→4 OCPU is roughly a 3–4× speedup and costs nothing on the Always Free tier. This is
the single highest-impact change and is independent of the code.

### Recommended server env (optional, for concurrency)
The per-request knobs (`keep_alive`, `num_thread`, `num_ctx`) are set in code. The only
genuinely server-side setting is concurrency:

```
OLLAMA_NUM_PARALLEL=1   # lowest latency for a single user (whole CPU per request)
# set =2 only once the shape is 4 OCPU and you want two users at once
```

---

## Git Sync Rules

- Never edit files directly on the server
- `.env` is the only file that differs between local and server
- If `git pull` is blocked by a server-side edit: `git checkout -- <file>` then pull
- Always push to GitHub before deploying — server pulls from GitHub, not local machine
