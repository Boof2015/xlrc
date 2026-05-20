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

  it("warns on invalid structured data", () => {
    const file: XLRCFile = {
      meta: {
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
});
