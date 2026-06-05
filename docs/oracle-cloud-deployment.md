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

## 4. Add the App

Copy this project folder to the server, or push it to GitHub and clone it on the server.

Example target directory:

```bash
mkdir -p ~/paperstride
cd ~/paperstride
```

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

## 7. Updating Later

After changes are copied or pulled onto the server:

```bash
docker compose up -d --build
docker image prune -f
```

## Groq Safety Notes

- Keep `GROQ_API_KEY` only in `.env` on the server.
- Never expose the key in browser code.
- Worksheet prompts send grade or level, age, and interest theme.
- The learner nickname is used only in the printable workbook heading.
- Do not send full names, student emails, or private learner notes.
- If `GROQ_API_KEY` is empty, the site returns a sample printable HTML worksheet for testing.
