# XLRC Editor

Native VS Code custom editor for `.xlrc` lyric files.

## Features

- Opens `.xlrc` files in a custom split editor by default.
- Edits the real VS Code text document, so save, undo, redo, revert, and split editor behavior stay native.
- Renders XLRC lyrics live with furigana, translations, voice labels, active line sync, and validation status.
- Loads audio through a VS Code file picker and remembers the selected audio per document/workspace.
- Publishes XLRC parser warnings as VS Code diagnostics in the Problems panel.

## Development

```sh
npm install
npm run compile
npm test
npm run package
```

The packaged extension is self-contained. End users install the Marketplace extension or generated `.vsix`; they do not need this source repository.
