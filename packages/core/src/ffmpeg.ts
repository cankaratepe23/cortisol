// Thin wrappers around ffmpeg / ffprobe / gifski / yt-dlp.
// We deliberately use child_process directly (no `execa` dependency) to keep
// the core package zero-deps. Errors surface stderr verbatim so the user can
// see what ffmpeg actually said.

import { spawn, type SpawnOptions } from "node:child_process";

/**
 * Extra dirs prepended to PATH for every spawn. Needed because Raycast
 * extensions don't inherit the user's shell PATH, so bare commands like
 * `ffmpeg` would fail there. These cover Homebrew (Apple Silicon + Intel)
 * and the standard user-local bin where yt-dlp lives.
 */
const EXTRA_PATH_DIRS = [
  "/opt/homebrew/bin",
  "/usr/local/bin",
  `${process.env.HOME ?? ""}/.local/bin`,
];

function augmentedEnv(env: NodeJS.ProcessEnv | undefined): NodeJS.ProcessEnv {
  const base = env ?? process.env;
  const existing = base.PATH ?? "";
  const existingParts = existing.split(":").filter(Boolean);
  const merged = [...EXTRA_PATH_DIRS, ...existingParts];
  // De-dupe while preserving order.
  const seen = new Set<string>();
  const path = merged.filter((p) => (seen.has(p) ? false : (seen.add(p), true))).join(":");
  return { ...base, PATH: path };
}

export interface RunResult {
  stdout: string;
  stderr: string;
}

export interface RunOptions extends SpawnOptions {
  /** If provided, written to stdin and then closed. */
  input?: Buffer | string;
  /** When true, pipe child stderr to this process's stderr live. */
  inheritStderr?: boolean;
}

/**
 * Spawn a command and resolve with captured stdout/stderr. Rejects on
 * non-zero exit with the stderr text attached to the error message.
 */
export function run(cmd: string, args: string[], opts: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const { input, inheritStderr, ...spawnOpts } = opts;
    const child = spawn(cmd, args, {
      stdio: [input != null ? "pipe" : "ignore", "pipe", inheritStderr ? "inherit" : "pipe"],
      ...spawnOpts,
      env: augmentedEnv(spawnOpts.env as NodeJS.ProcessEnv | undefined),
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf8");
    });
    if (!inheritStderr) {
      child.stderr?.on("data", (chunk: Buffer) => {
        stderr += chunk.toString("utf8");
      });
    }

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        const tail = stderr.trim().split("\n").slice(-15).join("\n");
        reject(new Error(`${cmd} exited ${code}\n${tail}`));
      }
    });

    if (input != null && child.stdin) {
      child.stdin.end(input);
    }
  });
}

/**
 * Pipe `producer`'s stdout into `consumer`'s stdin. Used for the
 * ffmpeg → gifski path. Both processes must exit 0.
 */
export function pipe(
  producer: { cmd: string; args: string[] },
  consumer: { cmd: string; args: string[] }
): Promise<{ producerStderr: string; consumerStderr: string }> {
  return new Promise((resolve, reject) => {
    const env = augmentedEnv(undefined);
    const a = spawn(producer.cmd, producer.args, { stdio: ["ignore", "pipe", "pipe"], env });
    const b = spawn(consumer.cmd, consumer.args, { stdio: ["pipe", "inherit", "pipe"], env });

    a.stdout.pipe(b.stdin);

    let aErr = "";
    let bErr = "";
    a.stderr.on("data", (c: Buffer) => {
      aErr += c.toString("utf8");
    });
    b.stderr.on("data", (c: Buffer) => {
      bErr += c.toString("utf8");
    });

    let aDone = false;
    let bDone = false;
    let aCode: number | null = null;
    let bCode: number | null = null;

    const maybeFinish = () => {
      if (!aDone || !bDone) return;
      if (aCode === 0 && bCode === 0) {
        resolve({ producerStderr: aErr, consumerStderr: bErr });
      } else {
        const tailA = aErr.trim().split("\n").slice(-10).join("\n");
        const tailB = bErr.trim().split("\n").slice(-10).join("\n");
        reject(
          new Error(
            `pipe failed (producer=${aCode}, consumer=${bCode})\n--producer stderr--\n${tailA}\n--consumer stderr--\n${tailB}`
          )
        );
      }
    };

    a.on("error", reject);
    b.on("error", reject);
    a.on("close", (code) => {
      aCode = code;
      aDone = true;
      maybeFinish();
    });
    b.on("close", (code) => {
      bCode = code;
      bDone = true;
      maybeFinish();
    });
  });
}

/**
 * Escape a string for use inside an ffmpeg filtergraph value (single token,
 * i.e. between an `=` and the next `:` or `,`).
 *
 * Inside filtergraph option values: `\`, `'`, `:`, `,`, `[`, `]`, `;`, `=`
 * are special. The simplest reliable strategy is to wrap the value in single
 * quotes and escape any embedded single quote as `'\''` (POSIX trick). But
 * we are passing the args via argv (not shell), so the outermost shell quoting
 * is not in play — only ffmpeg's own filter parser. For ffmpeg's parser:
 *   - inside a single-quoted value, only `\` is special
 *   - so escape backslashes, then wrap in single quotes
 *
 * For drawtext's `text=` value (a second level of parsing inside the filter),
 * `:` and `\` are also special. We don't use this helper for `text=` —
 * we write to a textfile instead. See render.ts.
 */
export function ffEscapeFilterValue(value: string): string {
  return `'${value.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

/** ffprobe a single video stream, returning width/height/duration/fps. */
export async function probe(file: string): Promise<{
  width: number;
  height: number;
  durationSec: number;
  fps: number;
}> {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height,r_frame_rate:format=duration",
    "-of",
    "json",
    file,
  ]);
  const parsed = JSON.parse(stdout) as {
    streams?: Array<{ width: number; height: number; r_frame_rate: string }>;
    format?: { duration?: string };
  };
  const s = parsed.streams?.[0];
  if (!s) throw new Error(`ffprobe: no video stream in ${file}`);
  const [num, den] = s.r_frame_rate.split("/").map(Number);
  const fps = den ? num / den : num;
  const durationSec = Number(parsed.format?.duration ?? "0");
  return { width: s.width, height: s.height, durationSec, fps };
}
