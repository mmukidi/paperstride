# PaperStride Launch Plan on Oracle Cloud

## Summary

Use the existing Oracle Cloud Ubuntu 24.04 ARM instance to host a simple public landing page first, then add Groq-powered worksheet generation later. Brand: **PaperStride**.

## Public URL

- Use a free test domain first: `paperstride.duckdns.org`.
- If unavailable, try `paperstride-learn.duckdns.org`, `qualitysheets.duckdns.org`, or a No-IP free hostname.
- Point the free hostname to the OCI public IP.
- Add HTTPS with Caddy on the server.
- Later, buy a real domain such as `paperstride.com`, `paperstride.app`, or `paperstride.org` if available.

## Hosting Plan

- Build a small Next.js landing page now, leaving room for worksheet APIs later.
- Run it on the OCI instance with Docker Compose:
  - `web`: Next.js app
  - `caddy`: reverse proxy with automatic HTTPS
- In OCI networking, allow public inbound TCP `80` and `443`.
- Keep SSH `22` limited as much as possible.
- On Ubuntu, allow web traffic through the instance firewall too.
- Deploy manually at first with a simple rebuild/restart command; automate later.

## Landing Page Content

- Brand: **PaperStride**
- Main message: "Printable practice that helps students learn away from screens."
- Sections:
  - Pre-K to Grade 8 printable worksheets
  - Math and reading first
  - Personalized by grade, level, interests, and challenge style
  - AI-assisted worksheets coming soon
  - Contact or waitlist area
- Avoid student accounts, learner profiles, and worksheet generation on the first public page.

## Groq AI Plan

- Store `GROQ_API_KEY` only on the server, never in browser code.
- Use Groq's OpenAI-compatible API from a server route later.
- Prefer structured JSON output for worksheet content.
- Use Groq for reading passages, themed wording, and question variety.
- Use code/template validation for math answers and answer keys.
- Handle free-tier limits with friendly retry messages, cached sample worksheets, and daily generation caps.

## Privacy Defaults

- No student email accounts.
- No full names.
- No personal learner details sent to Groq.
- Prompts should only include grade band, subject, skill, difficulty, and interest theme.
- Landing page should not collect child data.

## Test Plan

- Visit the public HTTPS URL from phone and desktop.
- Confirm the page loads from outside your home/network.
- Confirm HTTPS certificate works.
- Confirm no Groq key appears in page source or browser network responses.
- Later, test Groq rate-limit behavior and worksheet JSON validation before making generation public.
