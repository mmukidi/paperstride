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

### AI Pipeline
- **Blueprint call** — one LLM call designs the curriculum plan (subjects,
  question counts, skills, challenge level)
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
- Answer sheet with explanations and strategy tips
- How-to-use cards and smart test strategy block
- Print / Download / Open buttons

### Infrastructure
- Fully containerised (Docker Compose — web + Caddy)
- Auto HTTPS via Caddy + DuckDNS
- Git-tracked deployment (pull → rebuild → run)
- Local Ollama inference (no external API key required)

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

### 4. Per-Section AI Generation Pipeline (Phase 1 — backend)
All worksheet sections become AI-generated (not just reading/vocab):

```
Blueprint call  →  qwen2.5:7b-instruct  (~15s)
Passage bundle  →  qwen2.5:7b-instruct  (~18s)
Math section    →  llama3.2:3b          (~5s)
Grammar section →  llama3.2:3b          (~5s)
Science section →  llama3.2:3b          (~5s)
Logic section   →  llama3.2:3b          (~4s)
─────────────────────────────────────────────
Total                                   ~52s
```

Sequential execution (CPU cannot parallelise local inference).
Per-section fallback: if one section fails, only that section uses the
static bank — the rest remains AI-generated.

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
| Data table themed to passage | Table content matches the reading topic, not a hardcoded "practice plans" table |
| Cross-section coherence | Math/science problems reference the reading passage scenario |
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

| Metric | Current | Phase 1 Target |
|---|---|---|
| Single user worksheet time | ~45s | ~52s (more sections, same server) |
| Concurrent users | 1 cleanly | 2 (OLLAMA_NUM_PARALLEL=2) |
| Section AI coverage | ~20% (reading only) | 100% (all sections) |
| Blueprint token budget | ~1300 out | ~1600 out |
| Per-section call budget | N/A | ~450 in / ~500 out |

---

## Git Sync Rules

- Never edit files directly on the server
- `.env` is the only file that differs between local and server
- If `git pull` is blocked by a server-side edit: `git checkout -- <file>` then pull
- Always push to GitHub before deploying — server pulls from GitHub, not local machine
