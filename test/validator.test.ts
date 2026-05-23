import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseXLRC, validateXLRC } from "../src";
import type { XLRCFile } from "../src";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

describe("validateXLRC", () => {
  it("accepts valid parsed fixtures", () => {
    const file = parseXLRC(fixture("full.xlrc"));
    const result = validateXLRC(file);

    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("accepts files without length metadata", () => {
    const result = validateXLRC(parseXLRC("[ti:No Length]\n[00:00.00]x\n"));

    expect(result.valid).toBe(true);
    expect(result.warnings).toEqual([]);
  });

  it("warns on malformed length metadata", () => {
    const result = validateXLRC(parseXLRC("[length:03:99]\n[00:00.00]x\n"));

    expect(result.valid).toBe(false);
    expect(result.warnings.map((warning) => warning.code)).toEqual(["invalid-length"]);
  });

  it("warns on invalid structured data", () => {
    const file: XLRCFile = {
      meta: {
        length: "3:99",
        offset: 1.5,
        lang: "",
        langs: ["ja", ""]
      },
      lines: [
        {
          timestamp: -1,
          text: "私",
          voice: "",
          isEmpty: false,
          words: [
            {
              timestamp: Number.NaN,
              text: "歌",
              furigana: [
                { start: 0, end: 1, base: "違", reading: "song" }
              ]
            }
          ],
          furigana: [
            { start: 0, end: 5, base: "私", reading: "watashi" }
          ],
          translations: [
            { lang: "", text: "bad" }
          ]
        }
      ],
      warnings: []
    };

    const result = validateXLRC(file);

    expect(result.valid).toBe(false);
    expect(result.warnings.map((warning) => warning.code)).toEqual([
      "invalid-offset",
      "invalid-length",
      "invalid-lang",
      "invalid-langs",
      "invalid-line-timestamp",
      "invalid-voice",
      "invalid-furigana-range",
      "invalid-word-timestamp",
      "invalid-furigana-base",
      "invalid-furigana-reading",
      "invalid-translation-lang"
    ]);
  });

  it("does not throw when validating malformed JavaScript input", () => {
    const file = {
      meta: {},
      lines: [
        {
          timestamp: 0,
          text: 1,
          isEmpty: false,
          words: [
            null
          ],
          furigana: [
            { start: 0, end: 1, base: "x", reading: "あ" }
          ],
          translations: []
        }
      ],
      warnings: []
    } as unknown as XLRCFile;

    expect(() => validateXLRC(file)).not.toThrow();
    expect(validateXLRC(file).warnings.map((warning) => warning.code)).toEqual([
      "invalid-line-text",
      "invalid-furigana-range",
      "invalid-word"
    ]);
  });
});
