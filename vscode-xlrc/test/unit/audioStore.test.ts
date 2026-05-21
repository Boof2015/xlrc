import { describe, expect, it } from "vitest";
import { AudioStore, audioStoreKey } from "../../src/audioStore";

class FakeMemento {
  readonly values = new Map<string, unknown>();

  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  update(key: string, value: unknown): void {
    if (value === undefined) {
      this.values.delete(key);
    } else {
      this.values.set(key, value);
    }
  }
}

describe("AudioStore", () => {
  it("stores remembered audio by document uri", async () => {
    const state = new FakeMemento();
    const store = new AudioStore(state);

    await store.set("file:///lyrics/demo.xlrc", "file:///audio/demo.mp3");

    expect(store.get("file:///lyrics/demo.xlrc")).toBe("file:///audio/demo.mp3");
    expect(state.values.has(audioStoreKey("file:///lyrics/demo.xlrc"))).toBe(true);
  });

  it("clears remembered audio", async () => {
    const state = new FakeMemento();
    const store = new AudioStore(state);

    await store.set("file:///lyrics/demo.xlrc", "file:///audio/demo.mp3");
    await store.clear("file:///lyrics/demo.xlrc");

    expect(store.get("file:///lyrics/demo.xlrc")).toBeUndefined();
  });
});
