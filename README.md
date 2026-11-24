# Coach

A private, offline-first training and nutrition coach that runs as an iPhone home-screen app (PWA), hosted free on GitHub Pages.

- **No accounts, servers or APIs.** All personal data (workouts, meals, photos, body metrics) lives in IndexedDB on the phone.
- **No dependencies, no build step.** Plain HTML/CSS/JS modules. Tests use Node's built-in runner.
- **Nothing personal is in this repository.** The profile lives in a git-ignored `private/` folder and is imported on the phone from a setup file.

## Install on iPhone
1. Open the GitHub Pages link in **Safari**.
2. Share → **Add to Home Screen**, then open Coach from the home screen.
3. Import your setup file (AirDrop `private/coach-setup.json` to the phone → *Save to Files*), or fill the short form.

## Develop
```sh
npm test            # run all tests
npm run serve       # http://localhost:8080
npm run setup       # rebuild private/coach-setup.json (add a starting photo to private/ first)
npm run deploy      # test, stamp a new version, commit and push → Pages updates; phone updates on next open
```

## How it works
- `js/engine.js` — scheduling, progressive overload, nutrition maths, goal projection (pure, tested)
- `js/coach.js` — rule-based coach: daily message, 10 core questions, weekly reports, calorie advice
- `js/foods.js` — offline food database incl. Algerian dishes (estimates are labelled)
- `js/program.js` — the starting Push/Pull/Legs programme
- `js/app.js` — UI; `js/db.js` — IndexedDB; `js/backup.js` — backup/restore; `sw.js` — offline cache
