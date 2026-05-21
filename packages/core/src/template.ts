// Template registry: JSON metadata stored alongside each template video,
// plus fuzzy lookup by name.

import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export interface Template {
  /** Human-readable name, e.g. "ryan gosling low cortisol beach" */
  name: string;
  /** Filename-safe slug, e.g. "ryan-gosling-low-cortisol-beach" */
  slug: string;
  /** Filename of the video relative to templatesDir */
  video: string;
  /** Pixels of white band added on top of the source video */
  bandHeight: number;
  /** Source video width in px (captured at import time) */
  width: number;
  /** Source video height in px (captured at import time) */
  height: number;
  /** drawtext fontsize for the date line. Day line is ~75% of this. */
  fontSize: number;
  /** Absolute path to a .ttf/.otf/.ttc font file */
  fontFile: string;
  /** Text color, e.g. "black" or "#1a1a1a" */
  fontColor: string;
  /** ISO timestamp of import */
  createdAt: string;
}

export function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/['"]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Default templates directory: <repo-root>/templates (i.e. cortisol/templates) */
export function defaultTemplatesDir(): string {
  // From packages/core/dist/template.js, climb to the monorepo root and
  // then into templates/.
  //   dist/ → core/ → packages/ → cortisol/
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, "..", "..", "..", "templates");
}

export async function ensureTemplatesDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

export async function listTemplates(dir: string): Promise<Template[]> {
  await ensureTemplatesDir(dir);
  const entries = await fs.readdir(dir);
  const jsonFiles = entries.filter((f) => f.endsWith(".json"));
  const templates: Template[] = [];
  for (const file of jsonFiles) {
    const full = path.join(dir, file);
    try {
      const raw = await fs.readFile(full, "utf8");
      templates.push(JSON.parse(raw) as Template);
    } catch (err) {
      // Skip corrupt files but surface a hint via stderr.
      process.stderr.write(`warn: could not load ${file}: ${(err as Error).message}\n`);
    }
  }
  return templates.sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveTemplate(dir: string, t: Template): Promise<string> {
  await ensureTemplatesDir(dir);
  const jsonPath = path.join(dir, `${t.slug}.json`);
  await fs.writeFile(jsonPath, JSON.stringify(t, null, 2) + "\n", "utf8");
  return jsonPath;
}

export async function removeTemplate(dir: string, slug: string): Promise<void> {
  const jsonPath = path.join(dir, `${slug}.json`);
  // Read first to discover the video filename, then delete both.
  let videoFile: string | undefined;
  try {
    const raw = await fs.readFile(jsonPath, "utf8");
    videoFile = (JSON.parse(raw) as Template).video;
  } catch {
    /* fall through — we'll still try to delete json */
  }
  await fs.rm(jsonPath, { force: true });
  if (videoFile) {
    await fs.rm(path.join(dir, videoFile), { force: true });
  }
}

/**
 * Fuzzy lookup by tokenized substring against template.name. All whitespace-
 * separated tokens in `query` must appear (as substrings) in the candidate
 * name. Returns the single match or throws with the ambiguous candidates.
 */
export async function findTemplate(dir: string, query: string): Promise<Template> {
  const templates = await listTemplates(dir);
  if (templates.length === 0) {
    throw new Error(
      `no templates found in ${dir}. Run \`cortisol templates import <file> --name "..."\` first.`
    );
  }
  const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) throw new Error("empty template query");
  const matches = templates.filter((t) => {
    const haystack = t.name.toLowerCase();
    return tokens.every((tok) => haystack.includes(tok));
  });
  if (matches.length === 1) return matches[0];
  if (matches.length === 0) {
    const names = templates.map((t) => `  - ${t.name}`).join("\n");
    throw new Error(`no template matches "${query}". Available:\n${names}`);
  }
  const names = matches.map((t) => `  - ${t.name}`).join("\n");
  throw new Error(`"${query}" is ambiguous. Matches:\n${names}`);
}

/**
 * Compute a sensible default band height for a source clip's dimensions.
 *
 * - For portrait / square sources: 270px (a solid two-line band).
 * - For landscape sources: enough band to bring the output close to a 1:1
 *   square. e.g. a 1000×700 source gets a 300px band → 1000×1000 output.
 *
 * Rounded to an even number so yuv420p stays happy.
 */
export function defaultBandHeight(sourceWidth: number, sourceHeight: number): number {
  const squareGap = Math.max(0, sourceWidth - sourceHeight);
  const raw = Math.max(270, squareGap);
  return raw % 2 === 0 ? raw : raw + 1;
}

/**
 * Default fontsize given band height. Tuned so a 270px band yields ~100pt,
 * which lets two stacked lines (with our negative `-interline-spacing`)
 * fill the band cleanly.
 */
export function defaultFontSize(bandHeight: number): number {
  return Math.max(24, Math.round(bandHeight * 0.37));
}

/** Default macOS font. Other platforms can override via --font-file at import. */
export function defaultFontFile(): string {
  return "/System/Library/Fonts/Supplemental/Arial Bold.ttf";
}
