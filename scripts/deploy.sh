#!/usr/bin/env bash
# Build frontend, commit (if changes), and push to GitHub → triggers Vercel deploy.
set -e

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

echo "→ Building frontend..."
(cd helpdesk-app/frontend && npm run build)
echo "✓ Build OK"

echo "→ Pushing to GitHub..."
if git status --short | grep -q .; then
  git add -A
  git commit -m "deploy: $(date +%Y-%m-%d\ %H:%M)"
fi
git push

echo "✓ Deploy script done. Vercel will deploy from the new push."
