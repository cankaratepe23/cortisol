# CLAUDE.md

Working notes for Claude (and humans) on this repo. The README is the
user-facing doc; this file is the contributor-facing one.

## TL;DR

A TypeScript monorepo that stamps a date band on top of a meme video template.
Three packages:

- `@cortisol/core` — render/preview/import logic, zero runtime deps
- `@cortisol/cli` — `cortisol` binary (commander wrapper around core)
- `packages/raycast` — Raycast extension that shells out to the CLI

Run everything from `cortisol/`:

```bash
npm install
npm run build                 # builds core and cli (raycast is built by `ray`)
node packages/cli/dist/index.js <subcommand>
```

## External tools

Hard requirements:

| Tool   | Why                                                                 |
|--------|---------------------------------------------------------------------|
| ffmpeg | All video work (pad + overlay + encode + yuv4mpeg pipe for gifski) |
| magick | Renders the date-band PNG. **We do not use ffmpeg's `drawtext`** because the Homebrew `ffmpeg` formula ships without libfreetype. If you ever consider migrating back to drawtext, first run `ffmpeg -filters \| grep drawtext` on the target box. |

Optional, only when their respective feature is used:

- `gifski` — `--gif` output
- `yt-dlp` — `templates import <https://…>`

`core/src/ffmpeg.ts` prepends `/opt/homebrew/bin`, `/usr/local/bin`, and
`~/.local/bin` to PATH for every spawn so the Raycast bundle (which doesn't
inherit the login shell PATH) can find these.

## Architecture

```
packages/core/src/
├── ffmpeg.ts       run(), pipe(), probe(), augmentedEnv(), ffEscapeFilterValue()
├── textimage.ts    renderBand() — ImageMagick → tmp PNG, returns { pngPath, cleanup() }
├── render.ts       render() — single ffmpeg invocation; pad + overlay; optional gifski pipe
├── preview.ts      preview() — same filter, -frames:v 1
├── import.ts       importTemplate() — optional yt-dlp, then ffmpeg trim/crop/scale + AAC reencode
├── template.ts     JSON registry; slugify(); findTemplate() does fuzzy token-substring match
├── date.ts         parseDate() with rollover validation; formatDate()
└── index.ts        public barrel — CLI and Raycast must only import from here
```

The CLI is the *only* entry point that hard-codes `defaultTemplatesDir()`.
Library callers can pass any directory.

### Filter chain

```
[0:v] pad=iw:ih+B:0:B:color=white [bg]
[bg] [1:v] overlay=0:0 [v]
```

Input 0 is the source video; input 1 is the band PNG. The PNG is exactly
`template.width × template.bandHeight` so overlay at `0:0` is pixel-perfect.

For GIF, append `;[v]fps=N[vout]` and map `[vout]` to a `yuv4mpegpipe` stdout,
then pipe into `gifski -o file -`.

### Template format

`templates/<slug>.json` — schema is the `Template` interface in
`core/src/template.ts`. `width`/`height` are captured from `ffprobe` at import
time and only used to set GIF default width; the render path re-derives nothing
from them, so it's safe (but pointless) to hand-edit. `bandHeight` IS used by
the render path — editing it will change output dimensions.

## Conventions

- **TypeScript:** `strict: true`, ESM (`"type": "module"` in core/cli),
  NodeNext resolution, target ES2022. `.js` extensions in relative imports
  (required by NodeNext).
- **No runtime deps in `core`** — keep it that way. `child_process` and
  `node:fs/promises` cover everything. CLI may add deps; core may not.
- **Tmp files:** always allocate via `fs.mkdtemp(os.tmpdir(), "cortisol-...-")`
  and clean up in a `finally`. See `textimage.ts` for the pattern (returns a
  `{ cleanup }` handle).
- **Errors:** throw plain `Error` with useful messages. The CLI prints
  `error: <message>` and exits 1. Don't `console.log` errors from core.
- **Stderr:** progress info from the CLI goes to stderr (`process.stderr.write`);
  output paths go to stdout (so they're machine-parseable for scripts and the
  Raycast extension).

## Adding a CLI subcommand

1. Add the implementation to `core/src/<thing>.ts` and re-export from
   `core/src/index.ts`.
2. `npm --workspace @cortisol/core run build`.
3. Wire it up in `packages/cli/src/index.ts` using commander. Stick to the
   existing option style: lowercase short flags, kebab-case long flags,
   numeric coercion via `(v) => Number(v)`.
4. `npm run build` and try it: `node packages/cli/dist/index.js <new-cmd>`.

## Adding a Raycast command

1. Edit `packages/raycast/package.json` → `commands[]` (this is the Raycast
   manifest, validated by `ray`).
2. Add `packages/raycast/src/<name>.tsx` exporting a default React component.
3. Reuse `runCli()` from `src/cli.ts` — do **not** import `@cortisol/core`
   directly. The whole point of shelling out is to keep the bundler isolated.
4. `cd packages/raycast && npm install && npm run dev`.

## Verification (manual)

Quick smoke run after changes to core:

```bash
npm run build

# Ambiguity & no-match (should fail with clear messages)
node packages/cli/dist/index.js render "ryan gosling" || true
node packages/cli/dist/index.js render "homelander" || true

# Bad date (should reject rollover)
node packages/cli/dist/index.js preview "beach" --date 2026-13-01 --no-open || true

# Real render
node packages/cli/dist/index.js render "beach" --date 2026-05-13

# Inspect
ffprobe -v error -show_entries stream=width,height,codec_name -of default=nw=1 \
  "13 may 2026 wednesday.mp4"
```

Expected MP4 stream: `h264`, width = template width, height = template height +
bandHeight, AAC stereo audio passed through.

## Known quirks

- **gifski progress prints over stdout.** `pipe()` inherits stdout for the
  consumer, so gifski's progress bar appears in the terminal. That's fine for
  the CLI; for Raycast it's discarded along with the rest of stdout (Raycast
  reads only the final lines we print after the pipe resolves).
- **Templates dir resolution** uses `import.meta.url` and walks up from
  `dist/template.js` to `cortisol/`. If you ever move the build output or
  bundle core into a single file, fix `defaultTemplatesDir()` accordingly.
- **`--c:a copy` requires the template to already be AAC.** `importTemplate`
  re-encodes to AAC explicitly so this invariant holds. If a user hand-drops
  a non-AAC mp4 into `templates/`, `render` will fail. Diagnose with
  `ffprobe -select_streams a:0 -show_entries stream=codec_name ...`.

## Out of scope (don't build without asking)

- A GUI editor for trim/crop. The PNG preview + flags are the ceiling.
- Multi-line custom text beyond "date / day".
- Cross-machine template sync.
- Auto-posting to social platforms.

## Plan history

The original implementation plan lives at
`~/.claude/plans/can-you-help-me-elegant-eclipse.md`. One notable deviation:
the plan called for ffmpeg's `drawtext` filter; we ended up using ImageMagick
because Homebrew ffmpeg ships without libfreetype. See `textimage.ts` and the
README's "Render pipeline" section.
