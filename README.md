# XLRC

Parser, serializer, and validator for the XLRC lyric format, with backwards-compatible parsing for standard LRC files.

XLRC extends LRC with inline translations, furigana, word-level timing, and multi-voice attribution while staying plain-text and friendly to existing LRC tooling. `parseXLRC()` also accepts common LRC input, so music players can use this package for both XLRC and standard synced LRC without maintaining a second parser.

## Install

```sh
npm install @boof2015/xlrc
```

## Usage

```ts
import { lookup, parseXLRC, serializeXLRC, validateXLRC } from "@boof2015/xlrc";

const source = `[ti:Example]
[lang:ja]

[00:12.40]私[わたし]が歌[うた]う
[>en]I sing
`;

const file = parseXLRC(source);

console.log(file.lines[0]?.text);
// "私が歌う"

console.log(file.lines[0]?.furigana);
// [{ start: 0, end: 1, base: "私", reading: "わたし", line: 4 }, ...]

const result = validateXLRC(file);
console.log(result.valid);
// true

const xlrc = serializeXLRC(file);
```

Look up lyrics from an xlrcdb-compatible static data source:

```ts
const lookupResult = await lookup({
  artist: "Example Artist",
  title: "Example Track",
  length: 222,
  source: "https://example.com/xlrcdb"
});

if (lookupResult.found) {
  console.log(lookupResult.lyrics.lines);
}
```

## LRC Compatibility

`parseXLRC()` supports standard LRC metadata and timed lyric lines alongside XLRC features. It accepts common synced LRC timestamp forms:

- `[mm:ss]`
- `[mm:ss.x]`
- `[mm:ss.xx]`
- `[mm:ss.xxx]`
- repeated line timestamps, e.g. `[00:10.00][00:20.00]Same lyric`
- matching enhanced LRC word timestamps, e.g. `<00:10>word` and `<00:10.405>word`

Repeated line timestamps expand into multiple parsed lyric lines with the same lyric body. Parsed timestamps are normalized to integer milliseconds.

`serializeXLRC()` still emits canonical XLRC text. It does not preserve the original spelling of LRC timestamp variants or repeated timestamp source layout.

## API

### `parseXLRC(input: string): XLRCFile`

Parses an XLRC or common LRC string into structured metadata, lyric lines, translations, word timings, furigana, and parser warnings. Malformed input is non-fatal; warnings are returned on `file.warnings`.

For each parsed lyric line:

- `text` is the clean display text with word timing and furigana markup removed.
- `sourceText` is the lyric text after word timing tags are removed, with furigana markup preserved.
- `rawText` is the original lyric body after the line timestamp and optional voice tag.
- `voice` is a string label or `null` when the line is unattributed.

Furigana entries refer to contiguous kanji spans in `text`. Kana around the span is left as normal display text, so `食[た]べる` renders ruby over `食` and leaves `べる` untouched.

### `serializeXLRC(file: XLRCFile): string`

Serializes a structured XLRC object to canonical XLRC text.

### `validateXLRC(file: XLRCFile): ValidationResult`

Validates structured XLRC data and returns warnings for invalid metadata, timestamps, translations, furigana, and word timing data.

### `lookup(options: LookupOptions): Promise<LookupResult>`

Looks up and parses lyrics from an xlrcdb-compatible static deployment. The client fetches `index/aliases.json`, the matched per-artist index, then the matched `.xlrc` file.

Track matching uses normalized artist/title strings and a ±2 second duration tolerance. Pass `fetch` in `LookupOptions` to inject a custom fetch implementation for tests or non-browser runtimes.

Lower-level helpers are also exported: `normalizeLookupKey()`, `fetchAliasesIndex()`, `findArtist()`, `fetchArtistIndex()`, and `findTrack()`.

## Development

```sh
npm install
npm run typecheck
npm test
npm run build
```

The package publishes built files from `dist/` and generated TypeScript declarations. Runtime source is browser-compatible and has no runtime dependencies.

## Publishing

```sh
npm version patch
npm publish --access public
```

`prepublishOnly` runs typechecking, tests, and the production build before npm publishes the package.
