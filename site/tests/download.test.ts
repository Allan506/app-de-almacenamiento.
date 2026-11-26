import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpTelegramTransport, TelegramClient, TelegramError, type TelegramTransport } from "../src/lib/telegram";

const TOKEN = "123456789:AAHfake-token-para-pruebas-1234567890";

const bytesOf = (size: number) => {
  const data = new Uint8Array(size);
  for (let index = 0; index < size; index += 1) data[index] = index % 251;
  return data;
};

/** Respuesta que corta la conexion despues de `dropAfter` bytes. */
function partialResponse(bytes: Uint8Array, dropAfter: number) {
  let offset = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (offset >= dropAfter) {
        controller.error(new TypeError("Failed to fetch"));
        return;
      }
      const end = Math.min(bytes.length, dropAfter, offset + 512);
      controller.enqueue(bytes.slice(offset, end));
      offset = end;
    },
  });
  return new Response(stream, { status: 200, headers: { "content-length": String(bytes.length) } });
}

function fullResponse(bytes: Uint8Array) {
  return new Response(new Blob([bytes as unknown as BlobPart]), {
    status: 200,
    headers: { "content-length": String(bytes.length) },
  });
}

const requests: { range: string | null }[] = [];

function stubFetch(handler: (call: number) => Response | Promise<Response>) {
  requests.length = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ range: new Headers(init?.headers).get("range") });
      return handler(requests.length);
    }),
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("descarga de trozos", () => {
  it("reintenta desde cero cuando la conexion se corta a mitad", async () => {
    const bytes = bytesOf(4096);
    stubFetch((call) => (call === 1 ? partialResponse(bytes, 1024) : fullResponse(bytes)));

    const transport = new HttpTelegramTransport(TOKEN);
    const blob = await transport.download("documents/cancion.flac");

    expect(blob.size).toBe(4096);
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
    expect(requests).toHaveLength(2);
  });

  it("nunca pide rangos: Telegram responde 405 al preflight de OPTIONS", async () => {
    const bytes = bytesOf(2048);
    stubFetch((call) => (call === 1 ? partialResponse(bytes, 700) : fullResponse(bytes)));

    const transport = new HttpTelegramTransport(TOKEN);
    await transport.download("documents/cancion.flac");

    expect(requests.every((request) => request.range === null)).toBe(true);
  });

  it("avisa en espanol cuando la red no deja descargar", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));

    const transport = new HttpTelegramTransport(TOKEN);
    await expect(transport.download("documents/cancion.flac")).rejects.toThrow(/Se corto la conexion con Telegram/);
    expect(requests).toHaveLength(6);
  }, 15000);

  it("no reintenta si Telegram ya no tiene el archivo", async () => {
    stubFetch(() => new Response("", { status: 404 }));

    const transport = new HttpTelegramTransport(TOKEN);
    await expect(transport.download("documents/cancion.flac")).rejects.toBeInstanceOf(TelegramError);
    await expect(transport.download("documents/cancion.flac")).rejects.toThrow(/ya no tiene ese archivo/);
  });

  it("informa del progreso acumulado", async () => {
    const bytes = bytesOf(3000);
    stubFetch(() => fullResponse(bytes));
    const progress: number[] = [];

    const transport = new HttpTelegramTransport(TOKEN);
    await transport.download("documents/cancion.flac", (loaded, total) => {
      expect(total).toBe(3000);
      progress.push(loaded);
    });

    expect(progress.at(-1)).toBe(3000);
  });

  it("construye la URL directa del archivo", () => {
    const transport = new HttpTelegramTransport(TOKEN);
    expect(transport.fileUrl("documents/mi archivo.flac")).toBe(
      `https://api.telegram.org/file/bot${TOKEN}/documents/mi%20archivo.flac`,
    );
  });
});

describe("reproduccion directa", () => {
  class FakeTransport implements TelegramTransport {
    async call<T>(method: string, payload: Record<string, string>): Promise<T> {
      if (method === "getFile") return { file_path: `documents/${payload.file_id}.flac` } as T;
      throw new Error(`metodo no esperado: ${method}`);
    }
    async download(): Promise<Blob> {
      throw new Error("no deberia descargar");
    }
    fileUrl(filePath: string): string {
      return `https://api.telegram.org/file/bot${TOKEN}/${filePath}`;
    }
  }

  it("da la URL directa de un archivo de un trozo", async () => {
    const client = new TelegramClient(new FakeTransport(), "42");
    const url = await client.directUrl([{ file_id: "file-1", size: 10, message_id: 1 }]);

    expect(url).toBe(`https://api.telegram.org/file/bot${TOKEN}/documents/file-1.flac`);
  });

  it("no intenta reproducir en directo un archivo de varios trozos", async () => {
    const client = new TelegramClient(new FakeTransport(), "42");
    const url = await client.directUrl([
      { file_id: "file-1", size: 10, message_id: 1 },
      { file_id: "file-2", size: 5, message_id: 2 },
    ]);

    expect(url).toBeNull();
  });
});
