import type {
  ValidationWarning,
  XLRCFile,
  XLRCFurigana,
  XLRCLine,
  XLRCMeta,
  XLRCTranslation,
  XLRCWord
} from "./types";

const HEADER_TAG_PATTERN = /^\[([A-Za-z][A-Za-z0-9_-]*):([^\]]*)\]$/;
const TIMESTAMP_PATTERN_SOURCE = String.raw`\d+:\d{2}(?:\.\d{1,3})?`;
const TIMESTAMP_VALUE_PATTERN = new RegExp(`^(${TIMESTAMP_PATTERN_SOURCE})$`);
const LINE_TIMESTAMP_PATTERN = new RegExp(`^\\[(${TIMESTAMP_PATTERN_SOURCE})\\]`);
const TRANSLATION_PATTERN = /^\[>([A-Za-z0-9]+(?:-[A-Za-z0-9]+)*)\](.*)$/;
const VOICE_PATTERN = /^\[v:([^\]]*)\](.*)$/;
const WORD_TIMESTAMP_PATTERN = new RegExp(`<(${TIMESTAMP_PATTERN_SOURCE})>`, "g");
const WORD_TIMESTAMP_TAG_PATTERN = new RegExp(`^<${TIMESTAMP_PATTERN_SOURCE}>$`);
const ANY_ANGLE_TAG_PATTERN = /<[^>]*>/g;
const KANA_PATTERN = /^[\u3040-\u309f\u30a0-\u30ff\u31f0-\u31ff\uff66-\uff9f]+$/u;
const KANJI_PATTERN = /[\u3400-\u9fff々〆ヵヶ]/u;

const KNOWN_HEADERS = new Set(["ti", "ar", "al", "by", "offset", "lang", "langs", "xlrc"]);

interface TimestampResult {
  timestamp: number;
  warning?: string;
}

interface ParsedLineTimestamps {
  timestamps: number[];
  body: string;
}

type ParsedLineTimestampsResult = ParsedLineTimestamps | "malformed" | undefined;

interface ParsedLyricContent {
  text: string;
  sourceText: string;
  words: XLRCWord[];
  furigana: XLRCFurigana[];
}

interface ParsedFuriganaText {
  text: string;
  furigana: XLRCFurigana[];
}

export function parseXLRC(input: string): XLRCFile {
  const warnings: ValidationWarning[] = [];
  const meta: XLRCMeta = {};
  const lines: XLRCLine[] = [];
  const rows = input.replace(/^\uFEFF/, "").split(/\r?\n/);
  let lastLyricLines: XLRCLine[] = [];
  let inHeader = true;

  rows.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.trimEnd();

    if (line.trim() === "") {
      return;
    }

    const translation = parseTranslationLine(line, lineNumber, warnings);
    if (translation) {
      if (lastLyricLines.length === 0) {
        warn(warnings, lineNumber, "orphan-translation", "Translation line has no preceding lyric line");
        return;
      }

      lastLyricLines.forEach((lyricLine) => lyricLine.translations.push({ ...translation }));
      return;
    }

    const timestampLine = parseLineTimestamps(line, lineNumber, warnings);
    if (timestampLine === "malformed") {
      inHeader = false;
      lastLyricLines = [];
      return;
    }

    if (timestampLine) {
      inHeader = false;
      const [firstTimestamp, ...additionalTimestamps] = timestampLine.timestamps;
      if (firstTimestamp === undefined) {
        lastLyricLines = [];
        return;
      }

      const firstLine = parseLyricLineBody(firstTimestamp, timestampLine.body, lineNumber, warnings);
      lastLyricLines = [
        firstLine,
        ...additionalTimestamps.map((timestamp) => cloneLyricLine(firstLine, timestamp))
      ];
      lines.push(...lastLyricLines);
      return;
    }

    if (inHeader) {
      const headerMatch = line.match(HEADER_TAG_PATTERN);
      if (headerMatch) {
        applyHeader(meta, headerMatch[1] ?? "", headerMatch[2] ?? "", lineNumber, warnings);
        return;
      }
    }

    if (/^\[\d+:\d/.test(line)) {
      warn(warnings, lineNumber, "malformed-timestamp", "Malformed timestamp; line was skipped");
      lastLyricLines = [];
      inHeader = false;
      return;
    }

    if (line.startsWith("[")) {
      warn(warnings, lineNumber, "unrecognized-line", "Unrecognized line prefix; line was skipped");
      lastLyricLines = [];
      inHeader = false;
      return;
    }

    warn(warnings, lineNumber, "unrecognized-line", "Line has no timestamp or supported tag; line was skipped");
    lastLyricLines = [];
    inHeader = false;
  });

  return { meta, lines, warnings };
}

function parseLineTimestamps(
  line: string,
  lineNumber: number,
  warnings: ValidationWarning[]
): ParsedLineTimestampsResult {
  const timestamps: number[] = [];
  let cursor = 0;

  while (cursor < line.length) {
    const timestampMatch = line.slice(cursor).match(LINE_TIMESTAMP_PATTERN);
    if (!timestampMatch) {
      break;
    }

    const timestamp = readTimestamp(timestampMatch[1] ?? "");
    if (timestamp.warning) {
      warn(warnings, lineNumber, "malformed-timestamp", timestamp.warning);
      return "malformed";
    }

    timestamps.push(timestamp.timestamp);
    cursor += timestampMatch[0].length;
  }

  if (timestamps.length === 0) {
    return undefined;
  }

  return {
    timestamps,
    body: line.slice(cursor)
  };
}

function cloneLyricLine(line: XLRCLine, timestamp: number): XLRCLine {
  return {
    ...line,
    timestamp,
    words: line.words.map((word) => ({
      ...word,
      furigana: word.furigana.map((entry) => ({ ...entry }))
    })),
    furigana: line.furigana.map((entry) => ({ ...entry })),
    translations: []
  };
}

function applyHeader(
  meta: XLRCMeta,
  key: string,
  value: string,
  line: number,
  warnings: ValidationWarning[]
): void {
  if (!KNOWN_HEADERS.has(key)) {
    meta[key] = value;
    return;
  }

  if (key === "offset") {
    const parsedOffset = Number(value);
    if (!/^[-+]?\d+$/.test(value) || !Number.isSafeInteger(parsedOffset)) {
      warn(warnings, line, "malformed-offset", "Offset header is not a valid integer");
      return;
    }

    meta.offset = parsedOffset;
    return;
  }

  if (key === "langs") {
    meta.langs = value
      .split(",")
      .map((lang) => lang.trim())
      .filter(Boolean);
    return;
  }

  meta[key] = value;
}

function parseTranslationLine(
  line: string,
  lineNumber: number,
  warnings: ValidationWarning[]
): XLRCTranslation | undefined {
  if (!line.startsWith("[>")) {
    return undefined;
  }

  const translationMatch = line.match(TRANSLATION_PATTERN);
  if (!translationMatch) {
    warn(warnings, lineNumber, "malformed-translation", "Malformed translation tag; line was skipped");
    return undefined;
  }

  let text = translationMatch[2] ?? "";
  const voiceMatch = text.match(VOICE_PATTERN);
  if (voiceMatch) {
    warn(warnings, lineNumber, "translation-voice", "Voice tags on translation lines are ignored");
    text = voiceMatch[2] ?? "";
  }

  return {
    lang: translationMatch[1] ?? "",
    text,
    line: lineNumber
  };
}

function parseLyricLineBody(
  timestamp: number,
  body: string,
  line: number,
  warnings: ValidationWarning[]
): XLRCLine {
  let voice: string | null = null;
  let rawText = body;
  const voiceMatch = body.match(VOICE_PATTERN);

  if (voiceMatch) {
    const label = voiceMatch[1] ?? "";
    if (label.trim() === "") {
      warn(warnings, line, "empty-voice", "Empty voice tag was ignored");
    } else {
      voice = label;
    }

    rawText = voiceMatch[2] ?? "";
  }

  const parsedContent = parseLyricContent(rawText, line, warnings);

  return {
    timestamp,
    text: parsedContent.text,
    sourceText: parsedContent.sourceText,
    rawText,
    voice,
    isEmpty: parsedContent.text.length === 0 && parsedContent.words.length === 0,
    words: parsedContent.words,
    furigana: parsedContent.furigana,
    translations: [],
    line
  };
}

function parseLyricContent(rawText: string, line: number, warnings: ValidationWarning[]): ParsedLyricContent {
  warnForMalformedWordTags(rawText, line, warnings);

  const sourceText = rawText.replace(WORD_TIMESTAMP_PATTERN, "");
  const parsedText = parseFuriganaText(sourceText, line, warnings);

  return {
    text: parsedText.text,
    sourceText,
    words: parseWords(rawText, line, warnings),
    furigana: parsedText.furigana
  };
}

function parseWords(rawText: string, line: number, warnings: ValidationWarning[]): XLRCWord[] {
  const matches = Array.from(rawText.matchAll(WORD_TIMESTAMP_PATTERN));
  const words: XLRCWord[] = [];

  matches.forEach((match, index) => {
    const timestamp = readTimestamp(match[1] ?? "");
    if (timestamp.warning) {
      warn(warnings, line, "malformed-word-timestamp", timestamp.warning, match.index);
      return;
    }

    const segmentStart = (match.index ?? 0) + match[0].length;
    const nextMatch = matches[index + 1];
    const segmentEnd = nextMatch?.index ?? rawText.length;
    const sourceText = rawText.slice(segmentStart, segmentEnd);
    const parsedText = parseFuriganaText(sourceText, line, warnings);

    words.push({
      timestamp: timestamp.timestamp,
      text: parsedText.text,
      sourceText,
      furigana: parsedText.furigana,
      line
    });
  });

  return words;
}

function parseFuriganaText(input: string, line: number, warnings: ValidationWarning[]): ParsedFuriganaText {
  let text = "";
  const furigana: XLRCFurigana[] = [];
  const warnedColumns = new Set<number>();

  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];
    if (character !== "[") {
      text += character;
      continue;
    }

    const closeIndex = input.indexOf("]", index + 1);
    if (closeIndex === -1) {
      text += character;
      continue;
    }

    const reading = input.slice(index + 1, closeIndex);
    const previousCharacter = text[text.length - 1];
    const mayBeFurigana =
      Boolean(previousCharacter) && !/\s/.test(previousCharacter ?? "") && previousCharacter !== "]";

    if (mayBeFurigana && isKana(reading)) {
      const start = findFuriganaBaseStart(text);
      if (start === undefined) {
        text += character;
        continue;
      }

      const base = text.slice(start);
      furigana.push({
        start,
        end: text.length,
        base,
        reading,
        line
      });
      index = closeIndex;
      continue;
    }

    if (mayBeFurigana && isKanji(previousCharacter ?? "") && !warnedColumns.has(index)) {
      warnedColumns.add(index);
      warn(warnings, line, "malformed-furigana", "Furigana reading must contain only kana", index + 1);
    }

    text += character;
  }

  return { text, furigana };
}

function warnForMalformedWordTags(rawText: string, line: number, warnings: ValidationWarning[]): void {
  for (const match of rawText.matchAll(ANY_ANGLE_TAG_PATTERN)) {
    const tag = match[0];
    if (!WORD_TIMESTAMP_TAG_PATTERN.test(tag)) {
      warn(warnings, line, "malformed-word-timestamp", "Malformed word timestamp was treated as literal text", match.index);
    }
  }
}

function readTimestamp(value: string): TimestampResult {
  const timestampMatch = value.match(TIMESTAMP_VALUE_PATTERN);
  if (!timestampMatch) {
    return { timestamp: 0, warning: "Timestamp contains non-numeric values" };
  }

  const [minutesValue = "", secondsAndFractionValue = ""] = (timestampMatch[1] ?? "").split(":");
  const [secondsValue = "", fractionValue = ""] = secondsAndFractionValue.split(".");
  const minutes = Number.parseInt(minutesValue, 10);
  const seconds = Number.parseInt(secondsValue, 10);

  if (!Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return { timestamp: 0, warning: "Timestamp contains non-numeric values" };
  }

  if (seconds > 59) {
    return { timestamp: 0, warning: "Timestamp seconds must be less than 60" };
  }

  return {
    timestamp: minutes * 60_000 + seconds * 1_000 + readFractionMilliseconds(fractionValue)
  };
}

function readFractionMilliseconds(value: string): number {
  if (value.length === 0) {
    return 0;
  }

  return Number.parseInt(value.padEnd(3, "0"), 10);
}

function findFuriganaBaseStart(text: string): number | undefined {
  let start = text.length;

  while (start > 0 && isKanji(text[start - 1] ?? "")) {
    start -= 1;
  }

  if (start < text.length) {
    return start;
  }

  return undefined;
}

function isKana(value: string): boolean {
  return KANA_PATTERN.test(value);
}

function isKanji(value: string): boolean {
  return KANJI_PATTERN.test(value);
}

function warn(
  warnings: ValidationWarning[],
  line: number,
  code: string,
  message: string,
  column?: number
): void {
  warnings.push({
    line,
    ...(column === undefined ? {} : { column }),
    code,
    message
  });
}
