#!/bin/sh
# One-time: create the public GitHub repository and turn on GitHub Pages (needs the GitHub CLI, logged in).
set -e
cd "$(dirname "$0")/.."
REPO=${1:-coach}
GH=${GH:-gh}
$GH auth status >/dev/null 2>&1 || { echo "Run: $GH auth login   (then re-run this script)"; exit 1; }
OWNER=$($GH api user -q .login)
git remote get-url origin >/dev/null 2>&1 || $GH repo create "$REPO" --public --source . --remote origin --push --description "Personal training & nutrition coach PWA (no personal data in this repo)"
git push -u origin main -q || true
$GH api -X POST "repos/$OWNER/$REPO/pages" -f "source[branch]=main" -f "source[path]=/" >/dev/null 2>&1 || echo "(Pages already enabled)"
echo "Your app will be live in ~1 minute at: https://$OWNER.github.io/$REPO/"
