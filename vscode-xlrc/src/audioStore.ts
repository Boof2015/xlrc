const STORAGE_PREFIX = "xlrc.audio.";

export interface MementoLike {
  get<T>(key: string): T | undefined;
  update(key: string, value: unknown): Thenable<void> | Promise<void> | void;
}

export interface UriLike {
  toString(): string;
}

export class AudioStore {
  constructor(private readonly state: MementoLike) {}

  get(documentUri: UriLike | string): string | undefined {
    return this.state.get<string>(audioStoreKey(documentUri));
  }

  async set(documentUri: UriLike | string, audioUri: UriLike | string): Promise<void> {
    await this.state.update(audioStoreKey(documentUri), uriKey(audioUri));
  }

  async clear(documentUri: UriLike | string): Promise<void> {
    await this.state.update(audioStoreKey(documentUri), undefined);
  }
}

export function audioStoreKey(documentUri: UriLike | string): string {
  return `${STORAGE_PREFIX}${uriKey(documentUri)}`;
}

function uriKey(uri: UriLike | string): string {
  return typeof uri === "string" ? uri : uri.toString();
}
