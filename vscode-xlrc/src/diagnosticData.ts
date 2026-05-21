import type { XlrcWarning } from "./shared/messages";

export interface DiagnosticRangeData {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
}

export interface DiagnosticData {
  range: DiagnosticRangeData;
  code: string;
  message: string;
}

export function createDiagnosticData(warnings: readonly XlrcWarning[], text: string): DiagnosticData[] {
  const lines = text.split(/\r?\n/);
  return warnings.map((warning) => warningToDiagnosticData(warning, lines));
}

export function warningToDiagnosticData(warning: XlrcWarning, lines: readonly string[]): DiagnosticData {
  const lineCount = Math.max(lines.length, 1);
  const startLine = clamp((warning.line || 1) - 1, 0, lineCount - 1);
  const lineText = lines[startLine] ?? "";
  const rawCharacter = normaliseWarningColumn(warning.column);
  const startCharacter = clamp(rawCharacter, 0, lineText.length);
  const endCharacter = lineText.length > startCharacter ? lineText.length : startCharacter;

  return {
    range: {
      startLine,
      startCharacter,
      endLine: startLine,
      endCharacter
    },
    code: warning.code,
    message: warning.message
  };
}

function normaliseWarningColumn(column: number | undefined): number {
  if (column === undefined || column <= 0) {
    return 0;
  }

  return column - 1;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
