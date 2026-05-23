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

  it("parses common LRC line timestamp variants", () => {
    const file = parseXLRC(
      [
        "[00:10]No fraction",
        "[00:10.4]Tenths",
        "[00:10.40]Centiseconds",
        "[00:10.405]Milliseconds",
        ""
      ].join("\n")
    );

    expect(file.lines.map((line) => [line.timestamp, line.text])).toEqual([
      [10_000, "No fraction"],
      [10_400, "Tenths"],
      [10_400, "Centiseconds"],
      [10_405, "Milliseconds"]
    ]);
    expect(file.warnings).toEqual([]);
  });

  it("expands repeated LRC line timestamps into separate lyric lines", () => {
    const file = parseXLRC("[00:10.00][00:20.00]Same lyric\n");

    expect(file.lines.map((line) => [line.timestamp, line.text, line.rawText, line.line])).toEqual([
      [10_000, "Same lyric", "Same lyric", 1],
      [20_000, "Same lyric", "Same lyric", 1]
    ]);
    expect(file.warnings).toEqual([]);
  });

  it("keeps XLRC body features when expanding repeated LRC timestamps", () => {
    const file = parseXLRC("[00:10][00:20.500][v:A]私[わたし]が歌[うた]う\n[>en]I sing\n");

    expect(file.lines.map((line) => [line.timestamp, line.voice, line.text])).toEqual([
      [10_000, "A", "私が歌う"],
      [20_500, "A", "私が歌う"]
    ]);
    expect(file.lines[0]?.furigana).toEqual([
      { start: 0, end: 1, base: "私", reading: "わたし", line: 1 },
      { start: 2, end: 3, base: "歌", reading: "うた", line: 1 }
    ]);
    expect(file.lines.map((line) => line.translations)).toEqual([
      [{ lang: "en", text: "I sing", line: 2 }],
      [{ lang: "en", text: "I sing", line: 2 }]
    ]);
    expect(file.warnings).toEqual([]);
  });

  it("warns once for repeated LRC timestamp body problems", () => {
    const file = parseXLRC("[00:10][00:20]歌[sing]う\n");

    expect(file.lines.map((line) => line.text)).toEqual(["歌[sing]う", "歌[sing]う"]);
    expect(file.warnings.map((warning) => warning.code)).toEqual(["malformed-furigana"]);
  });

  it("parses common LRC enhanced word timestamp variants", () => {
    const file = parseXLRC("[00:00]<00:00>zero<00:00.4>one<00:00.40>two<00:00.405>three\n");

    expect(file.lines[0]).toMatchObject({
      timestamp: 0,
      text: "zeroonetwothree",
      sourceText: "zeroonetwothree"
    });
    expect(file.lines[0]?.words.map((word) => [word.timestamp, word.text])).toEqual([
      [0, "zero"],
      [400, "one"],
      [400, "two"],
      [405, "three"]
    ]);
    expect(file.warnings).toEqual([]);
  });

  it("parses adjacent furigana annotations without overlapping ranges", () => {
    const file = parseXLRC("[00:00.00]たった今[いま]発散[はっさん]して\n");

    expect(file.lines[0]).toMatchObject({
      text: "たった今発散して",
      furigana: [
        { start: 3, end: 4, base: "今", reading: "いま", line: 1 },
        { start: 4, end: 6, base: "発散", reading: "はっさん", line: 1 }
      ]
    });
    expect(file.lines[0]?.furigana[1]?.start).toBeGreaterThanOrEqual(file.lines[0]?.furigana[0]?.end ?? 0);
    expect(file.warnings).toEqual([]);
  });

  it("parses adjacent furigana annotations inside word-timed segments", () => {
    const file = parseXLRC("[00:00.00]<00:00.00>たった今[いま]発散[はっさん]して\n");

    expect(file.lines[0]?.words[0]).toMatchObject({
      text: "たった今発散して",
      furigana: [
        { start: 3, end: 4, base: "今", reading: "いま", line: 1 },
        { start: 4, end: 6, base: "発散", reading: "はっさん", line: 1 }
      ]
    });
    expect(file.warnings).toEqual([]);
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

  it("requires furigana annotations to attach directly to kanji", () => {
    const file = parseXLRC("[00:00.00]abc[かな]\n[00:01.00]私[わたし]\n");

    expect(file.lines[0]).toMatchObject({
      text: "abc[かな]",
      furigana: []
    });
    expect(file.lines[1]).toMatchObject({
      text: "私",
      furigana: [
        { start: 0, end: 1, base: "私", reading: "わたし", line: 2 }
      ]
    });
    expect(file.warnings).toEqual([]);
  });

  it("warns on mixed kanji-kana furigana bases", () => {
    const file = parseXLRC("[00:00.00]無い[ない]\n[00:01.00]abc[かな]\n");

    expect(file.lines[0]).toMatchObject({
      text: "無い[ない]",
      furigana: []
    });
    expect(file.lines[1]).toMatchObject({
      text: "abc[かな]",
      furigana: []
    });
    expect(file.warnings.map((warning) => [warning.line, warning.code])).toEqual([[1, "malformed-furigana"]]);
  });

  it("warns on partially numeric offsets", () => {
    const file = parseXLRC("[offset:12abc]\n[00:00.00]x\n");

    expect(file.meta.offset).toBeUndefined();
    expect(file.warnings.map((warning) => warning.code)).toEqual(["malformed-offset"]);
  });

  it("keeps existing XLRC fixtures warning-free", () => {
    for (const name of ["basic.xlrc", "full.xlrc", "multivoice.xlrc"]) {
      expect(parseXLRC(fixture(name)).warnings, name).toEqual([]);
    }
  });
});
