// Render the white "date band" PNG via ImageMagick.
//
// We use ImageMagick instead of ffmpeg's drawtext because the Homebrew
// ffmpeg formula doesn't include libfreetype, so `drawtext` is unavailable.
// ImageMagick is a small dep (already present on this user's machine) and
// gives us much cleaner typography control anyway.
//
// The band is produced by stacking two `caption:` pseudo-images:
//   - top: the date line, taller (~55% of band)
//   - bottom: the day line, shorter (~45% of band)
// Both have a white background and centered text, so `-append` produces a
// seamless single image of the requested `width × bandHeight` dimensions.

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
  // Split the band into two stacked rows. The date row is a bit larger so its
  // text appears more prominent (matches the screenshots).
  const dateRow = Math.round(bandHeight * 0.55);
  const dayRow = bandHeight - dateRow;
  const daySize = Math.round(fontSize * 0.75);

  await run("magick", [
    "-background", "white",
    "-fill", fontColor,
    "-font", fontFile,
    // Date line
    "-size", `${width}x${dateRow}`,
    "-gravity", "center",
    "-pointsize", String(fontSize),
    `caption:${formatted.dateLine}`,
    // Day line
    "-size", `${width}x${dayRow}`,
    "-gravity", "center",
    "-pointsize", String(daySize),
    `caption:${formatted.dayLine}`,
    // Stack them vertically and write
    "-append",
    pngPath,
  ]);

  return {
    pngPath,
    cleanup: async () => {
      await fs.rm(tmpDir, { recursive: true, force: true });
    },
  };
}
