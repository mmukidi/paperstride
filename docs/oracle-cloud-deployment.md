# Oracle Cloud Deployment Guide

This guide deploys PaperStride to your existing Oracle Cloud Ubuntu 24.04 instance.

## Server Facts

- Public IP: `129.80.57.54`
- SSH username: `ubuntu`
- OS: Canonical Ubuntu 24.04 aarch64
- Shape: VM.Standard.A1.Flex, 1 OCPU, 6 GB memory

## 1. Point a Domain to the Server

Recommended free test domain: `paperstride.duckdns.org`.

In DuckDNS, create a hostname and point it to:

```text
129.80.57.54
```

If `paperstride` is unavailable, use one of:

```text
paperstride-learn.duckdns.org
qualitysheets.duckdns.org
worksheets.duckdns.org
```

## 2. Open Web Ports in OCI

In Oracle Cloud, edit the security list or network security group for the instance VCN and allow inbound:

```text
TCP 80 from 0.0.0.0/0
TCP 443 from 0.0.0.0/0
```

Keep SSH `22` restricted to your own IP when possible.

## 3. Prepare Ubuntu

SSH into the instance:

```bash
ssh ubuntu@129.80.57.54
```

Install Docker and enable the firewall rules:

```bash
sudo apt update
sudo apt install -y docker.io ufw
if ! docker compose version >/dev/null 2>&1; then
  sudo apt install -y docker-compose-v2 || sudo apt install -y docker-compose
fi
sudo systemctl enable --now docker
sudo usermod -aG docker ubuntu
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
```

Log out and back in so the Docker group change applies.

## 4. Add the App via Git

Clone the repository from GitHub (this is the canonical source of truth):

```bash
git clone https://github.com/mmukidi/paperstride.git ~/paperstride
cd ~/paperstride
```

> **Important:** Always use git to manage code on the server. Never copy files manually — it breaks the sync and makes future updates unreliable.

Create `.env`:

```bash
cp .env.example .env
```

Edit the values:

```text
SITE_DOMAIN=paperstride.duckdns.org
NEXT_PUBLIC_SITE_URL=https://paperstride.duckdns.org
NEXT_PUBLIC_CONTACT_EMAIL=your-email@example.com
GROQ_API_KEY=your-groq-key-when-generation-is-added
GROQ_MODEL=llama-3.3-70b-versatile
```

> `.env` is gitignored and lives only on the server. Never commit it.

## 5. Start the Website

```bash
docker compose up -d --build
```

Check status:

```bash
docker compose ps
docker compose logs -f caddy
```

When DNS and ports are ready, Caddy will request and renew HTTPS automatically.

## 6. Verify

Open:

```text
https://paperstride.duckdns.org
```

Also test from a phone using cellular data to confirm the page is reachable outside your network.

## 7. Deploying Updates

Every update follows a three-step flow: push to GitHub locally → pull on the server → rebuild Docker.

### Step 1 — Push from your local machine

```bash
git push origin main
```

Confirm local and GitHub are in sync:

```bash
git log --oneline -5
```

### Step 2 — Pull on the Oracle server

```bash
ssh -i oracle-ssh-key.pem ubuntu@129.80.57.54 \
  "cd ~/paperstride && git pull origin main && git log --oneline -3"
```

You should see the latest commit hash matching what is on your local machine.

### Step 3 — Rebuild and restart Docker

```bash
ssh -i oracle-ssh-key.pem ubuntu@129.80.57.54 \
  "cd ~/paperstride && docker compose up -d --build && docker image prune -f && docker compose ps"
```

Or run all three steps in one command:

```bash
ssh -i oracle-ssh-key.pem ubuntu@129.80.57.54 \
  "cd ~/paperstride && git pull origin main && docker compose up -d --build && docker image prune -f && docker compose ps"
```

### Verify the deploy

Check that the commit on the server matches the latest local commit:

```bash
# Local
git log --oneline -1

# Server
ssh -i oracle-ssh-key.pem ubuntu@129.80.57.54 "cd ~/paperstride && git log --oneline -1"
```

Both lines should show the same commit hash. If they differ, re-run Step 2.

### Git sync rules

- **Always push to GitHub before deploying.** The server pulls from GitHub, not from your local machine.
- **Never edit files directly on the server.** Make changes locally, commit, push, then pull on the server.
- **`.env` is the only file that should differ** between local and server. It is gitignored and must be maintained manually on the server.
- **Check `git status` on the server** if a pull is blocked — an uncommitted local edit on the server (e.g. a manual tweak) will prevent `git pull`. Fix with `git checkout -- <file>` then pull again.

## Groq Safety Notes

- Keep `GROQ_API_KEY` only in `.env` on the server.
- Never expose the key in browser code.
- Worksheet prompts send grade or level, age, and interest theme.
- The learner nickname is used only in the printable workbook heading.
- Do not send full names, student emails, or private learner notes.
- If `GROQ_API_KEY` is empty, the site returns a sample printable HTML worksheet for testing.
