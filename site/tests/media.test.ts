import { describe, expect, it } from "vitest";
import {
  buildPlaylist,
  clampVolume,
  createResumeStore,
  formatDuration,
  loopLabel,
  mediaKindOf,
  nextLoopMode,
  nextRate,
  readNumber,
  stepPlaylist,
  writeNumber,
} from "../src/lib/media";
import type { VaultNode } from "../src/lib/types";

function file(name: string, mime: string, id = name): VaultNode {
  return {
    id,
    parent_id: null,
    name,
    kind: "file",
    size: 1024,
    mime_type: mime,
    chunks: [],
    blob_key: null,
    is_favorite: false,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    deleted_at: null,
    trash_id: null,
  };
}

function memoryStorage(): Storage {
  const data = new Map<string, string>();
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    getItem: (key: string) => data.get(key) ?? null,
    key: (index: number) => Array.from(data.keys())[index] ?? null,
    removeItem: (key: string) => void data.delete(key),
    setItem: (key: string, value: string) => void data.set(key, value),
  } as Storage;
}

describe("formatDuration", () => {
  it("muestra minutos y horas", () => {
    expect(formatDuration(0)).toBe("0:00");
    expect(formatDuration(9)).toBe("0:09");
    expect(formatDuration(65)).toBe("1:05");
    expect(formatDuration(600)).toBe("10:00");
    expect(formatDuration(3661)).toBe("1:01:01");
  });

  it("aguanta valores invalidos", () => {
    expect(formatDuration(Number.NaN)).toBe("0:00");
    expect(formatDuration(-4)).toBe("0:00");
    expect(formatDuration(Number.POSITIVE_INFINITY)).toBe("0:00");
  });
});

describe("velocidad y volumen", () => {
  it("recorre las velocidades sin salirse", () => {
    expect(nextRate(1)).toBe(1.25);
    expect(nextRate(1, -1)).toBe(0.75);
    expect(nextRate(2)).toBe(2);
    expect(nextRate(0.5, -1)).toBe(0.5);
    expect(nextRate(1.37)).toBe(1.25);
  });

  it("mantiene el volumen entre 0 y 1", () => {
    expect(clampVolume(2)).toBe(1);
    expect(clampVolume(-1)).toBe(0);
    expect(clampVolume(Number.NaN)).toBe(1);
    expect(clampVolume(0.42)).toBe(0.42);
  });
});

describe("playlist", () => {
  const audioA = file("a.mp3", "audio/mpeg");
  const audioB = file("b.mp3", "audio/mpeg");
  const video = file("v.mp4", "video/mp4");
  const deleted = { ...file("c.mp3", "audio/mpeg"), deleted_at: "2026-01-02T00:00:00.000Z" };

  it("agrupa solo el mismo tipo y descarta la papelera", () => {
    const list = buildPlaylist([audioA, video, audioB, deleted], audioA, "audio");
    expect(list.map((node) => node.name)).toEqual(["a.mp3", "b.mp3"]);
  });

  it("incluye el archivo actual aunque no este en la lista", () => {
    const outside = file("suelto.mp3", "audio/mpeg");
    const list = buildPlaylist([audioA], outside, "audio");
    expect(list.map((node) => node.name)).toEqual(["a.mp3", "suelto.mp3"]);
  });

  it("avanza y retrocede con y sin vuelta", () => {
    const list = [audioA, audioB];
    expect(stepPlaylist(list, audioA.id, 1)?.id).toBe(audioB.id);
    expect(stepPlaylist(list, audioB.id, 1)?.id).toBe(audioA.id);
    expect(stepPlaylist(list, audioB.id, 1, { wrap: false })).toBeNull();
    expect(stepPlaylist(list, audioA.id, -1)?.id).toBe(audioB.id);
    expect(stepPlaylist(list, audioA.id, -1, { wrap: false })).toBeNull();
  });

  it("en aleatorio nunca repite el actual", () => {
    const list = [audioA, audioB];
    expect(stepPlaylist(list, audioA.id, 1, { shuffle: true, random: () => 0 })?.id).toBe(audioB.id);
    expect(stepPlaylist(list, audioA.id, 1, { shuffle: true, random: () => 0.99 })?.id).toBe(audioB.id);
    expect(stepPlaylist([audioA], audioA.id, 1, { shuffle: true })).toBeNull();
  });

  it("detecta el tipo multimedia", () => {
    expect(mediaKindOf(audioA)).toBe("audio");
    expect(mediaKindOf(video)).toBe("video");
    expect(mediaKindOf(file("nota.txt", "text/plain"))).toBeNull();
  });
});

describe("resume store", () => {
  it("guarda y recupera la posicion por archivo", () => {
    const store = createResumeStore(memoryStorage());
    expect(store.read("a")).toBe(0);
    store.write("a", 42.8);
    expect(store.read("a")).toBe(42);
    store.clear("a");
    expect(store.read("a")).toBe(0);
  });

  it("ignora posiciones absurdas y el almacenamiento ausente", () => {
    const store = createResumeStore(null);
    store.write("a", 10);
    expect(store.read("a")).toBe(0);
    const real = createResumeStore(memoryStorage());
    real.write("a", 0);
    real.write("a", Number.NaN);
    expect(real.read("a")).toBe(0);
  });

  it("no crece sin control", () => {
    const storage = memoryStorage();
    const store = createResumeStore(storage);
    for (let index = 0; index < 100; index += 1) store.write(`f${index}`, 10);
    const keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
    expect(keys.length).toBeLessThanOrEqual(80);
    expect(keys).toContain("nube-lite.pos.f99");
  });

  it("lee y escribe preferencias numericas", () => {
    const storage = memoryStorage();
    expect(readNumber(storage, "x", 1)).toBe(1);
    writeNumber(storage, "x", 1.5);
    expect(readNumber(storage, "x", 1)).toBe(1.5);
    writeNumber(null, "y", 2);
    expect(readNumber(null, "y", 3)).toBe(3);
  });
});

describe("modos de repeticion", () => {
  it("cicla entre apagado, lista y archivo", () => {
    expect(nextLoopMode("off")).toBe("all");
    expect(nextLoopMode("all")).toBe("one");
    expect(nextLoopMode("one")).toBe("off");
    expect(loopLabel("one")).toContain("archivo");
    expect(loopLabel("all")).toContain("lista");
  });
});
