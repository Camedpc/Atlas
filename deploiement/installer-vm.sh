#!/usr/bin/env bash
# Prépare une VM Ubuntu 24.04 neuve pour Atlas. À lancer une fois, en root :
#   curl -fsSL https://raw.githubusercontent.com/Camedpc/Atlas/main/deploiement/installer-vm.sh | bash
set -euo pipefail

DEPOT=https://github.com/Camedpc/Atlas.git
DOSSIER=/opt/atlas

echo "== Paquets : Docker, Compose, git, pare-feu, mises à jour de sécurité automatiques"
apt-get update
apt-get install -y docker.io docker-compose-v2 git ufw unattended-upgrades
systemctl enable --now docker

echo "== Pare-feu : SSH, HTTP (certificat) et HTTPS seulement"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw --force enable

echo "== Code d'Atlas dans $DOSSIER"
if [ -d "$DOSSIER/.git" ]; then
  git -C "$DOSSIER" pull --ff-only
else
  git clone "$DEPOT" "$DOSSIER"
fi

cd "$DOSSIER"
if [ ! -f .env ]; then
  cp .env.example .env
  IP=$(curl -fsS https://api.ipify.org)
  JETON=$(openssl rand -hex 32)
  sed -i "s|^ATLAS_DOMAINE=.*|ATLAS_DOMAINE=${IP//./-}.sslip.io|" .env
  sed -i "s|^ATLAS_JETON_ACCES=.*|ATLAS_JETON_ACCES=$JETON|" .env
  chmod 600 .env
  echo "== .env créé : domaine ${IP//./-}.sslip.io, jeton d'accès généré."
fi

cat <<'FIN'

Reste à faire (voir deploiement/README.md) :
  1. nano /opt/atlas/.env   → SUPABASE_SECRET_KEY, ATLAS_CORS_ORIGINES (et OPENAI_API_KEY si clé API)
  2. cd /opt/atlas && docker compose up -d --build
  3. Connexion Codex (compte ChatGPT) :
     docker compose exec atlas python -m atlas.orchestrateur.connexion --code
FIN
