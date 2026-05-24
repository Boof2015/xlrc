import { describe, expect, it } from "vitest";
import {
  fetchAliasesIndex,
  fetchArtistIndex,
  findArtist,
  findTrack,
  lookup,
  normalizeLookupKey
} from "../src";
import type { FetchLike } from "../src";

const source = "https://example.test/xlrcdb";
const aliasesPath = `${source}/index/aliases.json`;
const artistPath = `${source}/index/artists/5k/3n/art_5k3n9p2xq7.json`;
const trackPath = `${source}/tracks/a1/b2/trk_a1b2c3d4e5.xlrc`;

describe("lookup helpers", () => {
  it("normalizes lookup keys using xlrcdb rules", () => {
    expect(normalizeLookupKey("  HOSHIMACHI\u3000SUISEI  ")).toBe("hoshimachi suisei");
  });

  it("fetches aliases and artist indexes from a source URL", async () => {
    const fetcher = memoryFetch({
      [aliasesPath]: {
        version: 1,
        aliases: {
          "example artist": "art_5k3n9p2xq7"
        }
      },
      [artistPath]: {
        version: 1,
        id: "art_5k3n9p2xq7",
        canonical_name: "Example Artist",
        tracks: []
      }
    });

    await expect(fetchAliasesIndex({ source: `${source}/`, fetch: fetcher })).resolves.toMatchObject({
      aliases: {
        "example artist": "art_5k3n9p2xq7"
      }
    });
    await expect(fetchArtistIndex({ source, artistId: "art_5k3n9p2xq7", fetch: fetcher })).resolves.toMatchObject({
      id: "art_5k3n9p2xq7"
    });
  });

  it("finds artists by normalized alias", () => {
    expect(findArtist({
      version: 1,
      aliases: {
        "example artist": "art_5k3n9p2xq7"
      }
    }, " Example   Artist ")).toBe("art_5k3n9p2xq7");
  });

  it("finds tracks by normalized title and length tolerance", () => {
    const track = findTrack({
      version: 1,
      id: "art_5k3n9p2xq7",
      canonical_name: "Example Artist",
      tracks: [
        {
          id: "trk_a1b2c3d4e5",
          title: "Example Track",
          length: 222,
          path: "tracks/a1/b2/trk_a1b2c3d4e5.xlrc"
        }
      ]
    }, {
      title: " example   track ",
      length: 224
    });

    expect(track?.id).toBe("trk_a1b2c3d4e5");
  });

  it("prefers exact raw title, then smallest length difference", () => {
    const track = findTrack({
      version: 1,
      id: "art_5k3n9p2xq7",
      canonical_name: "Example Artist",
      tracks: [
        {
          id: "trk_normalized",
          title: " example   track ",
          length: 222,
          path: "tracks/aa/bb/trk_normalized.xlrc"
        },
        {
          id: "trk_exact",
          title: "Example Track",
          length: 224,
          path: "tracks/cc/dd/trk_exact.xlrc"
        },
        {
          id: "trk_closer",
          title: "Example Track",
          length: 223,
          path: "tracks/ee/ff/trk_closer.xlrc"
        }
      ]
    }, {
      title: "Example Track",
      length: 222
    });

    expect(track?.id).toBe("trk_closer");
  });
});

describe("lookup", () => {
  it("fetches and parses matching lyrics", async () => {
    const result = await lookup({
      artist: "Example Artist",
      title: "Example Track",
      length: 10,
      source,
      fetch: memoryFetch(defaultFiles())
    });

    expect(result).toMatchObject({
      found: true,
      path: "tracks/a1/b2/trk_a1b2c3d4e5.xlrc"
    });
    expect(result.found && result.lyrics.meta).toMatchObject({
      ar: "Example Artist",
      ti: "Example Track"
    });
  });

  it("returns artist_not_found when the alias is absent", async () => {
    await expect(lookup({
      artist: "Missing Artist",
      title: "Example Track",
      length: 10,
      source,
      fetch: memoryFetch(defaultFiles())
    })).resolves.toEqual({
      found: false,
      reason: "artist_not_found"
    });
  });

  it("returns track_not_found when no track matches title and length", async () => {
    await expect(lookup({
      artist: "Example Artist",
      title: "Other Track",
      length: 10,
      source,
      fetch: memoryFetch(defaultFiles())
    })).resolves.toEqual({
      found: false,
      reason: "track_not_found"
    });
  });

  it("returns fetch_error when a needed file cannot be fetched", async () => {
    await expect(lookup({
      artist: "Example Artist",
      title: "Example Track",
      length: 10,
      source,
      fetch: memoryFetch({
        [aliasesPath]: defaultFiles()[aliasesPath]
      })
    })).resolves.toEqual({
      found: false,
      reason: "fetch_error"
    });
  });
});

function defaultFiles(): Record<string, unknown> {
  return {
    [aliasesPath]: {
      version: 1,
      aliases: {
        "example artist": "art_5k3n9p2xq7"
      }
    },
    [artistPath]: {
      version: 1,
      id: "art_5k3n9p2xq7",
      canonical_name: "Example Artist",
      tracks: [
        {
          id: "trk_a1b2c3d4e5",
          title: "Example Track",
          length: 10,
          path: "tracks/a1/b2/trk_a1b2c3d4e5.xlrc"
        }
      ]
    },
    [trackPath]: [
      "[ti:Example Track]",
      "[ar:Example Artist]",
      "[length:00:10]",
      "",
      "[00:00.00]Example lyric",
      ""
    ].join("\n")
  };
}

function memoryFetch(files: Record<string, unknown>): FetchLike {
  return async (input) => {
    if (!(input in files)) {
      return response(undefined, false);
    }

    return response(files[input], true);
  };
}

function response(body: unknown, ok: boolean) {
  return {
    ok,
    async json() {
      return body;
    },
    async text() {
      return String(body);
    }
  };
}
