import { describe, expect, it } from "vitest";
import { extractEmbeddedLyrics } from "../../src/shared/embeddedLyrics";

describe("extractEmbeddedLyrics", () => {
  it("extracts unsynchronized lyrics from an ID3 USLT frame", () => {
    const bytes = makeId3Uslt("hello\nworld");

    expect(extractEmbeddedLyrics(bytes)).toBe("hello\nworld");
  });

  it("returns null for files without supported lyric metadata", () => {
    expect(extractEmbeddedLyrics(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]))).toBeNull();
  });
});

function makeId3Uslt(text: string): Uint8Array {
  const encoder = new TextEncoder();
  const lyricBytes = encoder.encode(text);
  const payload = new Uint8Array(1 + 3 + 1 + lyricBytes.length);
  payload[0] = 3;
  payload.set(encoder.encode("eng"), 1);
  payload[4] = 0;
  payload.set(lyricBytes, 5);

  const frame = new Uint8Array(10 + payload.length);
  frame.set(encoder.encode("USLT"), 0);
  frame.set(u32be(payload.length), 4);
  frame.set(payload, 10);

  const tag = new Uint8Array(10 + frame.length);
  tag.set(encoder.encode("ID3"), 0);
  tag[3] = 3;
  tag[4] = 0;
  tag[5] = 0;
  tag.set(synchsafe(frame.length), 6);
  tag.set(frame, 10);
  return tag;
}

function u32be(value: number): Uint8Array {
  return new Uint8Array([(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff]);
}

function synchsafe(value: number): Uint8Array {
  return new Uint8Array([(value >>> 21) & 0x7f, (value >>> 14) & 0x7f, (value >>> 7) & 0x7f, value & 0x7f]);
}
