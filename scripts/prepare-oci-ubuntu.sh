#!/usr/bin/env bash
set -euo pipefail

sudo apt update
sudo apt install -y docker.io ufw

if ! docker compose version >/dev/null 2>&1; then
  sudo apt install -y docker-compose-v2 || sudo apt install -y docker-compose
fi

sudo systemctl enable --now docker
sudo usermod -aG docker "${USER}"

sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable

echo "Server preparation complete. Log out and back in before running Docker without sudo."
