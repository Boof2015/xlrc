import * as vscode from "vscode";

export function getWebviewHtml(webview: vscode.Webview, extensionUri: vscode.Uri): string {
  const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "webview", "main.js"));
  const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, "dist", "webview", "main.css"));
  const nonce = getNonce();

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}'; media-src ${webview.cspSource} blob:; font-src ${webview.cspSource};">
<title>XLRC Editor</title>
<link rel="stylesheet" href="${styleUri}">
</head>
<body>
<div class="app">
  <div class="toolbar">
    <div class="tb-brand">
      <span class="tb-logo-mark" aria-hidden="true">
        <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
          <rect x="3" y="5" width="18" height="2.6" rx="1.3"></rect>
          <rect x="3" y="10.7" width="13" height="2.6" rx="1.3" class="accent"></rect>
          <rect x="3" y="16.4" width="16" height="2.6" rx="1.3"></rect>
        </svg>
      </span>
      <span class="tb-logo">XLRC</span>
      <span class="tb-subtitle">Editor</span>
    </div>
    <div class="tb-sep"></div>
    <button class="tb-btn" id="btnAudio" title="Load audio">
      <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M6 3v7.3A2.5 2.5 0 1 0 7 12V6h4V3H6Z"/></svg>
      Load Audio
    </button>
    <button class="tb-btn" id="btnClearAudio" title="Clear remembered audio">
      <svg viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 3h8v1H4zM5 6h6v7H5zM6 1.5h4l.7 1H5.3z"/></svg>
      Clear
    </button>
    <span class="tb-spacer"></span>
    <span class="tb-label">Lang</span>
    <select class="tb-select" id="langSelect"><option value="">None</option></select>
  </div>

  <div class="main" id="main">
    <div class="editor">
      <div class="ed-gutter" id="gutter"></div>
      <div class="ed-input">
        <div class="ed-curline" id="curline"></div>
        <pre class="ed-highlight" id="highlight" aria-hidden="true"></pre>
        <textarea class="ed-area" id="area" spellcheck="false" autocomplete="off" autocapitalize="off" wrap="off"></textarea>
      </div>
    </div>
    <div class="divider" id="divider" role="separator" aria-orientation="vertical"></div>
    <div class="renderer" id="renderer"><div class="render-inner" id="renderInner"></div></div>
  </div>

  <div class="bottom">
    <div class="transport disabled" id="transport">
      <button class="play-btn" id="playBtn" aria-label="Play or pause">
        <svg class="i-play" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2.5v11l9-5.5-9-5.5Z"/></svg>
        <svg class="i-pause" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M4 2.5h3v11H4zM9 2.5h3v11H9z"/></svg>
      </button>
      <div class="scrub-wrap">
        <div class="scrub" id="scrub">
          <canvas class="wave" id="wave"></canvas>
          <div class="mk-rail" id="markers"></div>
          <div class="playhead" id="playhead"></div>
          <div class="scrub-tip" id="scrubTip"></div>
        </div>
      </div>
      <div class="time" id="time">0:00 / 0:00</div>
    </div>
    <div class="status" id="status">
      <span class="ok" id="stStatus">Valid</span>
      <span class="dot">.</span>
      <span class="lines" id="stLines">0 lines</span>
      <span class="dot">.</span>
      <span class="langs" id="stLangs">none</span>
      <span class="fname" id="stFile"></span>
    </div>
  </div>
</div>

<audio id="audio" preload="metadata"></audio>
<div class="toast" id="toast"></div>
<script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
}

function getNonce(): string {
  const possible = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let text = "";
  for (let i = 0; i < 32; i += 1) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
