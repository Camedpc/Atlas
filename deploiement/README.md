# Déployer l'orchestrateur sur une VM

Vercel sert le site et la lecture du graphe. La VM sert le serveur longue durée (`atlas.serveur`) : conversations
et orchestrateur Codex, derrière Caddy (HTTPS automatique), dans Docker.

```
navigateur → Vercel (site)  ──/api/conversations + jeton──→  VM : Caddy → conteneur atlas → Supabase
```

## 1. Créer la VM (Hetzner)

- Ubuntu (24.04 ou 26.04), 4 vCPU / 8 Go conseillés (2 vCPU / 4 Go suffisent pour quelques agents à la fois ;
  x86 ou ARM, les deux marchent). Agrandissable plus tard sans perdre le disque.
- Ajouter ta clé SSH publique à la création (`~/.ssh/id_ed25519.pub`).
- Noter l'adresse IP.

## 2. Installer

```bash
ssh root@<IP>
curl -fsSL https://raw.githubusercontent.com/Camedpc/Atlas/main/deploiement/installer-vm.sh | bash
```

Le script installe Docker, ferme tout sauf SSH/HTTP/HTTPS, clone le dépôt dans `/opt/atlas` et crée `.env`
avec `ATLAS_DOMAINE=<ip>.sslip.io` et un `ATLAS_JETON_ACCES` aléatoire.

## 3. Compléter `/opt/atlas/.env`

| Variable | Valeur |
|---|---|
| `SUPABASE_SECRET_KEY` | comme en local |
| `ATLAS_CORS_ORIGINES` | `https://atlas-nine-bay.vercel.app` |
| `OPENAI_API_KEY` | vide avec un compte ChatGPT, sinon la clé API |
| `ATLAS_MAX_SOUS_AGENTS` | optionnel, plafond de sous-agents simultanés |
| `GRADIUM_API_KEY` | comme en local : appel vocal avec Atlas voix (sans elle, l'appel est refusé) |

## 4. Lancer

```bash
cd /opt/atlas
docker compose up -d --build
curl https://$(grep ^ATLAS_DOMAINE .env | cut -d= -f2)/api/health     # {"ok":true,...}
```

Connexion Codex avec un compte ChatGPT (connexion par code d'appareil activée dans ChatGPT → Paramètres →
Sécurité) — une seule fois, elle est gardée dans le volume :

```bash
docker compose exec atlas python -m atlas.orchestrateur.connexion --code
```

## 5. Brancher le site Vercel

Vercel → projet `atlas` → Settings → Environment Variables : `VITE_API_URL = https://<ip>.sslip.io`
(Production), puis redéployer. Au premier passage, le site demande le jeton d'accès (`ATLAS_JETON_ACCES`).

## Au quotidien

| Besoin | Commande (dans `/opt/atlas`) |
|---|---|
| Mettre à jour | `git pull && docker compose up -d --build` |
| Logs | `docker compose logs -f atlas` |
| Mémoire / CPU des agents | `docker stats` |
| Redémarrer | `docker compose restart atlas` |

Le volume `donnees` (espace de travail des agents, threads et connexion Codex) survit aux mises à jour ; tout
le reste est dans Supabase.
