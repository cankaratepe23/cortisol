// Thin wrapper around the cortisol CLI. We shell out instead of importing
// @cortisol/core so the Raycast bundler doesn't have to handle a workspace
// dep with absolute paths.

import { spawn } from "child_process";
import { homedir } from "os";
import { getPreferenceValues } from "@raycast/api";

interface Prefs {
  cliPath: string;
  outDir?: string;
}

const EXTRA_PATH_DIRS = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  `${homedir()}/.local/bin`,
];

function augmentedEnv(): NodeJS.ProcessEnv {
  const existing = (process.env.PATH ?? "").split(":").filter(Boolean);
  const seen = new Set<string>();
  const merged = [...EXTRA_PATH_DIRS, ...existing].filter((p) =>
    seen.has(p) ? false : (seen.add(p), true)
  );
  return { ...process.env, PATH: merged.join(":") };
}

export function getOutDir(): string {
  const prefs = getPreferenceValues<Prefs>();
  return prefs.outDir?.trim() || `${homedir()}/Pictures/Daily Cortisol Status`;
}

export function runCli(args: string[]): Promise<{ stdout: string; stderr: string }> {
  const { cliPath } = getPreferenceValues<Prefs>();
  if (!cliPath) {
    return Promise.reject(
      new Error("Set the Cortisol CLI Path in Raycast preferences first.")
    );
  }
  return new Promise((resolve, reject) => {
    const child = spawn("node", [cliPath, ...args], {
      env: augmentedEnv(),
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout?.on("data", (c: Buffer) => (stdout += c.toString("utf8")));
    child.stderr?.on("data", (c: Buffer) => (stderr += c.toString("utf8")));
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(stderr.trim() || `cortisol exited ${code}`));
    });
  });
}

export interface TemplateMeta {
  name: string;
  slug: string;
  video: string;
  bandHeight: number;
  width: number;
  height: number;
  fontSize: number;
  fontFile: string;
  fontColor: string;
  createdAt: string;
}

export async function listTemplates(): Promise<TemplateMeta[]> {
  // The CLI's `templates list` is human-readable; we instead call `show` per
  // name, but it's simpler to read the templates dir directly via a small
  // helper command. For now: parse `templates list` lines that include the
  // slug in parens, then call `show <slug>` for each. Two round-trips per
  // template, but the count is small.
  const { stdout } = await runCli(["templates", "list"]);
  if (stdout.trim() === "(no templates yet)") return [];
  const slugs: string[] = [];
  for (const line of stdout.split("\n")) {
    const m = /\(([^()]+)\)\s*$/.exec(line.trim());
    if (m) slugs.push(m[1]);
  }
  const out: TemplateMeta[] = [];
  for (const slug of slugs) {
    const { stdout: showOut } = await runCli(["templates", "show", slug]);
    out.push(JSON.parse(showOut) as TemplateMeta);
  }
  return out;
}
