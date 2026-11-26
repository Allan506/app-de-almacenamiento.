import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HttpTelegramTransport, TelegramError } from "../src/lib/telegram";

/** Sustituye la frontera de red (XHR) para inspeccionar lo que se envia. */
class FakeXhr {
  static last: FakeXhr;
  method = "";
  url = "";
  headers: Record<string, string> = {};
  body: unknown = null;
  status = 200;
  responseText = "";
  upload: { onprogress: ((event: ProgressEvent) => void) | null } = { onprogress: null };
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  onabort: (() => void) | null = null;

  constructor() {
    FakeXhr.last = this;
  }

  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }

  setRequestHeader(key: string, value: string) {
    this.headers[key.toLowerCase()] = value;
  }

  send(body: unknown) {
    this.body = body;
    queueMicrotask(() => this.onload?.());
  }

  abort() {}
}

const original = globalThis.XMLHttpRequest;

beforeEach(() => {
  (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXhr;
});

afterEach(() => {
  (globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = original;
});

describe("HttpTelegramTransport", () => {
  it("envia las llamadas sin archivo como formulario urlencoded", async () => {
    const transport = new HttpTelegramTransport("123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw");
    FakeXhr.last = undefined as unknown as FakeXhr;
    const pending = transport.call("getMe", {});
    const xhr = FakeXhr.last;
    xhr.responseText = JSON.stringify({ ok: true, result: { id: 1, username: "nube_bot" } });
    await expect(pending).resolves.toEqual({ id: 1, username: "nube_bot" });

    // Telegram rechaza con 400 un multipart sin partes, asi que nunca debe usarse para getMe.
    expect(typeof xhr.body).toBe("string");
    expect(xhr.body).toBe("");
    expect(xhr.headers["content-type"]).toContain("application/x-www-form-urlencoded");
    expect(xhr.method).toBe("POST");
    expect(xhr.url).toContain("/bot123456789:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw/getMe");
  });

  it("codifica los parametros y sigue usando multipart al subir archivos", async () => {
    const transport = new HttpTelegramTransport("123:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw");
    const pending = transport.call("deleteMessage", { chat_id: "42", message_id: "7" });
    const form = FakeXhr.last;
    form.responseText = JSON.stringify({ ok: true, result: true });
    await pending;
    expect(String(form.body)).toBe("chat_id=42&message_id=7");

    const upload = transport.call("sendDocument", { chat_id: "42" }, { name: "a.bin", blob: new Blob(["x"]) });
    const multipart = FakeXhr.last;
    multipart.responseText = JSON.stringify({
      ok: true,
      result: { message_id: 1, document: { file_id: "f", file_size: 1 } },
    });
    await upload;
    expect(multipart.body).toBeInstanceOf(FormData);
    expect(multipart.headers["content-type"]).toBeUndefined();
  });

  it("traduce el 401 de Telegram a un mensaje accionable", async () => {
    const transport = new HttpTelegramTransport("123:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw");
    const pending = transport.call("getMe", {});
    const xhr = FakeXhr.last;
    xhr.status = 401;
    xhr.responseText = JSON.stringify({ ok: false, error_code: 401, description: "Unauthorized" });
    await expect(pending).rejects.toBeInstanceOf(TelegramError);
    await expect(pending).rejects.toThrow(/token del bot/);
  });

  it("explica una respuesta sin JSON en lugar de mostrar Error 400", async () => {
    const transport = new HttpTelegramTransport("123:AAHdqTcvCH1vGWJxfSeofSAs0K5PALDsaw");
    const pending = transport.call("getMe", {});
    const xhr = FakeXhr.last;
    xhr.status = 400;
    xhr.responseText = "";
    await expect(pending).rejects.toThrow(/sin detalle/);
  });
});
