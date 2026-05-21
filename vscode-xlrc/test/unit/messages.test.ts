import { describe, expect, it } from "vitest";
import { isWebviewToHostMessage } from "../../src/shared/messages";

describe("webview messages", () => {
  it("accepts known message shapes", () => {
    expect(isWebviewToHostMessage({ type: "ready" })).toBe(true);
    expect(isWebviewToHostMessage({ type: "edit", text: "[00:00.00]hello" })).toBe(true);
    expect(isWebviewToHostMessage({ type: "replaceText", text: "[00:01.00]world" })).toBe(true);
    expect(isWebviewToHostMessage({ type: "save", text: "[00:02.00]save" })).toBe(true);
    expect(isWebviewToHostMessage({ type: "loadAudio" })).toBe(true);
  });

  it("rejects malformed message shapes", () => {
    expect(isWebviewToHostMessage(null)).toBe(false);
    expect(isWebviewToHostMessage({ type: "edit" })).toBe(false);
    expect(isWebviewToHostMessage({ type: "unknown", text: "" })).toBe(false);
  });
});
