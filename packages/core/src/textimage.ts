// Render the white "date band" PNG via ImageMagick.
//
// We use ImageMagick instead of ffmpeg's drawtext because the Homebrew
// ffmpeg formula doesn't include libfreetype, so `drawtext` is unavailable.
//
// The band is a single `label:` pseudo-image containing both lines joined by
// a newline. Rendering both lines through one `label:` call (rather than two
// stacked `caption:` rows) guarantees:
//   - both lines use the same point size (caller-controlled `template.fontSize`)
//   - line spacing is tight and explicit (via `-interline-spacing`), not the
//     accumulated whitespace from two separately-padded rows
// The label is then padded to exactly `width × bandHeight` with `-extent`
// so the band aligns pixel-perfectly with the source video when overlaid.

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { run } from "./ffmpeg.js";
import type { Template } from "./template.js";
import type { FormattedDate } from "./date.js";

export interface BandImage {
  pngPath: string;
  /** Caller must call this when the band is no longer needed. */
  cleanup(): Promise<void>;
}

/**
 * Generate a band image sized `template.width × template.bandHeight`.
 * The returned path points at a tmp PNG; call `cleanup()` after use.
 */
export async function renderBand(
  template: Template,
  formatted: FormattedDate
): Promise<BandImage> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "cortisol-band-"));
  const pngPath = path.join(tmpDir, "band.png");

  const { width, bandHeight, fontSize, fontFile, fontColor } = template;
  // Tighten the gap between lines. ImageMagick's default line spacing is the
  // full font cap-height — a hair too generous for our two-line band. A
  // negative ~10% pull-in matches the proportions of the original screenshots.
  const interlineSpacing = -Math.round(fontSize * 0.1);

  // Note: `label:` accepts an embedded newline in the text argument and
  // renders the lines stacked using the current font/pointsize for both,
  // so both lines come out the same size automatically.
  const labelText = `${formatted.dateLine}\n${formatted.dayLine}`;

  await run("magick", [
    "-background", "white",
    "-fill", fontColor,
    "-font", fontFile,
    "-pointsize", String(fontSize),
    "-gravity", "center",
    "-interline-spacing", String(interlineSpacing),
    `label:${labelText}`,
    // Pad / center into the exact band dimensions so overlay at (0,0) aligns
    // with the padded source video.
    "-background", "white",
    "-gravity", "center",
    "-extent", `${width}x${bandHeight}`,
    pngPath,
  ]);

  return {
    pngPath,
    cleanup: async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    },
  };
}
