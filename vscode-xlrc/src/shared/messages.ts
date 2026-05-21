export interface XlrcWarning {
  line: number;
  column?: number;
  code: string;
  message: string;
}

export type HostToWebviewMessage =
  | {
      type: "document";
      text: string;
      fileName: string;
      isDirty: boolean;
      warnings: XlrcWarning[];
    }
  | {
      type: "audioData";
      name: string;
      mime: string;
      base64: string;
      remembered: boolean;
    }
  | {
      type: "audioCleared";
    }
  | {
      type: "audioError";
      message: string;
    };

export type WebviewToHostMessage =
  | {
      type: "ready";
    }
  | {
      type: "edit";
      text: string;
    }
  | {
      type: "replaceText";
      text: string;
      reason?: string;
    }
  | {
      type: "save";
      text: string;
    }
  | {
      type: "loadAudio";
    }
  | {
      type: "clearAudio";
    }
  | {
      type: "openAsText";
    };

export function isWebviewToHostMessage(value: unknown): value is WebviewToHostMessage {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  switch (value.type) {
    case "ready":
    case "loadAudio":
    case "clearAudio":
    case "openAsText":
      return true;
    case "edit":
    case "replaceText":
    case "save":
      return typeof value.text === "string";
    default:
      return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
