// Public surface of @cortisol/core. Both the CLI and the Raycast extension
// consume this barrel.

export {
  parseDate,
  formatDate,
  type FormattedDate,
} from "./date.js";

export {
  slugify,
  defaultTemplatesDir,
  ensureTemplatesDir,
  listTemplates,
  saveTemplate,
  removeTemplate,
  findTemplate,
  defaultBandHeight,
  defaultFontSize,
  defaultFontFile,
  type Template,
} from "./template.js";

export {
  render,
  type RenderOptions,
  type RenderResult,
} from "./render.js";

export {
  preview,
  type PreviewOptions,
  type PreviewResult,
} from "./preview.js";

export {
  importTemplate,
  type ImportOptions,
  type ImportResult,
} from "./import.js";

export { probe } from "./ffmpeg.js";
