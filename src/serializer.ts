import type { XLRCFile, XLRCFurigana, XLRCLine, XLRCMeta, XLRCMetaValue, XLRCWord } from "./types";

const KNOWN_META_ORDER = ["ti", "ar", "al", "length", "by", "offset", "lang", "langs", "xlrc"] as const;

export function serializeXLRC(file: XLRCFile): string {
  const output: string[] = [];
  const headers = serializeHeaders(file.meta);

  output.push(...headers);
  if (headers.length > 0 && file.lines.length > 0) {
    output.push("");
  }

  for (const line of file.lines) {
    output.push(serializeLine(line));
    for (const translation of line.translations) {
      output.push(`[>${translation.lang}]${translation.text}`);
    }
  }

  return `${output.join("\n")}\n`;
}

function serializeHeaders(meta: XLRCMeta): string[] {
  const headers: string[] = [];
  const usedKeys = new Set<string>();

  for (const key of KNOWN_META_ORDER) {
    const value = meta[key];
    if (value === undefined) {
      continue;
    }

    headers.push(`[${key}:${formatMetaValue(value)}]`);
    usedKeys.add(key);
  }

  const unknownKeys = Object.keys(meta)
    .filter((key) => !usedKeys.has(key) && meta[key] !== undefined)
    .sort();

  for (const key of unknownKeys) {
    headers.push(`[${key}:${formatMetaValue(meta[key])}]`);
  }

  return headers;
}

function serializeLine(line: XLRCLine): string {
  const timestamp = `[${formatTimestamp(line.timestamp)}]`;
  const voice = line.voice ? `[v:${line.voice}]` : "";
  const content = line.isEmpty ? "" : serializeLyricContent(line);
  return `${timestamp}${voice}${content}`;
}

function serializeLyricContent(line: XLRCLine): string {
  if (line.words.length > 0) {
    return line.words.map((word) => serializeWord(word)).join("");
  }

  return line.sourceText ?? applyFurigana(line.text, line.furigana);
}

function serializeWord(word: XLRCWord): string {
  const sourceText = word.sourceText ?? applyFurigana(word.text, word.furigana);
  return `<${formatTimestamp(word.timestamp)}>${sourceText}`;
}

function applyFurigana(text: string, furigana: XLRCFurigana[]): string {
  return [...furigana]
    .sort((a, b) => b.end - a.end)
    .reduce((output, entry) => {
      return `${output.slice(0, entry.end)}[${entry.reading}]${output.slice(entry.end)}`;
    }, text);
}

function formatMetaValue(value: XLRCMetaValue): string {
  if (Array.isArray(value)) {
    return value.join(",");
  }

  return String(value);
}

function formatTimestamp(timestamp: number): string {
  const safeTimestamp = Math.max(0, Math.round(timestamp));
  const minutes = Math.floor(safeTimestamp / 60_000);
  const seconds = Math.floor((safeTimestamp % 60_000) / 1_000);
  const centiseconds = Math.floor((safeTimestamp % 1_000) / 10);

  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}.${String(centiseconds).padStart(2, "0")}`;
}
