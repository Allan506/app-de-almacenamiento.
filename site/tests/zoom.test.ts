import { afterEach, describe, expect, it } from "vitest";
import { applyZoomLock, readZoomLock } from "../src/lib/zoom";

const store = new Map<string, string>();
(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (key: string) => store.get(key) ?? null,
  setItem: (key: string, value: string) => store.set(key, value),
  removeItem: (key: string) => store.delete(key),
};

afterEach(() => store.clear());

describe("bloqueo de zoom", () => {
  it("viene activado por defecto", () => {
    expect(readZoomLock()).toBe(true);
  });

  it("recuerda la preferencia entre visitas", () => {
    applyZoomLock(false);
    expect(readZoomLock()).toBe(false);
    applyZoomLock(true);
    expect(readZoomLock()).toBe(true);
  });
});
