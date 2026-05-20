import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseXLRC } from "../src";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

describe("parseXLRC", () => {
  it("parses basic headers, empty lines, lyrics, and translations", () => {
    const file = parseXLRC(fixture("basic.xlrc"));

    expect(file.meta).toMatchObject({
      ti: "Basic Song",
      ar: "Example Artist",
      lang: "en"
    });
    expect(file.lines).toHaveLength(4);
    expect(file.lines[0]).toMatchObject({
      timestamp: 0,
      text: "",
      isEmpty: true
    });
    expect(file.lines[1]).toMatchObject({
      timestamp: 12_400,
      text: "Hello world",
      isEmpty: false
    });
    expect(file.lines[1]?.translations).toEqual([
      { lang: "ja", text: "こんにちは世界", line: 7 }
    ]);
    expect(file.warnings).toEqual([]);
  });

  it("parses word timing, furigana, and multiple translations", () => {
    const file = parseXLRC(fixture("full.xlrc"));
    const timedLine = file.lines[1];
    const furiganaLine = file.lines[2];

    expect(file.meta.langs).toEqual(["ja", "en", "ja-Latn"]);
    expect(file.meta.xlrc).toBe("0.1");
    expect(timedLine?.text).toBe("うっせぇうっせぇうっせぇわ");
    expect(timedLine?.words.map((word) => [word.timestamp, word.text])).toEqual([
      [12_400, "うっせぇ"],
      [12_800, "うっせぇ"],
      [13_100, "うっせぇわ"]
    ]);
    expect(timedLine?.translations.map((translation) => translation.lang)).toEqual(["en", "ja-Latn"]);
    expect(furiganaLine?.text).toBe("私が歌う");
    expect(furiganaLine?.furigana).toEqual([
      { start: 0, end: 1, base: "私", reading: "わたし", line: 13 },
      { start: 2, end: 3, base: "歌", reading: "うた", line: 13 }
    ]);
  });

  it("parses multi-voice lines and inherited translations", () => {
    const file = parseXLRC(fixture("multivoice.xlrc"));

    expect(file.lines.map((line) => line.voice)).toEqual(["A", "B", "AB"]);
    expect(file.lines.map((line) => line.translations[0]?.text)).toEqual(["You are", "I am", "Together"]);
  });

  it("warns and continues on malformed input", () => {
    const file = parseXLRC(fixture("malformed.xlrc"));

    expect(file.lines.map((line) => line.text)).toEqual(["歌[sing]う", "empty voice"]);
    expect(file.warnings.map((warning) => warning.code)).toEqual([
      "malformed-offset",
      "orphan-translation",
      "malformed-timestamp",
      "malformed-furigana",
      "empty-voice",
      "unrecognized-line"
    ]);
  });
});
