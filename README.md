# XLRC

Parser, serializer, and validator for the XLRC lyric format.

XLRC extends LRC with inline translations, furigana, word-level timing, and multi-voice attribution while staying plain-text and friendly to existing LRC tooling.

## Install

```sh
npm install @boof2015/xlrc
```

## Usage

```ts
import { parseXLRC, serializeXLRC, validateXLRC } from "@boof2015/xlrc";

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

## API

### `parseXLRC(input: string): XLRCFile`

Parses an XLRC string into structured metadata, lyric lines, translations, word timings, furigana, and parser warnings. Malformed input is non-fatal; warnings are returned on `file.warnings`.

### `serializeXLRC(file: XLRCFile): string`

Serializes a structured XLRC object to canonical XLRC text.

### `validateXLRC(file: XLRCFile): ValidationResult`

Validates structured XLRC data and returns warnings for invalid metadata, timestamps, translations, furigana, and word timing data.

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
