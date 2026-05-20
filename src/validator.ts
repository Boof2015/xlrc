import type {
  ValidationResult,
  ValidationWarning,
  XLRCFile,
  XLRCFurigana,
  XLRCLine,
  XLRCMetaValue,
  XLRCWord
} from "./types";

const LANGUAGE_TAG_PATTERN = /^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/;
const KANA_PATTERN = /^[\u3040-\u309f\u30a0-\u30ff\u31f0-\u31ff\uff66-\uff9f]+$/u;

export function validateXLRC(file: XLRCFile): ValidationResult {
  const warnings: ValidationWarning[] = [];

  validateMeta(file, warnings);

  if (!Array.isArray(file.lines)) {
    warn(warnings, 0, "invalid-lines", "XLRC file lines must be an array");
    return { valid: false, warnings };
  }

  file.lines.forEach((line, index) => validateLine(line, index, warnings));

  return {
    valid: warnings.length === 0,
    warnings
  };
}

function validateMeta(file: XLRCFile, warnings: ValidationWarning[]): void {
  if (!file.meta || typeof file.meta !== "object") {
    warn(warnings, 0, "invalid-meta", "XLRC file meta must be an object");
    return;
  }

  if (file.meta.offset !== undefined && !Number.isInteger(file.meta.offset)) {
    warn(warnings, 0, "invalid-offset", "Meta offset must be an integer number of milliseconds");
  }

  if (file.meta.lang !== undefined && !isLanguageTag(file.meta.lang)) {
    warn(warnings, 0, "invalid-lang", "Meta lang must be a non-empty BCP 47-style language tag");
  }

  if (file.meta.langs !== undefined) {
    if (!Array.isArray(file.meta.langs)) {
      warn(warnings, 0, "invalid-langs", "Meta langs must be an array of language tags");
    } else {
      file.meta.langs.forEach((lang) => {
        if (!isLanguageTag(lang)) {
          warn(warnings, 0, "invalid-langs", "Meta langs contains an invalid language tag");
        }
      });
    }
  }

  for (const [key, value] of Object.entries(file.meta)) {
    if (!isSerializableMetaValue(value)) {
      warn(warnings, 0, "invalid-meta-value", `Meta value for "${key}" must be a string, number, or string array`);
    }
  }
}

function validateLine(line: XLRCLine, index: number, warnings: ValidationWarning[]): void {
  const warningLine = line.line ?? index + 1;

  if (!isValidTimestamp(line.timestamp)) {
    warn(warnings, warningLine, "invalid-line-timestamp", "Line timestamp must be a non-negative finite integer");
  }

  if (typeof line.text !== "string") {
    warn(warnings, warningLine, "invalid-line-text", "Line text must be a string");
  }

  if (line.sourceText !== undefined && typeof line.sourceText !== "string") {
    warn(warnings, warningLine, "invalid-source-text", "Line sourceText must be a string when present");
  }

  if (line.rawText !== undefined && typeof line.rawText !== "string") {
    warn(warnings, warningLine, "invalid-raw-text", "Line rawText must be a string when present");
  }

  if (line.voice !== undefined && line.voice !== null && (typeof line.voice !== "string" || line.voice.length === 0)) {
    warn(warnings, warningLine, "invalid-voice", "Line voice must be a non-empty string, null, or undefined");
  }

  if (typeof line.isEmpty !== "boolean") {
    warn(warnings, warningLine, "invalid-empty-flag", "Line isEmpty must be a boolean");
  }

  validateFurigana(line.furigana, line.text, warningLine, warnings);

  if (!Array.isArray(line.words)) {
    warn(warnings, warningLine, "invalid-words", "Line words must be an array");
  } else {
    line.words.forEach((word) => validateWord(word, warningLine, warnings));
  }

  if (!Array.isArray(line.translations)) {
    warn(warnings, warningLine, "invalid-translations", "Line translations must be an array");
  } else {
    line.translations.forEach((translation) => {
      if (!isLanguageTag(translation.lang)) {
        warn(warnings, translation.line ?? warningLine, "invalid-translation-lang", "Translation language must be a non-empty BCP 47-style tag");
      }

      if (typeof translation.text !== "string") {
        warn(warnings, translation.line ?? warningLine, "invalid-translation-text", "Translation text must be a string");
      }
    });
  }
}

function validateWord(word: XLRCWord, parentLine: number, warnings: ValidationWarning[]): void {
  const warningLine = word.line ?? parentLine;

  if (!isValidTimestamp(word.timestamp)) {
    warn(warnings, warningLine, "invalid-word-timestamp", "Word timestamp must be a non-negative finite integer");
  }

  if (typeof word.text !== "string") {
    warn(warnings, warningLine, "invalid-word-text", "Word text must be a string");
  }

  if (word.sourceText !== undefined && typeof word.sourceText !== "string") {
    warn(warnings, warningLine, "invalid-word-source-text", "Word sourceText must be a string when present");
  }

  validateFurigana(word.furigana, word.text, warningLine, warnings);
}

function validateFurigana(
  furigana: XLRCFurigana[],
  text: string,
  line: number,
  warnings: ValidationWarning[]
): void {
  if (!Array.isArray(furigana)) {
    warn(warnings, line, "invalid-furigana", "Furigana must be an array");
    return;
  }

  furigana.forEach((entry) => {
    if (!Number.isInteger(entry.start) || !Number.isInteger(entry.end) || entry.start < 0 || entry.end <= entry.start) {
      warn(warnings, entry.line ?? line, "invalid-furigana-range", "Furigana range must be a valid start/end pair");
      return;
    }

    if (entry.end > text.length) {
      warn(warnings, entry.line ?? line, "invalid-furigana-range", "Furigana range exceeds the display text length");
      return;
    }

    if (text.slice(entry.start, entry.end) !== entry.base) {
      warn(warnings, entry.line ?? line, "invalid-furigana-base", "Furigana base must match the referenced display text range");
    }

    if (!KANA_PATTERN.test(entry.reading)) {
      warn(warnings, entry.line ?? line, "invalid-furigana-reading", "Furigana reading must contain only kana");
    }
  });
}

function isValidTimestamp(value: number): boolean {
  return Number.isInteger(value) && Number.isFinite(value) && value >= 0;
}

function isLanguageTag(value: unknown): value is string {
  return typeof value === "string" && LANGUAGE_TAG_PATTERN.test(value);
}

function isSerializableMetaValue(value: XLRCMetaValue): boolean {
  return (
    value === undefined ||
    typeof value === "string" ||
    typeof value === "number" ||
    (Array.isArray(value) && value.every((item) => typeof item === "string"))
  );
}

function warn(warnings: ValidationWarning[], line: number, code: string, message: string): void {
  warnings.push({ line, code, message });
}
