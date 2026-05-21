// Cheap PNG preview: grab a single frame from the template, overlay the
// pre-rendered date band on top, write PNG, and optionally `open` it.

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { formatDate } from "./date.js";
import { run } from "./ffmpeg.js";
import { renderBand } from "./textimage.js";
import type { Template } from "./template.js";

export interface PreviewOptions {
  template: Template;
  date: Date;
  /** Where to write the PNG. Default: a freshly-created tmp file. */
  outPath?: string;
  /** Seconds into the source video to sample. Default 0.5. */
  atSec?: number;
  /** When true, run `open <png>` afterwards (macOS only). */
  openAfter?: boolean;
}

export interface PreviewResult {
  pngPath: string;
}

export async function preview(
  templatePath: string,
  opts: PreviewOptions
): Promise<PreviewResult> {
  const formatted = formatDate(opts.date);
  const band = await renderBand(opts.template, formatted);
  const outPath =
    opts.outPath ??
    path.join(os.tmpdir(), `cortisol-preview-${Date.now()}.png`);
  const bandH = opts.template.bandHeight;
  const filter =
    `[0:v]pad=iw:ih+${bandH}:0:${bandH}:color=white[bg];` +
    `[bg][1:v]overlay=0:0[v]`;

  try {
    await run("ffmpeg", [
      "-y",
      "-ss", String(opts.atSec ?? 0.5),
      "-i", templatePath,
      "-i", band.pngPath,
      "-filter_complex", filter,
      "-map", "[v]",
      "-frames:v", "1",
      outPath,
    ]);
  } finally {
    await band.cleanup();
  }

  if (opts.openAfter && process.platform === "darwin") {
    try {
      await run("open", [outPath]);
    } catch {
      /* ignore */
    }
  }

  return { pngPath: outPath };
}
