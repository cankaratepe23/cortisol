// Render: stack a pre-rendered date-band PNG on top of the template video,
// produce MP4 (with audio) and/or GIF (via gifski).
//
// Filtergraph shape (single ffmpeg invocation):
//   [0:v] pad=iw:ih+B:0:B:white [bg]
//   [bg] [1:v] overlay=0:0 [v]
// Inputs:
//   0 = template.mp4   (the source clip)
//   1 = band.png       (white background + two centered text lines)

import { promises as fs } from "node:fs";
import path from "node:path";

import { formatDate } from "./date.js";
import { pipe, run } from "./ffmpeg.js";
import { renderBand } from "./textimage.js";
import type { Template } from "./template.js";

export interface RenderOptions {
  template: Template;
  date: Date;
  outDir: string;
  formats: {
    mp4: boolean;
    gif: boolean;
  };
  /** Optional override for the filename stem; default is the date-based slug. */
  outStem?: string;
  /** GIF tuning. */
  gif?: {
    fps?: number;
    width?: number;
    quality?: number;
  };
}

export interface RenderResult {
  mp4Path?: string;
  gifPath?: string;
}

/**
 * The shared filter chain used by every output. `[0:v]` is the source video,
 * `[1:v]` is the band PNG. Audio is mapped through unchanged for MP4 outputs.
 */
function composeFilter(bandHeight: number): string {
  return (
    `[0:v]pad=iw:ih+${bandHeight}:0:${bandHeight}:color=white[bg];` +
    `[bg][1:v]overlay=0:0[v]`
  );
}

export async function render(
  templatePath: string,
  opts: RenderOptions
): Promise<RenderResult> {
  if (!opts.formats.mp4 && !opts.formats.gif) {
    throw new Error("render: at least one of formats.mp4 / formats.gif must be true");
  }

  const formatted = formatDate(opts.date);
  const stem = opts.outStem ?? formatted.filenameSlug;
  await fs.mkdir(opts.outDir, { recursive: true });

  const result: RenderResult = {};
  const band = await renderBand(opts.template, formatted);
  const filter = composeFilter(opts.template.bandHeight);

  try {
    if (opts.formats.mp4) {
      const mp4Path = path.join(opts.outDir, `${stem}.mp4`);
      await run("ffmpeg", [
        "-y",
        "-i", templatePath,
        "-i", band.pngPath,
        "-filter_complex", filter,
        "-map", "[v]",
        "-map", "0:a?",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "medium",
        "-crf", "18",
        "-c:a", "copy",
        "-movflags", "+faststart",
        mp4Path,
      ]);
      result.mp4Path = mp4Path;
    }

    if (opts.formats.gif) {
      const gifPath = path.join(opts.outDir, `${stem}.gif`);
      const fps = opts.gif?.fps ?? 20;
      const width = opts.gif?.width ?? Math.min(720, opts.template.width);
      const quality = opts.gif?.quality ?? 90;

      // ffmpeg → gifski over a pipe. The filter chain appends `fps=` so we
      // don't emit more frames than gifski will consume.
      await pipe(
        {
          cmd: "ffmpeg",
          args: [
            "-loglevel", "error",
            "-i", templatePath,
            "-i", band.pngPath,
            "-filter_complex", `${filter};[v]fps=${fps}[vout]`,
            "-map", "[vout]",
            "-f", "yuv4mpegpipe",
            "-strict", "-1",
            "pipe:1",
          ],
        },
        {
          cmd: "gifski",
          args: [
            "--fps", String(fps),
            "--width", String(width),
            "--quality", String(quality),
            "-o", gifPath,
            "-",
          ],
        }
      );
      result.gifPath = gifPath;
    }
  } finally {
    await band.cleanup();
  }

  return result;
}
