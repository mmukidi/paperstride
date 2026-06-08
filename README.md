# PaperStride

PaperStride is a screen-free learning website for printable practice. The first version introduces the product and includes a starter worksheet creator that returns a printable HTML workbook preview and answer key.

## What is Included

- Next.js landing page for PaperStride
- Worksheet creator form with age, grade, interests, learning needs, goal, and time available
- Expert plan preview before worksheet generation
- Server-generated printable HTML workbook response
- Server-only Ollama route for local AI-assisted worksheet content
- Deterministic plan and worksheet fallbacks when local AI is unavailable
- Generated hero image saved as `public/paperstride-hero.webp`
- Dockerfile for production builds
- Docker Compose setup with Caddy for HTTPS
- OCI deployment guide in `docs/oracle-cloud-deployment.md`
- Feature and deploy status checklist in `docs/FEATURE_STATUS.md`

## Local Development

This machine currently has Node but does not have npm available on the shell path, so local dependency installation may need Node/npm installed first.

```bash
npm install
npm run dev
```

Then open `http://localhost:3000`.

## Production Deployment

1. Create a `.env` file on the server from `.env.example`.
2. Point `paperstride.duckdns.org` or your chosen domain to the OCI public IP.
3. Make sure OCI ingress rules allow TCP `80` and `443`.
4. Set `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_CONTACT_EMAIL` before building.
5. Update `docs/FEATURE_STATUS.md`, then run the pre-deploy checks:

```bash
npm run predeploy
```

6. Run Docker Compose on the server:

```bash
docker compose up -d --build
```

Full steps are in `docs/oracle-cloud-deployment.md`.

## Worksheet AI

The worksheet API is available at `POST /api/worksheets`. It accepts a nickname, grade or level, age, interests, learning needs, goal, time available, and an optional prebuilt blueprint, then returns a complete static HTML workbook.

The expert-plan preview API is available at `POST /api/blueprint`. It uses local Ollama when available and falls back to a deterministic plan when Ollama is unavailable.

Set these on the server to use the local Ollama backend:

```bash
LLM_BASE_URL=http://host.docker.internal:11434/v1
LLM_FAST_MODEL=llama3.2:3b
LLM_MODEL=qwen2.5:7b-instruct
LLM_PASSAGE_MODEL=llama3.2:3b
```

If Ollama is unavailable, the route returns a deterministic printable HTML worksheet so the site can still be tested and used without paid AI services.

## Privacy Defaults

- No student accounts
- No learner profile collection
- No child emails or full names
- The nickname is used only on the printable workbook heading
- AI prompts use grade or level, age, and interest theme
- Local Ollama runs on the server; no learner data needs to leave the server
