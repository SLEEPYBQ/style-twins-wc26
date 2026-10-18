#!/bin/zsh
# Sync the static site to a server (nginx alias -> the target folder).
# Ships WebP only: source PNGs, rejected avatars and other working files stay local.
# Configure in pipeline/deploy.env (not committed):
#   DEPLOY_TARGET=user@host:/var/www/style-twins/
#   DEPLOY_KEY=$HOME/.ssh/your-key.pem
set -eu
HERE=${0:A:h}
[[ -f "$HERE/deploy.env" ]] && source "$HERE/deploy.env"
: ${DEPLOY_TARGET:?set DEPLOY_TARGET in pipeline/deploy.env}
: ${DEPLOY_KEY:?set DEPLOY_KEY in pipeline/deploy.env}
rsync -az --delete \
  --exclude '.DS_Store' \
  --exclude 'img/gen/*.png' \
  --exclude 'img/avatars/*.png' \
  --exclude 'img/avatars/_rejected/' \
  -e "ssh -i $DEPLOY_KEY -o BatchMode=yes" \
  "${HERE:h}/web/" "$DEPLOY_TARGET"
echo "deployed -> $DEPLOY_TARGET"
