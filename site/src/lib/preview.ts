import { unzipSync } from "fflate";
import { extensionOf } from "./format";
import type { VaultNode } from "./types";

export type PreviewKind =
  | "image"
  | "svg"
  | "video"
  | "audio"
  | "pdf"
  | "markdown"
  | "json"
  | "csv"
  | "code"
  | "text"
  | "zip"
  | "none";

const BY_EXTENSION: Record<string, PreviewKind> = {
  png: "image",
  jpg: "image",
  jpeg: "image",
  gif: "image",
  webp: "image",
  avif: "image",
  bmp: "image",
  ico: "image",
  heic: "image",
  svg: "svg",
  mp4: "video",
  m4v: "video",
  webm: "video",
  mov: "video",
  ogv: "video",
  mkv: "video",
  mp3: "audio",
  wav: "audio",
  ogg: "audio",
  oga: "audio",
  opus: "audio",
  m4a: "audio",
  aac: "audio",
  flac: "audio",
  weba: "audio",
  pdf: "pdf",
  md: "markdown",
  markdown: "markdown",
  mdx: "markdown",
  json: "json",
  jsonl: "json",
  ndjson: "json",
  geojson: "json",
  csv: "csv",
  tsv: "csv",
  zip: "zip",
  js: "code",
  jsx: "code",
  ts: "code",
  tsx: "code",
  css: "code",
  scss: "code",
  html: "code",
  htm: "code",
  xml: "code",
  yml: "code",
  yaml: "code",
  toml: "code",
  ini: "code",
  conf: "code",
  env: "code",
  py: "code",
  rb: "code",
  go: "code",
  rs: "code",
  java: "code",
  kt: "code",
  swift: "code",
  c: "code",
  h: "code",
  cpp: "code",
  hpp: "code",
  cs: "code",
  php: "code",
  sh: "code",
  bash: "code",
  zsh: "code",
  sql: "code",
  diff: "code",
  patch: "code",
  txt: "text",
  log: "text",
  srt: "text",
  vtt: "text",
};

/** Decide la vista previa usando primero la extension y luego el MIME. */
export function previewKindFor(node: Pick<VaultNode, "name" | "mime_type" | "kind">): PreviewKind {
  if (node.kind === "folder") return "none";
  const ext = extensionOf(node.name);
  const byExt = BY_EXTENSION[ext];
  if (byExt) return byExt;
  const mime = node.mime_type || "";
  if (mime.startsWith("image/")) return mime === "image/svg+xml" ? "svg" : "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf") return "pdf";
  if (mime === "application/json") return "json";
  if (mime === "text/csv") return "csv";
  if (mime === "text/markdown") return "markdown";
  if (mime === "application/zip") return "zip";
  if (mime.startsWith("text/")) return "text";
  return "none";
}

export function isMediaKind(kind: PreviewKind): kind is "audio" | "video" {
  return kind === "audio" || kind === "video";
}

export function isTextKind(kind: PreviewKind): boolean {
  return kind === "text" || kind === "code" || kind === "json" || kind === "markdown" || kind === "csv";
}

/** Tipos que conviene leer como texto y no como binario. */
export function readsAsText(kind: PreviewKind): boolean {
  return isTextKind(kind);
}

export const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  js: "JavaScript",
  jsx: "React",
  ts: "TypeScript",
  tsx: "React + TS",
  css: "CSS",
  scss: "SCSS",
  html: "HTML",
  htm: "HTML",
  xml: "XML",
  yml: "YAML",
  yaml: "YAML",
  toml: "TOML",
  ini: "INI",
  conf: "Config",
  py: "Python",
  rb: "Ruby",
  go: "Go",
  rs: "Rust",
  java: "Java",
  kt: "Kotlin",
  swift: "Swift",
  c: "C",
  h: "C",
  cpp: "C++",
  cs: "C#",
  php: "PHP",
  sh: "Shell",
  bash: "Shell",
  zsh: "Shell",
  sql: "SQL",
  diff: "Diff",
  patch: "Patch",
  json: "JSON",
  csv: "CSV",
  tsv: "TSV",
  md: "Markdown",
  log: "Log",
  txt: "Texto",
};

export function languageOf(name: string): string {
  return LANGUAGE_BY_EXTENSION[extensionOf(name)] ?? "Texto";
}

export type CsvTable = { head: string[]; rows: string[][]; total: number; truncated: boolean; delimiter: string };

/** Parser CSV/TSV con comillas dobles y saltos de linea dentro de comillas. */
export function parseDelimited(text: string, maxRows = 400, maxColumns = 30): CsvTable {
  const firstLine = text.slice(0, 4000).split("\n")[0] ?? "";
  const delimiter = firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  let allRows = 0;
  let truncated = false;

  const pushField = () => {
    if (row.length < maxColumns) row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    if (row.some((cell) => cell.trim() !== "")) {
      allRows += 1;
      if (rows.length < maxRows) rows.push(row);
      else truncated = true;
    }
    row = [];
  };

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"') {
        if (text[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        field += char;
      }
      continue;
    }
    if (char === '"') {
      quoted = true;
      continue;
    }
    if (char === delimiter) {
      pushField();
      continue;
    }
    if (char === "\n" || char === "\r") {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      pushRow();
      continue;
    }
    field += char;
  }
  if (field !== "" || row.length) pushRow();

  const [head = [], ...body] = rows;
  return { head, rows: body, total: Math.max(0, allRows - 1), truncated, delimiter: delimiter === "\t" ? "TAB" : "coma" };
}

export type JsonResult = { ok: true; text: string; kind: "object" | "array" | "value"; count: number } | { ok: false };

/** Formatea JSON con sangria y resume el contenido; si no es JSON devuelve ok: false. */
export function prettyJson(source: string, indent = 2): JsonResult {
  const trimmed = source.trim();
  if (!trimmed) return { ok: false };
  try {
    const value: unknown = JSON.parse(trimmed);
    const kind = Array.isArray(value) ? "array" : value !== null && typeof value === "object" ? "object" : "value";
    const count = Array.isArray(value) ? value.length : kind === "object" ? Object.keys(value as object).length : 1;
    return { ok: true, text: JSON.stringify(value, null, indent), kind, count };
  } catch {
    return { ok: false };
  }
}

export type MarkdownBlock =
  | { type: "heading"; level: number; text: string }
  | { type: "paragraph"; text: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "code"; lang: string; code: string }
  | { type: "quote"; text: string }
  | { type: "rule" }
  | { type: "table"; head: string[]; rows: string[][] };

const TABLE_ROW = /^\s*\|(.+)\|\s*$/;

function splitTableRow(line: string): string[] {
  const inner = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return inner.split("|").map((cell) => cell.trim());
}

/** Parser Markdown por bloques: suficiente para notas y README, sin dependencias. */
export function parseMarkdown(source: string): MarkdownBlock[] {
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  const blocks: MarkdownBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    const fence = line.match(/^\s*(```|~~~)(.*)$/);
    if (fence) {
      const marker = fence[1];
      const lang = fence[2].trim();
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].trimStart().startsWith(marker)) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      blocks.push({ type: "code", lang, code: code.join("\n") });
      continue;
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/);
    if (heading) {
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      index += 1;
      continue;
    }

    if (/^\s*([-*_])\s*\1\s*\1[\s\S]*$/.test(line) && line.replace(/[\s\-*_]/g, "") === "") {
      blocks.push({ type: "rule" });
      index += 1;
      continue;
    }

    if (/^\s*>\s?/.test(line)) {
      const quote: string[] = [];
      while (index < lines.length && /^\s*>\s?/.test(lines[index])) {
        quote.push(lines[index].replace(/^\s*>\s?/, ""));
        index += 1;
      }
      blocks.push({ type: "quote", text: quote.join(" ") });
      continue;
    }

    if (TABLE_ROW.test(line) && index + 1 < lines.length && /^\s*\|[\s:|-]+\|\s*$/.test(lines[index + 1])) {
      const head = splitTableRow(line);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && TABLE_ROW.test(lines[index])) {
        rows.push(splitTableRow(lines[index]));
        index += 1;
      }
      blocks.push({ type: "table", head, rows });
      continue;
    }

    const bullet = line.match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
    if (bullet) {
      const ordered = /\d/.test(bullet[1]);
      const items: string[] = [];
      while (index < lines.length) {
        const match = lines[index].match(/^\s*([-*+]|\d+[.)])\s+(.*)$/);
        if (!match) break;
        items.push(match[2].trim());
        index += 1;
      }
      blocks.push({ type: "list", ordered, items });
      continue;
    }

    const paragraph: string[] = [];
    while (index < lines.length && lines[index].trim() && !/^\s*(```|~~~|#{1,6}\s|>|([-*+]|\d+[.)])\s)/.test(lines[index])) {
      paragraph.push(lines[index].trim());
      index += 1;
    }
    if (paragraph.length) blocks.push({ type: "paragraph", text: paragraph.join(" ") });
    else index += 1;
  }

  return blocks;
}

export type InlineToken =
  | { type: "text"; value: string }
  | { type: "code"; value: string }
  | { type: "bold"; value: string }
  | { type: "italic"; value: string }
  | { type: "link"; value: string; href: string };

const INLINE = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*|_[^_]+_)|(\[[^\]]+\]\((https?:\/\/[^\s)]+)\))/;

/** Formato en linea (negrita, cursiva, codigo y enlaces http). */
export function parseInline(text: string): InlineToken[] {
  const tokens: InlineToken[] = [];
  let rest = text;
  while (rest) {
    const match = rest.match(INLINE);
    if (!match || match.index === undefined) {
      tokens.push({ type: "text", value: rest });
      break;
    }
    if (match.index > 0) tokens.push({ type: "text", value: rest.slice(0, match.index) });
    const token = match[0];
    if (token.startsWith("`")) tokens.push({ type: "code", value: token.slice(1, -1) });
    else if (token.startsWith("**")) tokens.push({ type: "bold", value: token.slice(2, -2) });
    else if (token.startsWith("[")) {
      const link = token.match(/^\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)$/);
      tokens.push(link ? { type: "link", value: link[1], href: link[2] } : { type: "text", value: token });
    } else tokens.push({ type: "italic", value: token.slice(1, -1) });
    rest = rest.slice(match.index + token.length);
  }
  return tokens;
}

export type ZipEntry = { name: string; size: number; dir: boolean };

/** Lista el contenido de un ZIP sin descomprimirlo (fflate omite la inflacion). */
export function listZipEntries(data: Uint8Array, limit = 400): { entries: ZipEntry[]; truncated: boolean } {
  const entries: ZipEntry[] = [];
  let total = 0;
  try {
    unzipSync(data, {
      filter: (file) => {
        total += 1;
        if (entries.length < limit) {
          entries.push({ name: file.name, size: file.originalSize ?? file.size, dir: file.name.endsWith("/") });
        }
        return false;
      },
    });
  } catch {
    return { entries, truncated: false };
  }
  entries.sort((a, b) => a.name.localeCompare(b.name));
  return { entries, truncated: total > limit };
}

/** Colorea JSON ya formateado en tokens simples (clave, cadena, numero, booleano). */
export type JsonToken = { type: "plain" | "key" | "string" | "number" | "literal"; value: string };

export function tokenizeJson(formatted: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  const pattern = /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)/g;
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(formatted))) {
    if (match.index > last) tokens.push({ type: "plain", value: formatted.slice(last, match.index) });
    if (match[1]) {
      if (match[2]) {
        tokens.push({ type: "key", value: match[1] });
        tokens.push({ type: "plain", value: match[2] });
      } else {
        tokens.push({ type: "string", value: match[1] });
      }
    } else if (match[3]) {
      tokens.push({ type: "literal", value: match[3] });
    } else if (match[4]) {
      tokens.push({ type: "number", value: match[4] });
    }
    last = match.index + match[0].length;
  }
  if (last < formatted.length) tokens.push({ type: "plain", value: formatted.slice(last) });
  return tokens;
}
