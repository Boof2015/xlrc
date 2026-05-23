export type XLRCMetaValue = string | number | string[] | undefined;

export interface XLRCMeta {
  ti?: string;
  ar?: string;
  al?: string;
  length?: string;
  by?: string;
  offset?: number;
  lang?: string;
  langs?: string[];
  xlrc?: string;
  [key: string]: XLRCMetaValue;
}

export interface XLRCFile {
  meta: XLRCMeta;
  lines: XLRCLine[];
  warnings: ValidationWarning[];
}

export interface XLRCLine {
  timestamp: number;
  text: string;
  sourceText?: string;
  rawText?: string;
  voice: string | null;
  isEmpty: boolean;
  words: XLRCWord[];
  furigana: XLRCFurigana[];
  translations: XLRCTranslation[];
  line?: number;
}

export interface XLRCWord {
  timestamp: number;
  text: string;
  sourceText?: string;
  furigana: XLRCFurigana[];
  line?: number;
}

export interface XLRCFurigana {
  start: number;
  end: number;
  base: string;
  reading: string;
  line?: number;
}

export interface XLRCTranslation {
  lang: string;
  text: string;
  line?: number;
}

export interface ValidationWarning {
  line: number;
  column?: number;
  code: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  warnings: ValidationWarning[];
}
