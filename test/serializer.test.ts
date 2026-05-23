import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseXLRC, serializeXLRC } from "../src";
import type { XLRCFile } from "../src";

const fixture = (name: string) => readFileSync(join(__dirname, "fixtures", name), "utf8");

describe("serializeXLRC", () => {
  it("serializes parsed fixtures in canonical form", () => {
    const file = parseXLRC(fixture("full.xlrc"));

    expect(serializeXLRC(file)).toBe(fixture("full.xlrc"));
  });

  it("round-trips parse -> serialize -> parse", () => {
    const first = parseXLRC(fixture("multivoice.xlrc"));
    const serialized = serializeXLRC(first);
    const second = parseXLRC(serialized);

    expect(second).toEqual(first);
  });

  it("serializes hand-built structured data", () => {
    const file: XLRCFile = {
      meta: {
        ti: "Manual",
        al: "Manual Album",
        length: "03:42",
        lang: "ja",
        langs: ["ja", "en"]
      },
      lines: [
        {
          timestamp: 12_400,
          text: "私が歌う",
          voice: "A",
          isEmpty: false,
          words: [],
          furigana: [
            { start: 0, end: 1, base: "私", reading: "わたし" },
            { start: 2, end: 3, base: "歌", reading: "うた" }
          ],
          translations: [
            { lang: "en", text: "I sing" }
          ]
        }
      ],
      warnings: []
    };

    expect(serializeXLRC(file)).toBe(
      [
        "[ti:Manual]",
        "[al:Manual Album]",
        "[length:03:42]",
        "[lang:ja]",
        "[langs:ja,en]",
        "",
        "[00:12.40][v:A]私[わたし]が歌[うた]う",
        "[>en]I sing",
        ""
      ].join("\n")
    );
  });
});
