# PaperStride

PaperStride is a screen-free learning website for printable practice. The first version is a public landing page that introduces the product, avoids collecting learner data, and is ready to host on an Oracle Cloud Ubuntu instance with Docker Compose and Caddy.

## What is Included

- Next.js landing page for PaperStride
- Generated hero image saved at `public/paperstride-hero.png`
- Dockerfile for production builds
- Docker Compose setup with Caddy for HTTPS
- OCI deployment guide in `docs/oracle-cloud-deployment.md`
- Server-only Groq environment placeholder for future worksheet generation

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

## Privacy Defaults

- No student accounts in the landing page
- No learner profile collection
- No child emails or full names
- `GROQ_API_KEY` is reserved for future server-only routes and must never use a `NEXT_PUBLIC_` prefix
