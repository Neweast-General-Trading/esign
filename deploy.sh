#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
DOMAIN="esign.neweast.cloud"
DOMAIN_DIR="/var/www/${DOMAIN}"
MIS_DIR="/var/www/mis-dashboard/esign"
NGINX_AVAILABLE="/etc/nginx/sites-available/${DOMAIN}"
NGINX_ENABLED="/etc/nginx/sites-enabled/${DOMAIN}"
MIS_NGINX="/etc/nginx/sites-available/mis.neweast.cloud"
PORT=4038

echo "==> Building E-Sign API"
cd "$ROOT/server"
npm install
npm run build

echo "==> Building client (domain root: ${DOMAIN})"
cd "$ROOT"
npm install
npm run build

echo "==> Building client (MIS path: /esign/)"
npm run build:mis

echo "==> Deploying both targets"
mkdir -p "$DOMAIN_DIR" "$MIS_DIR"
rsync -a --delete "$ROOT/dist/" "$DOMAIN_DIR/"
rsync -a --delete "$ROOT/dist-mis/" "$MIS_DIR/"

echo "==> Installing nginx site for ${DOMAIN}"
sudo cp "$ROOT/nginx/${DOMAIN}.conf" "$NGINX_AVAILABLE"
sudo ln -sfn "$NGINX_AVAILABLE" "$NGINX_ENABLED"

# Remove sites from earlier misspelled hostnames
sudo rm -f /etc/nginx/sites-enabled/esgin.neweast.co \
           /etc/nginx/sites-enabled/esgin.neweast.cloud || true

if ! grep -q "esign-mis.conf" "$MIS_NGINX" 2>/dev/null; then
  sudo sed -i '/include \/home\/negt\/docum\/nginx\/docum.conf;/i \    include '"$ROOT"'/nginx/esign-mis.conf;' "$MIS_NGINX"
fi

echo "==> Reloading nginx"
sudo nginx -t && sudo systemctl reload nginx

echo "==> Restarting PM2 service"
pm2 delete e-sign-api >/dev/null 2>&1 || true
pm2 start "$ROOT/server/dist/index.js" --name e-sign-api --cwd "$ROOT/server"
pm2 save >/dev/null 2>&1 || true

sleep 2
echo "==> Health checks"
curl -s -o /dev/null -w "  MIS ui         : %{http_code}\n" https://mis.neweast.cloud/esign/ || true
curl -s -o /dev/null -w "  MIS api        : %{http_code}\n" https://mis.neweast.cloud/esign/api/health || true
curl -s -o /dev/null -w "  domain (local) : %{http_code}\n" -H "Host: ${DOMAIN}" http://127.0.0.1/api/health || true

DNS_IP="$(dig +short "${DOMAIN}" A | head -1 || true)"
if [[ -n "${DNS_IP}" ]]; then
  echo "==> DNS live (${DNS_IP}) — issuing SSL"
  sudo certbot --nginx -d "${DOMAIN}" --non-interactive --agree-tos --register-unsafely-without-email --redirect || true
else
  echo "==> DNS for ${DOMAIN} not set yet"
  echo "    Ask team to add Azure DNS:"
  echo "      Type : A"
      echo "      Host : esign"
  echo "      Value: 20.74.222.101"
  echo "    Then re-run: bash deploy.sh"
fi

echo
echo "Primary URL : https://${DOMAIN}"
echo "Working now : https://mis.neweast.cloud/esign/"
echo "API port    : ${PORT}"
