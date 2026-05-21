const TEXT_DECODER = new TextDecoder("utf-8");

export function extractEmbeddedLyrics(input: ArrayBuffer | Uint8Array): string | null {
  try {
    const u8 = input instanceof Uint8Array ? input : new Uint8Array(input);
    if (u8.length < 12) {
      return null;
    }

    if (byte(u8, 0) === 0x49 && byte(u8, 1) === 0x44 && byte(u8, 2) === 0x33) {
      return id3Lyrics(u8);
    }
    if (byte(u8, 0) === 0x66 && byte(u8, 1) === 0x4c && byte(u8, 2) === 0x61 && byte(u8, 3) === 0x43) {
      return flacLyrics(u8);
    }
    if (byte(u8, 0) === 0x4f && byte(u8, 1) === 0x67 && byte(u8, 2) === 0x67 && byte(u8, 3) === 0x53) {
      return oggLyrics(u8);
    }
    if (byte(u8, 4) === 0x66 && byte(u8, 5) === 0x74 && byte(u8, 6) === 0x79 && byte(u8, 7) === 0x70) {
      return mp4Lyrics(u8);
    }

    return null;
  } catch {
    return null;
  }
}

function byte(u8: Uint8Array, index: number): number {
  return u8[index] ?? 0;
}

function synchsafe(u8: Uint8Array, p: number): number {
  return (byte(u8, p) << 21) | (byte(u8, p + 1) << 14) | (byte(u8, p + 2) << 7) | byte(u8, p + 3);
}

function readU32BE(u8: Uint8Array, p: number): number {
  return byte(u8, p) * 16_777_216 + (byte(u8, p + 1) << 16) + (byte(u8, p + 2) << 8) + byte(u8, p + 3);
}

function readU32LE(u8: Uint8Array, p: number): number {
  return byte(u8, p) + (byte(u8, p + 1) << 8) + (byte(u8, p + 2) << 16) + byte(u8, p + 3) * 16_777_216;
}

function tidy(value: string): string {
  return value.replace(/\r\n?/g, "\n").trim();
}

function decodeByEnc(bytes: Uint8Array, enc: number): string {
  let label = "utf-8";
  if (enc === 0) {
    label = "iso-8859-1";
  } else if (enc === 1) {
    label = byte(bytes, 0) === 0xfe && byte(bytes, 1) === 0xff ? "utf-16be" : "utf-16le";
  } else if (enc === 2) {
    label = "utf-16be";
  }

  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return TEXT_DECODER.decode(bytes);
  }
}

function descAndNext(u8: Uint8Array, p: number, end: number, enc: number): { descBytes: Uint8Array; next: number } {
  const start = p;
  let descEnd: number;

  if (enc === 1 || enc === 2) {
    while (p + 1 < end && !(byte(u8, p) === 0 && byte(u8, p + 1) === 0)) {
      p += 2;
    }
    descEnd = p;
    p += 2;
  } else {
    while (p < end && byte(u8, p) !== 0) {
      p += 1;
    }
    descEnd = p;
    p += 1;
  }

  return { descBytes: u8.subarray(start, descEnd), next: p };
}

function isLyricKey(key: string): boolean {
  const normalized = key.toUpperCase();
  return normalized === "LYRICS" || normalized === "UNSYNCEDLYRICS" || normalized === "LYRICS:LRC";
}

function id3Lyrics(u8: Uint8Array): string | null {
  const major = byte(u8, 3);
  const flags = byte(u8, 5);
  const end = Math.min(u8.length, 10 + synchsafe(u8, 6));
  let pos = 10;

  if (flags & 0x40) {
    const extSize = major === 4 ? synchsafe(u8, pos) : readU32BE(u8, pos);
    pos += major === 4 ? extSize : 4 + extSize;
  }

  let fallback: string | null = null;
  while (pos + 10 <= end) {
    const id = String.fromCharCode(byte(u8, pos), byte(u8, pos + 1), byte(u8, pos + 2), byte(u8, pos + 3));
    if (!/^[A-Z0-9]{4}$/.test(id)) {
      break;
    }

    const fsize = major === 4 ? synchsafe(u8, pos + 4) : readU32BE(u8, pos + 4);
    const fstart = pos + 10;
    const fend = fstart + fsize;
    if (fsize <= 0 || fend > end) {
      break;
    }

    if (id === "USLT") {
      const enc = byte(u8, fstart);
      const { next } = descAndNext(u8, fstart + 4, fend, enc);
      const text = tidy(decodeByEnc(u8.subarray(next, fend), enc));
      if (text) {
        return text;
      }
    } else if (id === "TXXX" && fallback === null) {
      const enc = byte(u8, fstart);
      const { descBytes, next } = descAndNext(u8, fstart + 1, fend, enc);
      if (isLyricKey(decodeByEnc(descBytes, enc))) {
        const value = tidy(decodeByEnc(u8.subarray(next, fend), enc));
        if (value) {
          fallback = value;
        }
      }
    }

    pos = fend;
  }

  return fallback;
}

function parseVorbisComments(u8: Uint8Array, start: number, end: number): string | null {
  let p = start;
  p += 4 + readU32LE(u8, p);
  if (p + 4 > end) {
    return null;
  }

  const count = readU32LE(u8, p);
  p += 4;
  for (let i = 0; i < count && p + 4 <= end; i += 1) {
    const len = readU32LE(u8, p);
    p += 4;
    if (p + len > end) {
      break;
    }

    const entry = TEXT_DECODER.decode(u8.subarray(p, p + len));
    p += len;
    const eq = entry.indexOf("=");
    if (eq > 0 && isLyricKey(entry.slice(0, eq))) {
      const value = tidy(entry.slice(eq + 1));
      if (value) {
        return value;
      }
    }
  }

  return null;
}

function flacLyrics(u8: Uint8Array): string | null {
  let pos = 4;
  while (pos + 4 <= u8.length) {
    const header = byte(u8, pos);
    const type = header & 0x7f;
    const len = (byte(u8, pos + 1) << 16) | (byte(u8, pos + 2) << 8) | byte(u8, pos + 3);
    const start = pos + 4;
    if (type === 4) {
      const result = parseVorbisComments(u8, start, start + len);
      if (result) {
        return result;
      }
    }

    pos = start + len;
    if (header & 0x80) {
      break;
    }
  }

  return null;
}

function oggLyrics(u8: Uint8Array): string | null {
  for (let i = 0; i + 7 < u8.length; i += 1) {
    if (
      byte(u8, i) === 0x03 &&
      byte(u8, i + 1) === 0x76 &&
      byte(u8, i + 2) === 0x6f &&
      byte(u8, i + 3) === 0x72 &&
      byte(u8, i + 4) === 0x62 &&
      byte(u8, i + 5) === 0x69 &&
      byte(u8, i + 6) === 0x73
    ) {
      const result = parseVorbisComments(u8, i + 7, u8.length);
      if (result) {
        return result;
      }
    }
  }

  return null;
}

function mp4Lyrics(u8: Uint8Array): string | null {
  function dataText(start: number, end: number): string | null {
    let p = start;
    while (p + 8 <= end) {
      const size = readU32BE(u8, p);
      const type = String.fromCharCode(byte(u8, p + 4), byte(u8, p + 5), byte(u8, p + 6), byte(u8, p + 7));
      if (size < 8) {
        break;
      }

      if (type === "data") {
        const text = tidy(TEXT_DECODER.decode(u8.subarray(p + 16, Math.min(end, p + size))));
        if (text) {
          return text;
        }
      }
      p += size;
    }

    return null;
  }

  function walk(start: number, end: number): string | null {
    let p = start;
    while (p + 8 <= end) {
      let size = readU32BE(u8, p);
      let header = 8;
      const type = String.fromCharCode(byte(u8, p + 4), byte(u8, p + 5), byte(u8, p + 6), byte(u8, p + 7));
      if (size === 1) {
        size = readU32BE(u8, p + 12);
        header = 16;
      }
      if (size < header) {
        break;
      }

      const childStart = p + header;
      const childEnd = Math.min(end, p + size);
      if (type === "\u00a9lyr") {
        const result = dataText(childStart, childEnd);
        if (result) {
          return result;
        }
      } else if (type === "meta") {
        const result = walk(childStart + 4, childEnd);
        if (result) {
          return result;
        }
      } else if (type === "moov" || type === "udta" || type === "ilst") {
        const result = walk(childStart, childEnd);
        if (result) {
          return result;
        }
      }

      p += size;
    }

    return null;
  }

  return walk(0, u8.length);
}
