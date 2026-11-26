import { describe, expect, it } from "vitest";
import {
  MAX_CHUNK_BYTES,
  TelegramClient,
  partFileName,
  planChunks,
  type Progress,
  type TelegramFile,
  type TelegramTransport,
} from "../src/lib/telegram";

class FakeTelegram implements TelegramTransport {
  documents = new Map<string, Blob>();
  calls: { method: string; payload: Record<string, string> }[] = [];
  deleted: number[] = [];
  failOnChunk?: number;
  uploaded = 0;
  downloadBytes = 0;

  async call<T>(
    method: string,
    payload: Record<string, string>,
    file?: TelegramFile,
    onProgress?: Progress,
  ): Promise<T> {
    this.calls.push({ method, payload });
    switch (method) {
      case "getMe":
        return { id: 1, username: "nube_bot" } as T;
      case "getChat":
        return { id: Number(payload.chat_id), type: "private", first_name: "Ana" } as T;
      case "sendDocument": {
        this.uploaded += 1;
        if (this.failOnChunk === this.uploaded) throw new Error("fallo simulado de red");
        const id = `file-${this.documents.size + 1}`;
        this.documents.set(id, file!.blob);
        onProgress?.(file!.blob.size, file!.blob.size);
        return {
          message_id: this.documents.size,
          document: { file_id: id, file_size: file!.blob.size },
        } as T;
      }
      case "getFile":
        return { file_path: `documents/${payload.file_id}` } as T;
      case "deleteMessage":
        this.deleted.push(Number(payload.message_id));
        return true as T;
      default:
        throw new Error(`metodo no esperado: ${method}`);
    }
  }

  async download(filePath: string): Promise<Blob> {
    const blob = this.documents.get(filePath.split("/").pop()!);
    if (!blob) throw new Error("archivo desconocido");
    this.downloadBytes += blob.size;
    return blob;
  }
}

const makePayload = (bytes: number) => {
  const data = new Uint8Array(bytes);
  for (let index = 0; index < bytes; index += 1) data[index] = index % 251;
  return new Blob([data]);
};

describe("planChunks", () => {
  it("trocea exacto y respeta el ultimo trozo parcial", () => {
    expect(planChunks(45, 20)).toEqual([
      { start: 0, end: 20 },
      { start: 20, end: 40 },
      { start: 40, end: 45 },
    ]);
    expect(planChunks(40, 20)).toHaveLength(2);
    expect(planChunks(0, 20)).toEqual([]);
  });

  it("nunca supera el limite de la Bot API", () => {
    const plans = planChunks(MAX_CHUNK_BYTES * 2 + 1, MAX_CHUNK_BYTES * 4);
    expect(plans).toHaveLength(3);
    expect(plans[0].end - plans[0].start).toBe(MAX_CHUNK_BYTES);
  });
});

describe("TelegramClient", () => {
  it("verifica el bot y el chat configurados", async () => {
    const client = new TelegramClient(new FakeTelegram(), "42");
    await expect(client.verify()).resolves.toEqual({
      bot: { id: 1, username: "nube_bot" },
      chat: { id: 42, type: "private", first_name: "Ana" },
    });
  });

  it("sube en trozos y reensambla los bytes en orden", async () => {
    const transport = new FakeTelegram();
    const client = new TelegramClient(transport, "42", 19 * 1024 * 1024);
    const source = makePayload(45 * 1024 * 1024);
    const progress: number[] = [];
    const chunks = await client.upload(source, "copia.bin", (loaded) => progress.push(loaded));

    expect(chunks).toHaveLength(3);
    expect(chunks.map((chunk) => chunk.size)).toEqual([19 * 1024 * 1024, 19 * 1024 * 1024, 7 * 1024 * 1024]);
    expect(progress.at(-1)).toBe(source.size);

    const restored = await client.download(chunks);
    expect(restored.size).toBe(source.size);
    const [a, b] = await Promise.all([restored.arrayBuffer(), source.arrayBuffer()]);
    expect(new Uint8Array(a).slice(-64)).toEqual(new Uint8Array(b).slice(-64));
    expect(transport.downloadBytes).toBe(source.size);
  });

  it("no manda mensajes para archivos vacios y devuelve un blob vacio", async () => {
    const transport = new FakeTelegram();
    const client = new TelegramClient(transport, "42");
    const chunks = await client.upload(new Blob([]), "vacio.txt");
    expect(chunks).toEqual([]);
    expect(transport.calls).toHaveLength(0);
    const blob = await client.download([]);
    expect(blob.size).toBe(0);
  });

  it("borra los mensajes de cada trozo", async () => {
    const transport = new FakeTelegram();
    const client = new TelegramClient(transport, "42", 1);
    const chunks = await client.upload(makePayload(3), "tres.bin");
    expect(chunks).toHaveLength(3);
    await expect(client.remove(chunks)).resolves.toBe(3);
    expect(transport.deleted).toHaveLength(3);
  });

  it("limpia los trozos ya subidos cuando falla uno intermedio", async () => {
    const transport = new FakeTelegram();
    transport.failOnChunk = 2;
    const client = new TelegramClient(transport, "42", 1);
    await expect(client.upload(makePayload(5), "fallo.bin")).rejects.toThrow("fallo simulado de red");
    expect(transport.deleted).toEqual([1]);
    expect(transport.documents.size).toBe(1);
  });

  it("respeta la cancelacion antes de empezar el siguiente trozo", async () => {
    const transport = new FakeTelegram();
    const client = new TelegramClient(transport, "42", 1);
    const controller = new AbortController();
    controller.abort();
    await expect(client.upload(makePayload(4), "cancelado.bin", undefined, controller.signal)).rejects.toThrow(
      "cancelada",
    );
    expect(transport.uploaded).toBe(0);
  });
});

describe("partFileName", () => {
  it("mantiene la extension y numera las partes", () => {
    expect(partFileName("informe final.pdf", 0, 3)).toBe("informe final.0001-0003.pdf");
    expect(partFileName("sin-extension", 1, 2)).toBe("sin-extension.0002-0002");
    expect(partFileName("raro/*.tar.gz", 0, 1)).toBe("raro_.tar.0001-0001.gz");
  });
});
