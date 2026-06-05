# PaperStride

PaperStride is a screen-free learning website for printable practice. The first version introduces the product and includes a starter worksheet creator that returns a printable HTML workbook preview and answer key.

## What is Included

- Next.js landing page for PaperStride
- Basic worksheet creator form
- Server-generated printable HTML workbook response
- Server-only Groq route for AI-assisted worksheet content
- Generated hero image saved at `public/paperstride-hero.png`
- Dockerfile for production builds
- Docker Compose setup with Caddy for HTTPS
- OCI deployment guide in `docs/oracle-cloud-deployment.md`
- No-key sample HTML worksheet fallback for local testing

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
5. Run Docker Compose on the server:

```bash
docker compose up -d --build
```

Full steps are in `docs/oracle-cloud-deployment.md`.

## Worksheet AI

The worksheet API is available at `POST /api/worksheets`. It accepts a nickname, grade or level, age, and interests, then returns a complete static HTML workbook.

Set these on the server to use Groq:

```bash
GROQ_API_KEY=your-groq-key
GROQ_MODEL=llama-3.3-70b-versatile
```

If `GROQ_API_KEY` is empty, the route returns a sample printable HTML worksheet so the site can still be tested without an AI key.

## Privacy Defaults

- No student accounts
- No learner profile collection
- No child emails or full names
- The nickname is used only on the printable workbook heading
- AI prompts use grade or level, age, and interest theme
- `GROQ_API_KEY` is server-only and must never use a `NEXT_PUBLIC_` prefix
