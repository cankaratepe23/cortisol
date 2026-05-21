# Cortisol — Daily Cortisol Status video generator

Stamp today's date onto a named meme template and out comes the daily clip,
ready to post. Two surfaces — a CLI and a Raycast extension — share the same
render core.

```
21 May 2026
Thursday
[your template video plays below, audio intact]
```

## What you get

- **CLI** (`cortisol`) — `render`, `preview`, `templates list/show/import/remove`.
- **Raycast extension** — three commands: *Generate Today's Clip*,
  *Import Template*, *Preview Template*.
- **Templates** stored as `<slug>.json` + `<slug>.mp4` under `cortisol/templates/`.
  Templates are referenced by **fuzzy name lookup** — every whitespace token in
  your query must appear (as a substring) in the template's name. Example:
  `cortisol render "gosling beach"` matches `ryan gosling low cortisol beach`.

Outputs land in the current working dir (`--out` overrides) with filenames like
`21 may 2026 thursday.mp4` — matching the convention from the existing `Past/`
folder.

## Requirements

External tools (all assumed already on PATH; the tool also probes
`/opt/homebrew/bin`, `/usr/local/bin`, `~/.local/bin`):

- `ffmpeg`  — video encode/overlay/pipe (used for transcode + composition)
- `magick` (ImageMagick) — renders the white date band as a PNG. We use this
  rather than ffmpeg's `drawtext` because the Homebrew ffmpeg formula does
  not ship libfreetype, so `drawtext` is unavailable.
- `gifski` — optional, only when emitting `.gif`
- `yt-dlp` — optional, only when importing from a URL

Node 20+. macOS for the Raycast extension; the CLI is platform-agnostic.

## Quickstart

```bash
cd cortisol
npm install
npm run build

# Import a couple of templates from local files
node packages/cli/dist/index.js templates import "../Samples/ryan gosling sahil.mp4" \
  --name "ryan gosling low cortisol beach"

# Or pull straight from a URL via yt-dlp + trim
node packages/cli/dist/index.js templates import \
  "https://www.youtube.com/watch?v=..." \
  --name "homelander high cortisol" \
  --start 00:00:02 --end 00:00:14

# Preview today's date on a template (writes a temp PNG and opens it)
node packages/cli/dist/index.js preview "gosling beach"

# Render today's MP4 (audio preserved)
node packages/cli/dist/index.js render "gosling beach"

# Render a specific past date AND a GIF
node packages/cli/dist/index.js render "gosling beach" --date 2026-05-13 --gif

# List / show / remove
node packages/cli/dist/index.js templates list
node packages/cli/dist/index.js templates show "gosling beach"
node packages/cli/dist/index.js templates remove "gosling beach"
```

Install as a global `cortisol` command:

```bash
npm install -g ./packages/cli
cortisol render "gosling beach"
```

## CLI surface

```
cortisol render <query> [--date YYYY-MM-DD] [--out <dir>]
                        [--gif] [--gif-only]
                        [--gif-fps N] [--gif-width N] [--gif-quality 0-100]

cortisol preview <query> [--date YYYY-MM-DD] [--out <png>] [--at <sec>] [--no-open]

cortisol templates list
cortisol templates show <query>
cortisol templates import <source> --name <name>
                          [--start <ts>] [--end <ts>]
                          [--crop W:H:X:Y] [--scale W:H]
                          [--band-height <px>] [--font-size <px>]
                          [--font-file <path>] [--font-color <css>]
cortisol templates remove <query>
```

Notes:

- `<source>` is either a local file path or an `http(s)://` URL (yt-dlp).
- `--crop` and `--scale` are passed through to ffmpeg verbatim. There is **no**
  forced aspect-ratio normalization — if you import a square clip you get a
  square template and a square-plus-band output. Output dimensions are always
  `template.width × (template.height + bandHeight)`.
- Default `bandHeight` is ~18% of the template height (rounded to an even
  number so yuv420p is happy). Override at import or by editing the JSON.

## Template format

`templates/<slug>.json`:

```json
{
  "name": "ryan gosling low cortisol beach",
  "slug": "ryan-gosling-low-cortisol-beach",
  "video": "ryan-gosling-low-cortisol-beach.mp4",
  "bandHeight": 346,
  "width": 1080,
  "height": 1920,
  "fontSize": 83,
  "fontFile": "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
  "fontColor": "black",
  "createdAt": "2026-05-21T11:24:00.000Z"
}
```

You can hand-edit a JSON file to tune font size or band height — no re-import
needed. Just make sure `width`/`height` reflect the actual file (they're only
used for default GIF width).

## Render pipeline

A single ffmpeg invocation per output:

```
ffmpeg -i <template.mp4> -i <band.png> \
  -filter_complex "[0:v]pad=iw:ih+B:0:B:white[bg];[bg][1:v]overlay=0:0[v]" \
  -map "[v]" -map "0:a?" \
  -c:v libx264 -pix_fmt yuv420p -preset medium -crf 18 \
  -c:a copy -movflags +faststart \
  <out>.mp4
```

For GIF the same chain is piped (`yuv4mpegpipe`) into `gifski`. No audio.

The band PNG comes from a single ImageMagick call:

```
magick -background white -fill black -font "<font>" \
  -size <W>x<H_date> -gravity center -pointsize <date_size> "caption:21 May 2026" \
  -size <W>x<H_day>  -gravity center -pointsize <day_size>  "caption:Monday" \
  -append band.png
```

## Raycast extension

Lives in `packages/raycast/`. It deliberately **shells out to the CLI** rather
than importing the core module — that way Raycast's bundler doesn't have to
chase workspace deps, and the two surfaces stay decoupled.

Setup:

```bash
cd packages/raycast
npm install
npm run dev          # `ray develop` — opens in Raycast
```

In Raycast preferences for the extension, set **Cortisol CLI Path** to the
absolute path of the built CLI entrypoint, e.g.
`/Users/<you>/Pictures/Daily Cortisol Status/cortisol/packages/cli/dist/index.js`.

Optionally set **Default Output Directory** (defaults to
`~/Pictures/Daily Cortisol Status`).

The three commands:

- **Generate Today's Clip** — list templates, ↵ renders MP4, ⌘G also emits GIF.
  Reveals the output in Finder when done.
- **Import Template** — form with URL or file picker, name, trim, crop, scale.
- **Preview Template** — list templates, ↵ shows a PNG preview inline.

## Common pitfalls

- **"drawtext: filter not found"** — you're on an older version of this tool
  that called ffmpeg's drawtext directly. The current code uses ImageMagick
  for text. Make sure you've run `npm run build` after pulling.
- **`magick: command not found`** — install ImageMagick (`brew install
  imagemagick`).
- **Raycast: "Set the Cortisol CLI Path in Raycast preferences first"** —
  open the extension's preferences and paste in the absolute path to the
  built CLI entrypoint.
- **A template I imported from `Samples/` has a double date band** — your
  `Samples/` files are previously-rendered outputs that already have a date
  band baked in. Import the raw underlying clip (or use `--crop` to strip the
  existing band before storing) to get a clean single-band output.

## Project layout

```
cortisol/
├── package.json                   npm workspaces root
├── tsconfig.base.json
├── packages/
│   ├── core/                      @cortisol/core — render/preview/import/template
│   │   └── src/
│   │       ├── index.ts           public barrel
│   │       ├── ffmpeg.ts          spawn helpers, PATH augmentation, ffprobe
│   │       ├── textimage.ts       ImageMagick band renderer
│   │       ├── render.ts          MP4 + GIF
│   │       ├── preview.ts         single-frame PNG
│   │       ├── import.ts          yt-dlp + trim/crop + probe
│   │       ├── template.ts        JSON registry + fuzzy lookup
│   │       └── date.ts            "21 May 2026" / "Monday" / slug
│   ├── cli/                       @cortisol/cli — thin commander wrapper
│   │   └── src/index.ts
│   └── raycast/                   standalone Raycast extension (shells out)
│       ├── package.json           Raycast manifest
│       └── src/{generate,import,preview,cli}.{ts,tsx}
└── templates/                     <slug>.json + <slug>.mp4
```
