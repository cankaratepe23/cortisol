#!/usr/bin/env node
// CLI entry point. Thin wrapper around @cortisol/core. All real work
// happens in the core package; this file is parsing + pretty output.

import path from "node:path";

import { Command } from "commander";

import {
  defaultTemplatesDir,
  findTemplate,
  importTemplate,
  listTemplates,
  parseDate,
  preview,
  removeTemplate,
  render,
} from "@cortisol/core";

const program = new Command();
program
  .name("cortisol")
  .description("Generate daily Cortisol Status videos from named templates")
  .version("0.1.0");

const TEMPLATES_DIR = defaultTemplatesDir();

function resolveTemplateVideo(slug: string, video: string): string {
  return path.join(TEMPLATES_DIR, video);
}

// -------- render --------
program
  .command("render <query>")
  .description("Render a template stamped with the given (or today's) date")
  .option("-d, --date <YYYY-MM-DD>", "date to stamp (default: today)")
  .option("-o, --out <dir>", "output directory (default: current working dir)")
  .option("--gif", "also emit GIF via gifski (no audio)")
  .option("--mp4", "emit MP4 (default true unless --gif-only)")
  .option("--gif-only", "emit only the GIF, skip MP4")
  .option("--gif-fps <n>", "GIF frame rate", (v) => Number(v))
  .option("--gif-width <px>", "GIF width", (v) => Number(v))
  .option("--gif-quality <0-100>", "GIF quality", (v) => Number(v))
  .action(async (query: string, opts: Record<string, unknown>) => {
    const t = await findTemplate(TEMPLATES_DIR, query);
    const date = parseDate(opts.date as string | undefined);
    const outDir = path.resolve((opts.out as string) ?? process.cwd());
    const wantGif = Boolean(opts.gif) || Boolean(opts.gifOnly);
    const wantMp4 = Boolean(opts.gifOnly) ? false : true;

    process.stderr.write(`→ rendering "${t.name}" for ${date.toDateString()}\n`);
    const result = await render(resolveTemplateVideo(t.slug, t.video), {
      template: t,
      date,
      outDir,
      formats: { mp4: wantMp4, gif: wantGif },
      gif: {
        fps: opts.gifFps as number | undefined,
        width: opts.gifWidth as number | undefined,
        quality: opts.gifQuality as number | undefined,
      },
    });
    if (result.mp4Path) console.log(result.mp4Path);
    if (result.gifPath) console.log(result.gifPath);
  });

// -------- preview --------
program
  .command("preview <query>")
  .description("Render a single composed frame to PNG and open it")
  .option("-d, --date <YYYY-MM-DD>", "date to stamp (default: today)")
  .option("-o, --out <png>", "where to write the PNG (default: a temp file)")
  .option("--at <sec>", "seconds into the template to sample", (v) => Number(v))
  .option("--no-open", "don't open the PNG after rendering")
  .action(async (query: string, opts: Record<string, unknown>) => {
    const t = await findTemplate(TEMPLATES_DIR, query);
    const date = parseDate(opts.date as string | undefined);
    const result = await preview(resolveTemplateVideo(t.slug, t.video), {
      template: t,
      date,
      outPath: opts.out as string | undefined,
      atSec: opts.at as number | undefined,
      openAfter: opts.open !== false,
    });
    console.log(result.pngPath);
  });

// -------- templates --------
const templates = program.command("templates").description("Manage video templates");

templates
  .command("list")
  .description("List all stored templates")
  .action(async () => {
    const list = await listTemplates(TEMPLATES_DIR);
    if (list.length === 0) {
      console.log("(no templates yet)");
      return;
    }
    for (const t of list) {
      console.log(
        `${t.name.padEnd(40)}  ${t.width}x${t.height}+band ${t.bandHeight}  (${t.slug})`
      );
    }
  });

templates
  .command("show <query>")
  .description("Show full metadata for a template")
  .action(async (query: string) => {
    const t = await findTemplate(TEMPLATES_DIR, query);
    console.log(JSON.stringify(t, null, 2));
  });

templates
  .command("import <source>")
  .description("Import a new template from a local file or yt-dlp URL")
  .requiredOption("-n, --name <name>", 'human-readable name, e.g. "ryan gosling low cortisol beach"')
  .option("--start <ts>", "trim start, ffmpeg syntax (00:00:03 or 3.0)")
  .option("--end <ts>", "trim end, ffmpeg syntax")
  .option("--crop <W:H:X:Y>", "ffmpeg crop expression (no default)")
  .option("--scale <W:H>", 'ffmpeg scale expression, e.g. "1080:-2"')
  .option("--band-height <px>", "override default band height", (v) => Number(v))
  .option("--font-size <px>", "override default font size", (v) => Number(v))
  .option("--font-file <path>", "override default font file")
  .option("--font-color <css>", "text color (default black)")
  .action(async (source: string, opts: Record<string, unknown>) => {
    const result = await importTemplate({
      source,
      name: opts.name as string,
      templatesDir: TEMPLATES_DIR,
      start: opts.start as string | undefined,
      end: opts.end as string | undefined,
      crop: opts.crop as string | undefined,
      scale: opts.scale as string | undefined,
      bandHeight: opts.bandHeight as number | undefined,
      fontSize: opts.fontSize as number | undefined,
      fontFile: opts.fontFile as string | undefined,
      fontColor: opts.fontColor as string | undefined,
    });
    console.log(
      `imported "${result.template.name}" → ${result.videoPath} ` +
        `(${result.template.width}x${result.template.height}, band ${result.template.bandHeight}px)`
    );
  });

templates
  .command("remove <query>")
  .description("Remove a template (JSON + video file)")
  .action(async (query: string) => {
    const t = await findTemplate(TEMPLATES_DIR, query);
    await removeTemplate(TEMPLATES_DIR, t.slug);
    console.log(`removed "${t.name}"`);
  });

program.parseAsync(process.argv).catch((err) => {
  process.stderr.write(`error: ${(err as Error).message}\n`);
  process.exit(1);
});
