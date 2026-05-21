// Import a new template from a URL (via yt-dlp) or a local file.
// Apply optional trim/crop/scale, re-encode to H.264/AAC, store under
// templates/<slug>.{mp4,json}.

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { probe, run } from "./ffmpeg.js";
import {
  defaultBandHeight,
  defaultFontFile,
  defaultFontSize,
  ensureTemplatesDir,
  saveTemplate,
  slugify,
  type Template,
} from "./template.js";

export interface ImportOptions {
  /** URL (http/https → yt-dlp) or path to a local file. */
  source: string;
  /** Human-readable name; also used to derive the slug. */
  name: string;
  /** Where to store the resulting template files. */
  templatesDir: string;
  /** Optional trim start, ffmpeg syntax (e.g. "00:00:03" or "3.0"). */
  start?: string;
  /** Optional trim end, ffmpeg syntax. */
  end?: string;
  /** Optional crop, "W:H:X:Y" — applied before scale. */
  crop?: string;
  /** Optional scale, "W:H" — `-2` allowed for either dim to preserve AR. */
  scale?: string;
  /** Override the auto band height. */
  bandHeight?: number;
  /** Override the auto font size. */
  fontSize?: number;
  /** Override the font file. */
  fontFile?: string;
  /** Override the font color (default "black"). */
  fontColor?: string;
}

export interface ImportResult {
  template: Template;
  videoPath: string;
  jsonPath: string;
}

function isUrl(s: string): boolean {
  return /^https?:\/\//i.test(s);
}

async function downloadWithYtDlp(url: string, intoDir: string): Promise<string> {
  const tmplPath = path.join(intoDir, "source.%(ext)s");
  await run("yt-dlp", [
    "-f", "bv*+ba/b",
    "--no-playlist",
    "--no-progress",
    "-o", tmplPath,
    url,
  ]);
  // Find whatever file yt-dlp dropped.
  const entries = await fs.readdir(intoDir);
  const file = entries.find((f) => f.startsWith("source."));
  if (!file) throw new Error(`yt-dlp did not produce an output in ${intoDir}`);
  return path.join(intoDir, file);
}

export async function importTemplate(opts: ImportOptions): Promise<ImportResult> {
  const slug = slugify(opts.name);
  if (!slug) throw new Error(`Cannot derive slug from name "${opts.name}"`);
  await ensureTemplatesDir(opts.templatesDir);

  // Work in a scratch dir so a yt-dlp failure or a transcode failure doesn't
  // litter the templates dir.
  const work = await fs.mkdtemp(path.join(os.tmpdir(), "cortisol-import-"));
  try {
    const inputFile = isUrl(opts.source)
      ? await downloadWithYtDlp(opts.source, work)
      : path.resolve(opts.source);

    // Make sure the input exists & is readable (will throw a useful error if not).
    await fs.access(inputFile);

    // Build the transcode args. We re-encode unconditionally so the resulting
    // template is uniform (H.264 yuv420p + AAC). That makes the render stage
    // a simple `-c:a copy` for audio.
    const args: string[] = ["-y"];
    if (opts.start) args.push("-ss", opts.start);
    if (opts.end) args.push("-to", opts.end);
    args.push("-i", inputFile);

    const filters: string[] = [];
    if (opts.crop) filters.push(`crop=${opts.crop}`);
    if (opts.scale) filters.push(`scale=${opts.scale}`);
    // Force pixel format compatible with browsers / quicktime.
    filters.push("format=yuv420p");

    args.push(
      "-vf", filters.join(","),
      "-c:v", "libx264",
      "-preset", "medium",
      "-crf", "18",
      "-c:a", "aac",
      "-b:a", "192k",
      "-movflags", "+faststart"
    );

    const videoOut = path.join(opts.templatesDir, `${slug}.mp4`);
    args.push(videoOut);

    await run("ffmpeg", args);

    // Probe to capture real dimensions of the produced file.
    const meta = await probe(videoOut);
    const bandHeight = opts.bandHeight ?? defaultBandHeight(meta.width, meta.height);
    const fontSize = opts.fontSize ?? defaultFontSize(bandHeight);
    const fontFile = opts.fontFile ?? defaultFontFile();
    const fontColor = opts.fontColor ?? "black";

    const template: Template = {
      name: opts.name.trim(),
      slug,
      video: `${slug}.mp4`,
      bandHeight,
      width: meta.width,
      height: meta.height,
      fontSize,
      fontFile,
      fontColor,
      createdAt: new Date().toISOString(),
    };
    const jsonPath = await saveTemplate(opts.templatesDir, template);
    return { template, videoPath: videoOut, jsonPath };
  } finally {
    await fs.rm(work, { recursive: true, force: true });
  }
}
