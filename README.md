# wellbuilt-ai

K1 / WellBuilt AI public site (k1.construction).

## Pre-deploy media check

`scripts/check-media.mjs` is a zero-dependency Node script that catches the
class of bug that broke a prior k1.construction deploy (videos not playing
because MP4 assets were missing and links were wrong).

It scans every HTML/JS/TS/JSX/TSX/Vue/Svelte file for:

- Local video references (`mp4`, `webm`, `mov`, `m4v`) — fails if the file is
  not present on disk, is 0 bytes (LFS pointer leak), or resolves outside the
  repo.
- Empty / placeholder video `src`, `poster`, `data-video`, `videoSrc`, etc.
- Smart quotes or whitespace inside URL attributes (these silently break in
  the browser).
- Hardcoded K1 Command Center URLs — validates that they are well-formed
  https links.

### Run locally before deploying

```bash
npm run check:media
```

To also scan a build output directory:

```bash
node scripts/check-media.mjs --build dist
```

The script exits non-zero on any error and prints `file:line  message` for
each finding. It also runs automatically:

- on every push to `main` and every PR (`.github/workflows/check-media.yml`),
- via the `predeploy` and `prevercel-build` npm hooks, so `npm run deploy` or
  a Vercel build that runs `npm run build` will fail fast if a video asset
  was forgotten.
