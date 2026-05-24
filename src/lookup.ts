import { parseXLRC } from "./parser";
import type { XLRCFile } from "./types";

export interface LookupOptions {
  artist: string;
  title: string;
  length: number;
  source: string;
  fetch?: FetchLike;
}

export type LookupResult =
  | {
      found: true;
      lyrics: XLRCFile;
      path: string;
    }
  | {
      found: false;
      reason: "artist_not_found" | "track_not_found" | "fetch_error" | "parse_error";
    };

export interface AliasesIndex {
  version: 1;
  aliases: Record<string, string>;
}

export interface ArtistIndex {
  version: 1;
  id: string;
  canonical_name: string;
  tracks: ArtistIndexTrack[];
}

export interface ArtistIndexTrack {
  id: string;
  title: string;
  length: number;
  path: string;
}

export type FetchLike = (input: string) => Promise<FetchResponseLike>;

export interface FetchResponseLike {
  ok: boolean;
  json(): Promise<unknown>;
  text(): Promise<string>;
}

export function normalizeLookupKey(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/\s+/gu, " ").trim();
}

export async function lookup(options: LookupOptions): Promise<LookupResult> {
  const fetcher = resolveFetch(options.fetch);
  const source = normalizeSource(options.source);

  let aliasesIndex: AliasesIndex;
  let artistIndex: ArtistIndex;
  let lyricsText: string;

  try {
    aliasesIndex = await fetchAliasesIndex({ source, fetch: fetcher });
    const artistId = findArtist(aliasesIndex, options.artist);
    if (!artistId) {
      return { found: false, reason: "artist_not_found" };
    }

    artistIndex = await fetchArtistIndex({ source, artistId, fetch: fetcher });
    const track = findTrack(artistIndex, {
      title: options.title,
      length: options.length
    });
    if (!track) {
      return { found: false, reason: "track_not_found" };
    }

    lyricsText = await fetchText(fetcher, joinUrl(source, track.path));

    try {
      return {
        found: true,
        lyrics: parseXLRC(lyricsText),
        path: track.path
      };
    } catch {
      return { found: false, reason: "parse_error" };
    }
  } catch {
    return { found: false, reason: "fetch_error" };
  }
}

export async function fetchAliasesIndex(options: {
  source: string;
  fetch?: FetchLike;
}): Promise<AliasesIndex> {
  return assertAliasesIndex(await fetchJson(resolveFetch(options.fetch), joinUrl(normalizeSource(options.source), "index/aliases.json")));
}

export function findArtist(index: AliasesIndex, artist: string): string | undefined {
  return index.aliases[normalizeLookupKey(artist)];
}

export async function fetchArtistIndex(options: {
  source: string;
  artistId: string;
  fetch?: FetchLike;
}): Promise<ArtistIndex> {
  return assertArtistIndex(
    await fetchJson(
      resolveFetch(options.fetch),
      joinUrl(normalizeSource(options.source), artistIndexPath(options.artistId))
    )
  );
}

export function findTrack(
  index: ArtistIndex,
  query: {
    title: string;
    length: number;
  }
): ArtistIndexTrack | undefined {
  const normalizedTitle = normalizeLookupKey(query.title);
  const candidates = index.tracks.filter((track) => (
    Math.abs(track.length - query.length) <= 2 &&
    normalizeLookupKey(track.title) === normalizedTitle
  ));

  if (candidates.length === 0) {
    return undefined;
  }

  return [...candidates].sort((left, right) => {
    const leftExactTitle = left.title === query.title ? 0 : 1;
    const rightExactTitle = right.title === query.title ? 0 : 1;

    return (
      leftExactTitle - rightExactTitle ||
      Math.abs(left.length - query.length) - Math.abs(right.length - query.length)
    );
  })[0];
}

function artistIndexPath(artistId: string): string {
  const body = artistId.startsWith("art_") ? artistId.slice(4) : artistId;
  return `index/artists/${body.slice(0, 2)}/${body.slice(2, 4)}/${artistId}.json`;
}

async function fetchJson(fetcher: FetchLike, url: string): Promise<unknown> {
  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(`Fetch failed for ${url}`);
  }

  return response.json();
}

async function fetchText(fetcher: FetchLike, url: string): Promise<string> {
  const response = await fetcher(url);
  if (!response.ok) {
    throw new Error(`Fetch failed for ${url}`);
  }

  return response.text();
}

function assertAliasesIndex(value: unknown): AliasesIndex {
  if (!value || typeof value !== "object" || !("aliases" in value) || typeof value.aliases !== "object") {
    throw new Error("Invalid aliases index");
  }

  return value as AliasesIndex;
}

function assertArtistIndex(value: unknown): ArtistIndex {
  if (!value || typeof value !== "object" || !("tracks" in value) || !Array.isArray(value.tracks)) {
    throw new Error("Invalid artist index");
  }

  return value as ArtistIndex;
}

function resolveFetch(fetcher: FetchLike | undefined): FetchLike {
  if (fetcher) {
    return fetcher;
  }

  if (typeof globalThis.fetch !== "function") {
    throw new Error("No fetch implementation available");
  }

  return async (input) => globalThis.fetch(input);
}

function normalizeSource(source: string): string {
  return source.replace(/\/+$/u, "");
}

function joinUrl(source: string, path: string): string {
  return `${source}/${path.replace(/^\/+/u, "")}`;
}
