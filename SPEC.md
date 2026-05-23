# XLRC Format Specification
**Version:** 0.1-draft  
**Status:** Draft  

---

## Overview

XLRC is a plain-text lyric format extending LRC with support for inline translations, furigana (ruby text), word-level timing, and multi-voice attribution. It is designed to be human-readable and writable, fully backwards-compatible with standard LRC parsers for the base layer, and single-file per track.

---

## File Extension

`.xlrc`

---

## Encoding

UTF-8. Required.

---

## Header Tags

Standard LRC header tags are supported and carry the same meaning. XLRC defines these optional metadata tags:

```
[ti:Title]
[ar:Artist]
[al:Album]
[length:03:42]
[by:Contributor]
[offset:+/- ms]
[lang:ja]
[langs:ja,en,ja-Latn]
```

| Tag | Description |
|-----|-------------|
| `length` | Track duration in `mm:ss` format; informational only |
| `lang` | Primary language of the lyrics (BCP 47 code) |
| `langs` | Comma-separated list of all languages present in the file, including translations |

---

## Lyric Lines

### Basic Line (LRC compatible)

```
[mm:ss.xx]Lyric text here
```

Timestamps use standard LRC format: `[mm:ss.xx]` where `xx` is centiseconds.

---

### Instrumental / Empty Lines

Lines with no lyric text use an empty timestamp, identical to standard LRC:

```
[00:08.00]
```

Parsers treat these as intentional gaps (intros, instrumentals, breaks). They are not errors.

---

### End Timestamp

An optional end marker may appear after the last lyric line to indicate when the final line should be cleared from display:

```
[03:31.20]最後の言葉
[03:35.00]
```

The trailing empty line is the end timestamp. Parsers that do not support it ignore it as an empty line.

---

### Word-Level Timing

Inline word timestamps within a line, borrowed from Enhanced LRC:

```
[00:12.40]<00:12.40>word1<00:12.90>word2<00:13.20>word3
```

- The line timestamp `[00:12.40]` marks line start and is required even when word timing is present.
- `<mm:ss.xx>` tags prefix each word or syllable.
- Word-timed and non-word-timed lines may be mixed freely in the same file.

---

### Furigana (Ruby Text)

Inline readings for kanji, written immediately after the target text in square brackets:

```
[00:12.40]私[わたし]が歌[うた]う
```

- Format: `kanji[reading]`
- Readings are hiragana or katakana.
- Applies to the immediately preceding contiguous kanji span.
- Multiple annotations on a single line are supported.
- Kana characters do not require annotation because their reading is already explicit.

Annotate only the kanji portion of mixed kanji/kana words:

```
[00:12.40]食[た]べる     ← correct: reading is placed above 食 only
[00:12.40]食べる[たべる] ← incorrect: mixed kanji/kana base is ambiguous
```

Renderers place the reading above the kanji span only; surrounding kana is left untouched.

**Disambiguation:** A furigana bracket is distinguished from a timestamp or header tag by context — it follows a non-whitespace, non-`]` character and its contents consist entirely of kana. Example of ambiguity resolved:

```
[00:12.40]     ← timestamp: starts at column 0, numeric content
私[わたし]     ← furigana: follows kanji, kana content
[ti:Title]     ← header tag: starts at column 0, ascii content
```

**Combined with word timing:**

```
[00:12.40]<00:12.40>私[わたし]<00:12.90>が<00:13.10>歌[うた]う
```

Word timing tags prefix the word including any attached furigana bracket. Parsers must resolve furigana before evaluating word boundaries.

---

### Inline Translations

Translation and transliteration lines follow their parent lyric line immediately, prefixed with `[>lang]`:

```
[00:12.40]うっせぇうっせぇうっせぇわ
[>en]Shut up, shut up, shut up already
[>ja-Latn]ussee ussee usseewa
```

- `[>lang]` uses BCP 47 language codes.
- Translation lines do not carry their own timestamps; they inherit the timestamp of the parent line.
- Any number of translation lines may follow a parent line.
- Translation lines are ignored by standard LRC parsers (unrecognized tag format).
- Translation lines may not themselves contain `[>lang]` children.

**Recommended BCP 47 codes for common cases:**

| Code | Use |
|------|-----|
| `en` | English |
| `ja` | Japanese |
| `ja-Latn` | Japanese romanization |
| `ko` | Korean |
| `zh-Hans` | Simplified Chinese |
| `zh-Hant` | Traditional Chinese |
| `zh-Latn` | Chinese romanization (pinyin) |

Contributors should use these codes consistently. Parsers must not hard-code language logic against specific codes.

---

### Multi-Voice

Voice attribution is an optional inline tag at the start of a lyric line:

```
[00:32.10][v:A]君は
[00:33.40][v:B]僕は
[00:34.20][v:AB]二人で
```

- `[v:label]` appears after the timestamp.
- Labels are arbitrary short strings: `A`, `B`, `Chorus`, `Taro`, etc.
- Unlabeled lines are considered common/unattributed.
- Voice labels are local to the file; no global registry.
- Translation lines inherit the voice of their parent.
- Multi-voice is optional. Parsers that do not implement it should treat `[v:*]` as an unknown tag and render the line without attribution rather than erroring.

**Combined example:**

```
[00:32.10][v:A]君は
[>en]You are
[00:33.40][v:B]僕は
[>en]I am
```

---

## Blank Lines

Blank lines are ignored by parsers. Contributors may use them freely to improve readability between sections.

---

## Error Handling

| Context | Behavior |
|---------|----------|
| Malformed timestamp | Emit a warning, skip the line |
| Unknown header tag | Ignore silently |
| Unknown `[>lang]` code | Parse and store as-is, do not error |
| Malformed furigana bracket | Treat as literal text, emit a warning |
| `[v:label]` on a translation line | Ignore, inherit from parent |
| Unrecognized line prefix | Emit a warning, skip the line |

Parsers must never hard-crash on a malformed file. Warn and continue. Validation tools (e.g. CI on a community database) may treat warnings as errors at their discretion.

---

## Full Example

```
[ti:うっせぇわ]
[ar:Ado]
[al:うっせぇわ]
[by:contributor]
[lang:ja]
[langs:ja,en,ja-Latn]

[00:00.00]
[00:12.40]<00:12.40>うっせぇ<00:12.80>うっせぇ<00:13.10>うっせぇわ
[>en]Shut up, shut up, shut up already
[>ja-Latn]ussee ussee usseewa
[00:15.20]私[わたし]が歌[うた]う
[>en]I sing
[>ja-Latn]watashi ga utau

[00:32.10][v:A]君は
[>en]You are
[00:33.40][v:B]僕は
[>en]I am
[00:34.20][v:AB]二人で
[>en]Together

[03:28.00]
```

---

## Parser Notes

1. Lines beginning with `[>` are translation lines. Collect all consecutive `[>*]` lines after a lyric line as its translations before advancing to the next timestamp.
2. Word timing tags `<mm:ss.xx>` are resolved within the lyric text after stripping furigana brackets for display.
3. Furigana brackets follow non-whitespace characters and contain only kana — use this to distinguish them from timestamp and header brackets.
4. Unknown header tags are ignored silently.
5. `[v:label]` appears between the timestamp and lyric text. If absent, voice is null/unattributed.
6. Blank lines carry no semantic meaning and are skipped.
7. Lines are processed top-to-bottom. A new timestamp line always terminates the translation block of the previous line.

---

## What XLRC Does Not Define

- Rendering behavior (scroll speed, highlight style, furigana display size) — left to the implementation.
- Lyric accuracy or licensing.
- A required lookup/distribution mechanism.

---

## Versioning

The `[xlrc:0.1]` header tag is reserved for future version negotiation. Omitting it implies 0.1.

---

## License

This specification is released under [Creative Commons CC0 1.0](https://creativecommons.org/publicdomain/zero/1.0/). Implement freely.
