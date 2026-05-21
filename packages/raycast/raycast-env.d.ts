/// <reference types="@raycast/api">

/* 🚧 🚧 🚧
 * This file is auto-generated from the extension's manifest.
 * Do not modify manually. Instead, update the `package.json` file.
 * 🚧 🚧 🚧 */

/* eslint-disable @typescript-eslint/ban-types */

type ExtensionPreferences = {
  /** Cortisol CLI Path - Absolute path to the cortisol CLI entry point (e.g. /Users/you/.../cortisol/packages/cli/dist/index.js) */
  "cliPath": string,
  /** Default Output Directory - Where to write rendered MP4/GIF files. Defaults to ~/Pictures/Daily Cortisol Status */
  "outDir": string
}

/** Preferences accessible in all the extension's commands */
declare type Preferences = ExtensionPreferences

declare namespace Preferences {
  /** Preferences accessible in the `generate` command */
  export type Generate = ExtensionPreferences & {}
  /** Preferences accessible in the `import` command */
  export type Import = ExtensionPreferences & {}
  /** Preferences accessible in the `preview` command */
  export type Preview = ExtensionPreferences & {}
}

declare namespace Arguments {
  /** Arguments passed to the `generate` command */
  export type Generate = {}
  /** Arguments passed to the `import` command */
  export type Import = {}
  /** Arguments passed to the `preview` command */
  export type Preview = {}
}

