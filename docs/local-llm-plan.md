# PaperStride — Local LLM Plan & Next Steps

Self-contained handoff. Goal: replace the rate-limited Groq free tier with a
**self-hosted Ollama model on the Oracle Cloud box** so worksheet generation has
**unlimited tokens**, keeping the deterministic bank as an always-on fallback.

---

## 1. Where things stand (done)

- App = Next.js worksheet generator ("paperstride") deployed on Oracle Cloud via
  Docker + Caddy (auto HTTPS) at **https://paperstride.duckdns.org**.
- Generation pipeline (in `app/api/worksheets/route.ts`):
  1. **Blueprint call** = curriculum authority → returns an explicit per-subject
     **section plan** (subject, question count, skills).
  2. **Staged generation** = small calls (passage+questions+vocab together, then one
     call per remaining subject), each returning **structured JSON** rendered into our
     own safe template.
  3. **Deterministic bank fallback** = if any AI call fails/thins, that section falls
     back to hardcoded, correct content. Worksheet is always complete.
- All Groq calls go through one function: **`groqChat`** (OpenAI-compatible HTTP).
- **Problem:** Groq free tier = 100k tokens/day. Exhausted quickly → everything falls
  back to the bank. That is why we are moving to a local model.

## 2. Server facts

| | |
|---|---|
| Public IP | `129.80.57.54` |
| SSH | `ssh -i ~/Downloads/ssh-key-2026-06-03.key ubuntu@129.80.57.54` |
| OS / arch | Ubuntu 24.04, **aarch64 (ARM)** |
| Shape | VM.Standard.A1.Flex |
| **Now resized to** | **4 OCPU / 24 GB RAM** (was 1/6) — within Always Free, no charge |
| Disk free | ~36 GB |
| App dir on server | `~/paperstride` (deployed via `docker compose up -d --build`) |
| Deploy from laptop | `rsync -az --exclude node_modules --exclude .next --exclude .git -e "ssh -i ~/Downloads/ssh-key-2026-06-03.key" ./ ubuntu@129.80.57.54:~/paperstride/` then on server `cd ~/paperstride && docker compose up -d --build` |

Cost safety: account budget alert set; A1 up to 4 OCPU / 24 GB is Always Free.

## 3. Model choice

CPU-only (no GPU). 24 GB RAM now allows a 7–8B model.

| Model | RAM (Q4) | Speed (4 cores, est.) | Use |
|---|---|---|---|
| **qwen2.5:7b-instruct** ⭐ | ~5–6 GB | ~5–9 tok/s | Primary — best JSON/instructions |
| **llama3.2:3b** | ~2 GB | ~10–18 tok/s | Faster A/B option |

Recommendation: pull **both**, A/B on real worksheets, keep the better one.

---

## 4. NEXT STEPS (execute in order)

### Step A — Add 8 GB swap (safety against OOM)
```bash
ssh -i ~/Downloads/ssh-key-2026-06-03.key ubuntu@129.80.57.54
sudo fallocate -l 8G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
free -h   # confirm Swap: 8.0Gi
```

### Step B — Install Ollama (native ARM64)
```bash
curl -fsSL https://ollama.com/install.sh | sh
# Make Ollama reachable from the Docker container and keep the model resident:
sudo mkdir -p /etc/systemd/system/ollama.service.d
printf '[Service]\nEnvironment="OLLAMA_HOST=0.0.0.0"\nEnvironment="OLLAMA_KEEP_ALIVE=-1"\n' | sudo tee /etc/systemd/system/ollama.service.d/override.conf
sudo systemctl daemon-reload && sudo systemctl restart ollama
curl -s http://localhost:11434/api/version   # confirm it responds
```

### Step C — Pull models
```bash
ollama pull qwen2.5:7b-instruct
ollama pull llama3.2:3b
ollama list
```

### Step D — Benchmark real speed
```bash
ollama run qwen2.5:7b-instruct --verbose "Write a 200-word original reading passage for a 9-year-old about chess." 2>&1 | tail -8
# Note the "eval rate" (tokens/s). <4 tok/s → prefer llama3.2:3b and/or selective generation.
```

### Step E — Make the LLM backend configurable (code change)
In `app/api/worksheets/route.ts`, generalize `groqChat` so the endpoint, model, and
optional key come from env. Add near the top:
```ts
const LLM_BASE_URL = process.env.LLM_BASE_URL || "https://api.groq.com/openai/v1";
const LLM_MODEL = process.env.LLM_MODEL || process.env.GROQ_MODEL || "llama-3.3-70b-versatile";
const LLM_API_KEY = process.env.LLM_API_KEY || process.env.GROQ_API_KEY || "";
```
In `groqChat`:
- POST to `` `${LLM_BASE_URL}/chat/completions` `` instead of the hardcoded Groq URL.
- Send `model: LLM_MODEL`.
- Only send the `Authorization: Bearer` header when `LLM_API_KEY` is non-empty
  (Ollama needs no key).
- The 429/daily-limit retry logic is harmless against Ollama (it never 429s) — leave it.
- The trigger for the AI path is currently `if (process.env.GROQ_API_KEY)`. Change it to
  run the AI path when **either** `LLM_BASE_URL` points at Ollama **or** a key exists,
  e.g. gate on `process.env.LLM_BASE_URL || process.env.GROQ_API_KEY`.

### Step F — Point the app at Ollama (docker-compose)
In `docker-compose.yml` under the `web` service, add so the container can reach Ollama
on the host:
```yaml
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      # ...existing vars...
      LLM_BASE_URL: "http://host.docker.internal:11434/v1"
      LLM_MODEL: "qwen2.5:7b-instruct"
      # leave LLM_API_KEY unset for Ollama
```
Then redeploy:
```bash
cd ~/paperstride && docker compose up -d --build
```

### Step G — Test end-to-end
```bash
curl -sk -X POST https://paperstride.duckdns.org/api/worksheets \
  -H 'Content-Type: application/json' \
  -d '{"childName":"jaden","grade":"Grade 4","age":9,"interests":"chess, math, reading"}' \
  -o /tmp/live.html
wc -c /tmp/live.html
grep -c "PaperStride mixed-skills workbook" /tmp/live.html   # 1 = bank fell back, 0 = real AI worksheet
cd ~/paperstride && docker compose logs --since 3m web | grep -iE "bundle|section|fallback|429"
```
Expect a real AI-authored passage (not the bank "Original passage:" text) and per-subject
questions. No daily token limit.

---

## 5. Known issue to handle after it works: latency / UX

CPU inference is slow (minutes per worksheet, since staged = ~7 sequential calls).
Risks an HTTP/Caddy timeout and a long spinner. Options (pick later, after real numbers):
- **Selective generation:** use the LLM only for the reading passage (+1–2 sections),
  bank-fill the rest → ~1–3 min. The code already supports per-section AI-or-bank.
- **Background generation:** enqueue the job, show "preparing your workbook," deliver a
  download/email when ready. Best long-term UX for CPU inference.
- If sticking with synchronous: raise Caddy/proxy + Next timeouts accordingly.

## 6. Fallback / safety chain (unchanged, always on)
1. Local Ollama (unlimited) → 2. Groq free (if key + budget) → 3. Deterministic bank
(instant, complete). A complete worksheet is always returned (verified: even with all
LLM calls failing, the API returns HTTP 200 with full subject coverage).

## 7. Rollback
- Disable local LLM: in `docker-compose.yml` remove `LLM_BASE_URL` (and set
  `GROQ_API_KEY`) → app uses Groq again, or no key → pure bank.
- Stop Ollama: `sudo systemctl stop ollama && sudo systemctl disable ollama`.
- Remove swap: `sudo swapoff /swapfile && sudo rm /swapfile` (also remove the fstab line).

## 8. Open decisions for next session
- Confirm benchmark tok/s → choose `qwen2.5:7b-instruct` vs `llama3.2:3b`.
- Choose synchronous vs background generation UX (Section 5).
- Optional: run Ollama as a compose service instead of host install (host install is
  simpler and already documented above).
