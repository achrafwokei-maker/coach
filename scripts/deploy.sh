#!/bin/sh
# One-command deploy: test → stamp a new app version → commit → push to GitHub Pages.
# Personal data never leaves the iPhone; this script also refuses to publish anything private.
set -e
cd "$(dirname "$0")/.."
node --test tests/*.test.js
V=$(date +%Y%m%d-%H%M%S)
sed -i '' "s/^const VERSION = '.*';/const VERSION = '$V';/" sw.js
git add -A
if git diff --cached --name-only | grep -E '^private/|backup.*\.json|setup.*\.json|\.(jpe?g|heic|png)$' | grep -v '^icons/'; then
  echo "Refusing to deploy: private files are staged (see above)."; git reset -q; exit 1
fi
git commit -qm "Deploy $V" || echo "Nothing new to commit"
git push -q
echo "Deployed version $V — the iPhone app updates itself next time it is opened online."
