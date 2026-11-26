import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpTelegramTransport, TelegramError } from "../src/lib/telegram";

const TOKEN = "123456789:AAHfake-token-para-pruebas-1234567890";

const bytesOf = (size: number) => {
  const data = new Uint8Array(size);
  for (let index = 0; index < size; index += 1) data[index] = index % 251;
  return data;
};

/** Respuesta que corta la conexion despues de `dropAfter` bytes. */
function partialResponse(bytes: Uint8Array, dropAfter: number, status = 200, total = bytes.length) {
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
  const headers: Record<string, string> = { "content-length": String(bytes.length) };
  if (status === 206) headers["content-range"] = `bytes ${0}-${bytes.length - 1}/${total}`;
  return new Response(stream, { status, headers });
}

function fullResponse(bytes: Uint8Array, from = 0, total = bytes.length) {
  const slice = bytes.slice(from);
  const headers: Record<string, string> = { "content-length": String(slice.length) };
  if (from > 0) headers["content-range"] = `bytes ${from}-${total - 1}/${total}`;
  return new Response(slice, { status: from > 0 ? 206 : 200, headers });
}

const requests: { url: string; range: string | null }[] = [];

function stubFetch(handler: (range: string | null, call: number) => Response | Promise<Response>) {
  requests.length = 0;
  const fake = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const range = new Headers(init?.headers).get("range");
    requests.push({ url: String(input), range });
    return handler(range, requests.length);
  });
  vi.stubGlobal("fetch", fake);
  return fake;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("descarga de trozos", () => {
  it("reanuda con Range cuando la conexion se corta a mitad", async () => {
    const bytes = bytesOf(4096);
    stubFetch((range) => {
      if (!range) return partialResponse(bytes, 1024);
      const from = Number(/bytes=(\d+)-/.exec(range)![1]);
      return fullResponse(bytes, from);
    });

    const transport = new HttpTelegramTransport(TOKEN);
    const blob = await transport.download("documents/cancion.flac");

    expect(blob.size).toBe(4096);
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
    expect(requests).toHaveLength(2);
    expect(requests[1].range).toBe("bytes=1024-");
  });

  it("vuelve a empezar si el servidor ignora el rango", async () => {
    const bytes = bytesOf(2048);
    let attempt = 0;
    stubFetch(() => {
      attempt += 1;
      return attempt === 1 ? partialResponse(bytes, 700) : fullResponse(bytes);
    });

    const transport = new HttpTelegramTransport(TOKEN);
    const blob = await transport.download("documents/cancion.flac");

    expect(blob.size).toBe(2048);
    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
  });

  it("descarta el rango si el preflight CORS lo bloquea", async () => {
    const bytes = bytesOf(3000);
    stubFetch((range) => {
      if (range) throw new TypeError("Failed to fetch");
      return requests.length === 1 ? partialResponse(bytes, 900) : fullResponse(bytes);
    });

    const transport = new HttpTelegramTransport(TOKEN);
    const blob = await transport.download("documents/cancion.flac");

    expect(new Uint8Array(await blob.arrayBuffer())).toEqual(bytes);
    expect(requests.map((request) => request.range)).toEqual([null, "bytes=900-", null]);
  });

  it("avisa en espanol cuando la red no deja descargar", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));

    const transport = new HttpTelegramTransport(TOKEN);
    await expect(transport.download("documents/cancion.flac")).rejects.toThrow(/Se corto la conexion con Telegram/);
  });

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
