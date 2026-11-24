// Builds the PRIVATE setup file from private/profile.json (+ an optional starting photo in private/).
// Output: private/coach-setup.json — AirDrop it to the iPhone and import it once in the app.
// The private/ folder is git-ignored: nothing here is ever published.
import { readFileSync, writeFileSync, readdirSync, statSync, mkdtempSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const dir = new URL('../private/', import.meta.url).pathname;
const cfg = JSON.parse(readFileSync(join(dir, 'profile.json'), 'utf8'));
const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const photoFile = readdirSync(dir).find((f) => /\.(jpe?g|png|heic|heif)$/i.test(f));
const photos = [];
if (photoFile) {
  const src = join(dir, photoFile);
  const tmp = mkdtempSync(join(tmpdir(), 'coach-'));
  // macOS built-in `sips` converts HEIC/PNG to a resized JPEG.
  const toJpeg = (max, out) => { execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '85', '-Z', String(max), src, '--out', out], { stdio: 'ignore' }); return readFileSync(out).toString('base64'); };
  const full = toJpeg(1600, join(tmp, 'full.jpg'));
  const thumb = toJpeg(400, join(tmp, 'thumb.jpg'));
  photos.push({ id: 'start-photo', date: ymd(statSync(src).mtime), kind: 'progress', pose: 'front', note: cfg.startPhotoNote || 'Start', data: `data:image/jpeg;base64,${full}`, thumbData: `data:image/jpeg;base64,${thumb}` });
}

const setup = {
  app: 'coach', kind: 'setup', version: 1, createdAt: new Date().toISOString(),
  kv: [{ k: 'profile', v: cfg.profile }, { k: 'targets', v: cfg.targets }],
  stores: { photos },
};
const out = join(dir, 'coach-setup.json');
writeFileSync(out, JSON.stringify(setup));
console.log(`Wrote ${out} (${Math.round(statSync(out).size / 1024)} KB)${photoFile ? ` with starting photo ${photoFile}` : ' — no photo found in private/ (add one and re-run to include it)'}`);
if (!existsSync(join(dir, 'profile.json'))) process.exit(1);
