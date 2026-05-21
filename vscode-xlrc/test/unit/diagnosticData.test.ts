import { describe, expect, it } from "vitest";
import { createDiagnosticData, warningToDiagnosticData } from "../../src/diagnosticData";

describe("diagnostic data", () => {
  it("maps XLRC warnings to zero-based ranges", () => {
    const diagnostic = warningToDiagnosticData(
      { line: 2, column: 4, code: "malformed-furigana", message: "Bad furigana" },
      ["[ti:Example]", "[00:01.00]歌[sing]う"]
    );

    expect(diagnostic).toEqual({
      range: {
        startLine: 1,
        startCharacter: 3,
        endLine: 1,
        endCharacter: 18
      },
      code: "malformed-furigana",
      message: "Bad furigana"
    });
  });

  it("clamps invalid warning lines to the document", () => {
    const diagnostics = createDiagnosticData(
      [{ line: 99, code: "unrecognized-line", message: "Skipped" }],
      "[00:00.00]hello"
    );

    expect(diagnostics[0]?.range).toEqual({
      startLine: 0,
      startCharacter: 0,
      endLine: 0,
      endCharacter: 15
    });
  });
});
