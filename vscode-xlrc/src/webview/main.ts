import { parseXLRC } from "../../../src";
import { extractEmbeddedLyrics } from "../shared/embeddedLyrics";
import type { HostToWebviewMessage, WebviewToHostMessage } from "../shared/messages";
import "./styles.css";

declare const acquireVsCodeApi: () => {
  postMessage(message: WebviewToHostMessage): void;
  getState(): unknown;
  setState(state: unknown): void;
};

declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}

const vscode = acquireVsCodeApi();
const KANA = /^[\u3040-\u309f\u30a0-\u30ff\u31f0-\u31ff\uff66-\uff9f]+$/u;
const LANG_LABELS: Record<string, string> = {
  en: "English",
  "ja-Latn": "Romaji",
  ja: "Japanese",
  ko: "Korean",
  "zh-Hans": "Simplified Chinese",
  "zh-Hant": "Traditional Chinese",
  "zh-Latn": "Pinyin",
  es: "Spanish",
  fr: "French"
};

type ParsedFile = ReturnType<typeof parseXLRC>;
type ParsedLine = ParsedFile["lines"][number];

const area = byId<HTMLTextAreaElement>("area");
const highlight = byId<HTMLPreElement>("highlight");
const gutter = byId<HTMLDivElement>("gutter");
const curline = byId<HTMLDivElement>("curline");
const renderInner = byId<HTMLDivElement>("renderInner");
const langSelect = byId<HTMLSelectElement>("langSelect");
const audio = byId<HTMLAudioElement>("audio");
const transport = byId<HTMLDivElement>("transport");
const playBtn = byId<HTMLButtonElement>("playBtn");
const scrub = byId<HTMLDivElement>("scrub");
const waveCanvas = byId<HTMLCanvasElement>("wave");
const markersEl = byId<HTMLDivElement>("markers");
const playhead = byId<HTMLDivElement>("playhead");
const scrubTip = byId<HTMLDivElement>("scrubTip");
const timeEl = byId<HTMLDivElement>("time");
const stStatus = byId<HTMLSpanElement>("stStatus");
const stLines = byId<HTMLSpanElement>("stLines");
const stLangs = byId<HTMLSpanElement>("stLangs");
const stFile = byId<HTMLSpanElement>("stFile");
const toast = byId<HTMLDivElement>("toast");
const divider = byId<HTMLDivElement>("divider");
const main = byId<HTMLDivElement>("main");

const waveCtx = getWaveContext(waveCanvas);

let parsed: ParsedFile = { meta: {}, lines: [], warnings: [] };
let activeLang = "";
let lineEls: HTMLDivElement[] = [];
let activeIdx = -1;
let parseTimer: ReturnType<typeof setTimeout> | undefined;
let postEditTimer: ReturnType<typeof setTimeout> | undefined;
let curGutterEl: Element | null = null;
let activeSrcLine = 0;
let applyingRemoteDocument = false;
let currentDocumentDirty = false;
let userEdited = false;
let audioURL: string | undefined;
let toastTimer: ReturnType<typeof setTimeout> | undefined;
let peaks: Float32Array | null = null;
let audioCtx: AudioContext | null = null;
let mediaSrc: MediaElementAudioSourceNode | null = null;
let gainNode: GainNode | null = null;
let normGain = 1;
let rafId = 0;
let scrubbing = false;
let draggingDivider = false;

const prefersReduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
const waveColors = { accent: "#38bdf8", muted: "#404040" };

function byId<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) {
    throw new Error(`Missing webview element: ${id}`);
  }
  return element as T;
}

function getWaveContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const context = canvas.getContext("2d");
  if (!context) {
    throw new Error("Could not initialize waveform canvas");
  }
  return context;
}

function span(cls: string, text: string): HTMLSpanElement {
  const element = document.createElement("span");
  element.className = cls;
  element.textContent = text;
  return element;
}

function colorizeBody(frag: DocumentFragment, body: string): void {
  let i = 0;
  while (i < body.length) {
    if (body.charAt(i) === "<") {
      const close = body.indexOf(">", i + 1);
      const tag = close === -1 ? "" : body.slice(i, close + 1);
      if (close !== -1 && /^<\d+:\d{2}\.\d{2}>$/.test(tag)) {
        frag.appendChild(span("t-time", tag));
        i = close + 1;
        continue;
      }
    }

    if (body.charAt(i) === "[") {
      const close = body.indexOf("]", i + 1);
      const prev = body.charAt(i - 1);
      if (close !== -1 && prev && !/\s/.test(prev) && KANA.test(body.slice(i + 1, close))) {
        frag.appendChild(span("t-furi", body.slice(i, close + 1)));
        i = close + 1;
        continue;
      }
    }

    let j = i + 1;
    while (j < body.length && body.charAt(j) !== "<" && body.charAt(j) !== "[") {
      j += 1;
    }
    frag.appendChild(document.createTextNode(body.slice(i, j)));
    i = j;
  }
}

function colorizeLine(raw: string): DocumentFragment {
  const frag = document.createDocumentFragment();
  if (raw.trim() === "") {
    return frag;
  }

  if (/^\[[A-Za-z][\w-]*:[^\]]*\]$/.test(raw)) {
    frag.appendChild(span("t-tag", raw));
    return frag;
  }

  let match = raw.match(/^(\[>[^\]]+\])(.*)$/);
  if (match) {
    frag.appendChild(span("t-tr", match[1] ?? ""));
    colorizeBody(frag, match[2] ?? "");
    return frag;
  }

  match = raw.match(/^(\[\d+:\d{2}\.\d{2}\])(.*)$/);
  if (match) {
    frag.appendChild(span("t-time", match[1] ?? ""));
    colorizeBody(frag, match[2] ?? "");
    return frag;
  }

  frag.appendChild(document.createTextNode(raw));
  return frag;
}

function renderFurigana(parent: HTMLElement, text: string, furigana: ParsedLine["furigana"]): void {
  const ranges = [...furigana].sort((a, b) => a.start - b.start);
  let cursor = 0;

  for (const entry of ranges) {
    if (entry.start < cursor) {
      continue;
    }

    if (entry.start > cursor) {
      parent.appendChild(document.createTextNode(text.slice(cursor, entry.start)));
    }

    const ruby = document.createElement("ruby");
    ruby.appendChild(document.createTextNode(entry.base));
    const rt = document.createElement("rt");
    rt.textContent = entry.reading;
    ruby.appendChild(rt);
    parent.appendChild(ruby);
    cursor = entry.end;
  }

  if (cursor < text.length) {
    parent.appendChild(document.createTextNode(text.slice(cursor)));
  }
}

function fmt(sec: number): string {
  const safe = Number.isFinite(sec) && sec > 0 ? Math.floor(sec) : 0;
  return `${Math.floor(safe / 60)}:${String(safe % 60).padStart(2, "0")}`;
}

function voiceColor(label: string): string {
  let h = 0;
  for (const ch of label) {
    h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  }
  return `hsl(${h % 360} 70% 62%)`;
}

function renderHighlight(): void {
  const value = area.value;
  const parts = value.split("\n");
  const warnLines = new Set(parsed.warnings.map((warning) => warning.line));
  highlight.textContent = "";

  for (let i = 0; i < parts.length; i += 1) {
    const lineSpan = document.createElement("span");
    lineSpan.className = warnLines.has(i + 1) ? "hl-line err" : "hl-line";
    lineSpan.appendChild(colorizeLine(parts[i] ?? ""));
    highlight.appendChild(lineSpan);
    if (i < parts.length - 1) {
      highlight.appendChild(document.createTextNode("\n"));
    }
  }

  renderGutter(parts.length);
  syncScroll();
}

function updateErrLines(): void {
  const warnLines = new Set(parsed.warnings.map((warning) => warning.line));
  const spans = highlight.children;
  for (let i = 0; i < spans.length; i += 1) {
    spans[i]?.classList.toggle("err", warnLines.has(i + 1));
  }
}

function renderGutter(count: number): void {
  const warnLines = new Set(parsed.warnings.map((warning) => warning.line));
  const frag = document.createDocumentFragment();

  for (let n = 1; n <= count; n += 1) {
    const line = document.createElement("div");
    line.className = `ln${warnLines.has(n) ? " warn" : ""}`;
    line.textContent = String(n);
    frag.appendChild(line);
  }

  gutter.textContent = "";
  gutter.appendChild(frag);
}

function syncScroll(): void {
  highlight.scrollTop = area.scrollTop;
  highlight.scrollLeft = area.scrollLeft;
  gutter.scrollTop = area.scrollTop;
  updateCurline();
}

function doParse(): void {
  parsed = parseXLRC(area.value);
  buildLangOptions();
  renderLyrics();
  renderStatus();
  renderGutter(area.value.split("\n").length);
  updateErrLines();
  renderMarkers();
  syncActive(true);
}

function scheduleParse(): void {
  if (parseTimer) {
    clearTimeout(parseTimer);
  }
  parseTimer = setTimeout(doParse, 160);
}

function schedulePostEdit(): void {
  if (postEditTimer) {
    clearTimeout(postEditTimer);
  }
  postEditTimer = setTimeout(() => {
    vscode.postMessage({ type: "edit", text: area.value });
  }, 80);
}

function detectedLangs(): string[] {
  const set = new Set<string>();
  for (const line of parsed.lines) {
    for (const translation of line.translations) {
      set.add(translation.lang);
    }
  }

  const langs = parsed.meta.langs;
  if (Array.isArray(langs)) {
    for (const lang of langs) {
      set.add(lang);
    }
  }

  return [...set];
}

function buildLangOptions(): void {
  const langs = detectedLangs();
  const prev = activeLang;
  langSelect.textContent = "";

  const none = document.createElement("option");
  none.value = "";
  none.textContent = "None";
  langSelect.appendChild(none);

  for (const lang of langs) {
    const option = document.createElement("option");
    option.value = lang;
    option.textContent = LANG_LABELS[lang] ?? lang;
    langSelect.appendChild(option);
  }

  activeLang = langs.includes(prev) ? prev : "";
  langSelect.value = activeLang;
}

function renderLyrics(): void {
  renderInner.textContent = "";
  lineEls = [];

  if (!parsed.lines.length) {
    const empty = document.createElement("div");
    empty.className = "render-empty";
    empty.textContent = "No timed lines yet. Add a [mm:ss.xx] line on the left.";
    renderInner.appendChild(empty);
    return;
  }

  parsed.lines.forEach((line, idx) => {
    const el = document.createElement("div");
    el.className = "rline";

    const mainLine = document.createElement("div");
    mainLine.className = "rline-main";

    if (line.voice) {
      const pill = document.createElement("span");
      pill.className = "voice-pill";
      pill.textContent = line.voice;
      pill.style.color = voiceColor(line.voice);
      mainLine.appendChild(pill);
    }

    const text = document.createElement("div");
    text.className = "rline-text";
    if (line.isEmpty) {
      text.classList.add("empty");
      text.textContent = ".";
    } else {
      renderFurigana(text, line.text, line.furigana);
    }
    mainLine.appendChild(text);
    el.appendChild(mainLine);

    if (activeLang) {
      const translation = line.translations.find((candidate) => candidate.lang === activeLang);
      if (translation) {
        const trEl = document.createElement("div");
        trEl.className = "rline-tr";
        trEl.textContent = translation.text;
        el.appendChild(trEl);
      }
    }

    renderInner.appendChild(el);
    lineEls[idx] = el;
  });
}

function renderStatus(): void {
  const warningCount = parsed.warnings.length;
  if (warningCount === 0) {
    stStatus.className = "ok";
    stStatus.textContent = "Valid";
  } else {
    stStatus.className = "warn";
    stStatus.textContent = `${warningCount} ${warningCount === 1 ? "warning" : "warnings"}`;
  }

  stLines.textContent = `${parsed.lines.length} ${parsed.lines.length === 1 ? "line" : "lines"}`;
  const langs = detectedLangs();
  stLangs.textContent = langs.length ? langs.join(", ") : "none";
}

function resolveActive(ms: number): number {
  const lines = parsed.lines;
  let lo = 0;
  let hi = lines.length - 1;
  let result = -1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const line = lines[mid];
    if (!line) {
      break;
    }

    if (line.timestamp <= ms) {
      result = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  return result;
}

function syncActive(force: boolean): void {
  if (!parsed.lines.length) {
    activeIdx = -1;
    setEditorActive(-1);
    return;
  }

  const ms = audio.currentTime * 1000 - (parsed.meta.offset ?? 0);
  const idx = resolveActive(ms);
  if (idx === activeIdx && !force) {
    return;
  }

  activeIdx = idx;
  lineEls.forEach((el, i) => {
    el.classList.toggle("active", i === idx);
    el.classList.toggle("near", i === idx - 1 || i === idx + 1);
  });

  const lineEl = idx >= 0 ? lineEls[idx] : undefined;
  if (lineEl) {
    lineEl.scrollIntoView({ block: "center", behavior: prefersReduced ? "auto" : "smooth" });
  }

  updateTickActive(idx);
  setEditorActive(idx);
}

function setEditorActive(idx: number): void {
  const sourceLine = idx >= 0 && parsed.lines[idx] ? parsed.lines[idx]?.line ?? 0 : 0;
  if (curGutterEl) {
    curGutterEl.classList.remove("cur");
  }

  curGutterEl = sourceLine ? gutter.children[sourceLine - 1] ?? null : null;
  if (curGutterEl) {
    curGutterEl.classList.add("cur");
  }

  activeSrcLine = sourceLine;
  updateCurline();
}

function updateCurline(): void {
  if (!activeSrcLine) {
    curline.style.display = "none";
    return;
  }

  const lineHeight = parseFloat(getComputedStyle(highlight).lineHeight) || 21;
  curline.style.top = `${12 + (activeSrcLine - 1) * lineHeight - area.scrollTop}px`;
  curline.style.display = "block";
}

function loop(): void {
  updateScrub();
  syncActive(false);
  rafId = requestAnimationFrame(loop);
}

function startLoop(): void {
  if (!rafId) {
    rafId = requestAnimationFrame(loop);
  }
}

function stopLoop(): void {
  cancelAnimationFrame(rafId);
  rafId = 0;
}

function ensureGraph(): void {
  if (audioCtx) {
    return;
  }

  const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextCtor) {
    return;
  }

  audioCtx = new AudioContextCtor();
  mediaSrc = audioCtx.createMediaElementSource(audio);
  gainNode = audioCtx.createGain();
  gainNode.gain.value = normGain;
  mediaSrc.connect(gainNode).connect(audioCtx.destination);
}

function applyGain(): void {
  if (gainNode) {
    gainNode.gain.value = normGain;
  }
}

function refreshWaveColors(): void {
  const styles = getComputedStyle(document.documentElement);
  waveColors.accent = styles.getPropertyValue("--accent").trim() || waveColors.accent;
  waveColors.muted = styles.getPropertyValue("--wave-muted").trim() || waveColors.muted;
}

function resizeWave(): void {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const rect = waveCanvas.getBoundingClientRect();
  waveCanvas.width = Math.max(1, Math.round(rect.width * dpr));
  waveCanvas.height = Math.max(1, Math.round(rect.height * dpr));
}

function drawWave(): void {
  const width = waveCanvas.width;
  const height = waveCanvas.height;
  waveCtx.clearRect(0, 0, width, height);

  const duration = audio.duration || 0;
  const playX = duration ? (audio.currentTime / duration) * width : 0;
  if (!peaks) {
    waveCtx.fillStyle = waveColors.muted;
    waveCtx.fillRect(0, height / 2 - 1, width, 2);
    return;
  }

  const n = peaks.length;
  const step = width / n;
  const barWidth = Math.max(1, step * 0.6);
  for (let i = 0; i < n; i += 1) {
    const peak = peaks[i] ?? 0;
    const centerX = i * step + step / 2;
    const barHeight = Math.max(2, peak * height * 0.92);
    waveCtx.fillStyle = centerX <= playX ? waveColors.accent : waveColors.muted;
    waveCtx.fillRect(centerX - barWidth / 2, (height - barHeight) / 2, barWidth, barHeight);
  }
}

async function buildWaveform(buffer: ArrayBuffer): Promise<void> {
  peaks = null;
  normGain = 1;
  applyGain();
  resizeWave();
  drawWave();

  let tmpCtx: AudioContext | null = null;
  try {
    ensureGraph();
    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      return;
    }

    const ctx = audioCtx ?? (tmpCtx = new AudioContextCtor());
    const audioBuffer = await ctx.decodeAudioData(buffer);
    const channel = audioBuffer.getChannelData(0);
    const bucketCount = 360;
    const block = Math.max(1, Math.floor(channel.length / bucketCount));
    const nextPeaks = new Float32Array(bucketCount);
    let max = 0;
    let globalPeak = 0;
    let globalSum = 0;
    let globalCount = 0;

    for (let i = 0; i < bucketCount; i += 1) {
      let sum = 0;
      const start = i * block;
      for (let j = 0; j < block; j += 1) {
        const value = channel[start + j] ?? 0;
        const abs = value < 0 ? -value : value;
        if (abs > globalPeak) {
          globalPeak = abs;
        }
        sum += value * value;
      }

      const rms = Math.sqrt(sum / block);
      nextPeaks[i] = rms;
      if (rms > max) {
        max = rms;
      }
      globalSum += sum;
      globalCount += block;
    }

    if (max > 0) {
      for (let i = 0; i < bucketCount; i += 1) {
        nextPeaks[i] = (nextPeaks[i] ?? 0) / max;
      }
    }

    peaks = nextPeaks;
    const measuredRMS = globalCount ? Math.sqrt(globalSum / globalCount) : 0;
    if (measuredRMS > 0) {
      const targetRMS = 0.1;
      const ceiling = 0.97;
      let gain = targetRMS / measuredRMS;
      if (globalPeak > 0) {
        gain = Math.min(gain, ceiling / globalPeak);
      }
      normGain = Math.max(0.1, Math.min(gain, 4));
    }
    applyGain();
  } catch {
    peaks = null;
  } finally {
    if (tmpCtx) {
      void tmpCtx.close();
    }
  }

  resizeWave();
  drawWave();
}

function updateScrub(): void {
  const duration = audio.duration || 0;
  const current = audio.currentTime || 0;
  playhead.style.left = `${duration ? (current / duration) * 100 : 0}%`;
  timeEl.textContent = `${fmt(current)} / ${fmt(duration)}`;
  drawWave();
}

function renderMarkers(): void {
  markersEl.textContent = "";
  const duration = audio.duration;
  if (!duration || !parsed.lines.length) {
    return;
  }

  const durationMs = duration * 1000;
  for (let i = 0; i < parsed.lines.length; i += 1) {
    const line = parsed.lines[i];
    if (!line || line.timestamp > durationMs) {
      continue;
    }

    const marker = document.createElement("div");
    marker.className = "mk";
    marker.style.left = `${(line.timestamp / durationMs) * 100}%`;
    marker.dataset.idx = String(i);
    markersEl.appendChild(marker);
  }

  updateTickActive(activeIdx);
}

function updateTickActive(idx: number): void {
  for (const marker of Array.from(markersEl.children)) {
    const markerIndex = Number((marker as HTMLElement).dataset.idx);
    marker.classList.toggle("active", markerIndex === idx);
    marker.classList.toggle("passed", markerIndex < idx);
  }
}

function seekToClientX(clientX: number): void {
  const rect = scrub.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  if (audio.duration) {
    audio.currentTime = ratio * audio.duration;
  }
  updateScrub();
  syncActive(true);
}

function showTip(clientX: number): void {
  const duration = audio.duration || 0;
  if (!duration || !parsed.lines.length) {
    scrubTip.style.display = "none";
    return;
  }

  const rect = scrub.getBoundingClientRect();
  const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  const idx = resolveActive(ratio * duration * 1000);
  const line = idx >= 0 ? parsed.lines[idx] : parsed.lines[0];
  const label = !line || line.isEmpty ? "instrumental" : line.text;
  scrubTip.textContent = `${fmt((line?.timestamp ?? 0) / 1000)} - ${label.length > 40 ? `${label.slice(0, 39)}...` : label}`;
  scrubTip.style.left = `${ratio * 100}%`;
  scrubTip.style.display = "block";
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function loadAudioFromMessage(message: Extract<HostToWebviewMessage, { type: "audioData" }>): void {
  clearAudioUi(false);
  const buffer = base64ToArrayBuffer(message.base64);
  const lyrics = extractEmbeddedLyrics(buffer.slice(0));
  const blob = new Blob([buffer], { type: message.mime });
  audioURL = URL.createObjectURL(blob);
  audio.src = audioURL;
  transport.classList.remove("disabled");
  void buildWaveform(buffer.slice(0));
  showToast(`${message.remembered ? "Restored" : "Loaded"} audio: ${message.name}`);

  if (lyrics) {
    handleEmbeddedLyrics(lyrics);
  }
}

function clearAudioUi(showMessage: boolean): void {
  stopLoop();
  audio.pause();
  playBtn.classList.remove("playing");
  if (audioURL) {
    URL.revokeObjectURL(audioURL);
    audioURL = undefined;
  }
  audio.removeAttribute("src");
  audio.load();
  peaks = null;
  markersEl.textContent = "";
  transport.classList.add("disabled");
  updateScrub();
  drawWave();
  if (showMessage) {
    showToast("Audio cleared");
  }
}

function handleEmbeddedLyrics(text: string): void {
  const shouldReplaceImmediately = !currentDocumentDirty && !userEdited && area.value.trim().length === 0;
  if (shouldReplaceImmediately) {
    replaceDocumentText(text);
    showToast("Loaded embedded lyrics");
    return;
  }

  showToast("Embedded lyrics found in this audio file", () => replaceDocumentText(text));
}

function replaceDocumentText(text: string): void {
  vscode.postMessage({ type: "replaceText", text, reason: "embeddedLyrics" });
}

function showToast(message: string, onAccept?: () => void): void {
  if (toastTimer) {
    clearTimeout(toastTimer);
  }

  toast.textContent = "";
  const text = document.createElement("span");
  text.textContent = message;
  toast.appendChild(text);

  if (onAccept) {
    const replace = document.createElement("button");
    replace.className = "toast-btn accent";
    replace.textContent = "Replace";
    replace.addEventListener("click", () => {
      onAccept();
      hideToast();
    });

    const dismiss = document.createElement("button");
    dismiss.className = "toast-btn";
    dismiss.textContent = "Dismiss";
    dismiss.addEventListener("click", hideToast);

    toast.appendChild(replace);
    toast.appendChild(dismiss);
  } else {
    toastTimer = setTimeout(hideToast, 2600);
  }

  toast.classList.add("show");
}

function hideToast(): void {
  if (toastTimer) {
    clearTimeout(toastTimer);
  }
  toast.classList.remove("show");
}

function applyDocumentMessage(message: Extract<HostToWebviewMessage, { type: "document" }>): void {
  currentDocumentDirty = message.isDirty;
  stFile.textContent = message.fileName;

  if (area.value !== message.text) {
    applyingRemoteDocument = true;
    area.value = message.text;
    applyingRemoteDocument = false;
  }

  parsed = parseXLRC(area.value);
  renderHighlight();
  doParse();
  userEdited = message.isDirty;
}

window.addEventListener("message", (event: MessageEvent<HostToWebviewMessage>) => {
  const message = event.data;
  switch (message.type) {
    case "document":
      applyDocumentMessage(message);
      break;
    case "audioData":
      loadAudioFromMessage(message);
      break;
    case "audioCleared":
      clearAudioUi(true);
      break;
    case "audioError":
      showToast(message.message);
      break;
  }
});

playBtn.addEventListener("click", () => {
  if (!audio.src) {
    return;
  }
  if (audio.paused) {
    void audio.play();
  } else {
    audio.pause();
  }
});

audio.addEventListener("play", () => {
  if (audioCtx?.state === "suspended") {
    void audioCtx.resume();
  }
  playBtn.classList.add("playing");
  startLoop();
});
audio.addEventListener("pause", () => {
  playBtn.classList.remove("playing");
  stopLoop();
  updateScrub();
});
audio.addEventListener("ended", () => {
  playBtn.classList.remove("playing");
  stopLoop();
});
audio.addEventListener("loadedmetadata", () => {
  resizeWave();
  renderMarkers();
  updateScrub();
});
audio.addEventListener("seeked", () => {
  updateScrub();
  syncActive(true);
});

scrub.addEventListener("pointerdown", (event) => {
  if (!audio.src) {
    return;
  }
  scrubbing = true;
  scrub.setPointerCapture(event.pointerId);
  seekToClientX(event.clientX);
});
scrub.addEventListener("pointermove", (event) => {
  if (scrubbing) {
    seekToClientX(event.clientX);
  } else {
    showTip(event.clientX);
  }
});
scrub.addEventListener("pointerup", (event) => {
  scrubbing = false;
  try {
    scrub.releasePointerCapture(event.pointerId);
  } catch {
    // Pointer capture can already be released by the host webview.
  }
});
scrub.addEventListener("pointerleave", () => {
  scrubTip.style.display = "none";
});

divider.addEventListener("pointerdown", (event) => {
  draggingDivider = true;
  divider.classList.add("dragging");
  divider.setPointerCapture(event.pointerId);
});
divider.addEventListener("pointermove", (event) => {
  if (!draggingDivider) {
    return;
  }
  const rect = main.getBoundingClientRect();
  const x = Math.min(rect.width - 280, Math.max(260, event.clientX - rect.left));
  main.style.setProperty("--ed-col", `${x}px`);
});
divider.addEventListener("pointerup", (event) => {
  draggingDivider = false;
  divider.classList.remove("dragging");
  try {
    divider.releasePointerCapture(event.pointerId);
  } catch {
    // Pointer capture can already be released by the host webview.
  }
});

area.addEventListener("input", () => {
  if (applyingRemoteDocument) {
    return;
  }

  userEdited = true;
  currentDocumentDirty = true;
  renderHighlight();
  scheduleParse();
  schedulePostEdit();
});
area.addEventListener("scroll", syncScroll);
area.addEventListener("keydown", (event) => {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
    event.preventDefault();
    if (postEditTimer) {
      clearTimeout(postEditTimer);
      postEditTimer = undefined;
    }
    vscode.postMessage({ type: "save", text: area.value });
    return;
  }

  if (event.key !== "Tab") {
    return;
  }

  event.preventDefault();
  const start = area.selectionStart;
  const end = area.selectionEnd;
  area.value = `${area.value.slice(0, start)}  ${area.value.slice(end)}`;
  area.selectionStart = area.selectionEnd = start + 2;
  area.dispatchEvent(new Event("input", { bubbles: true }));
});

langSelect.addEventListener("change", () => {
  activeLang = langSelect.value;
  renderLyrics();
  syncActive(true);
});

byId<HTMLButtonElement>("btnAudio").addEventListener("click", () => {
  vscode.postMessage({ type: "loadAudio" });
});
byId<HTMLButtonElement>("btnClearAudio").addEventListener("click", () => {
  vscode.postMessage({ type: "clearAudio" });
});

window.addEventListener("resize", () => {
  resizeWave();
  drawWave();
});

refreshWaveColors();
renderHighlight();
doParse();
resizeWave();
drawWave();
vscode.postMessage({ type: "ready" });
