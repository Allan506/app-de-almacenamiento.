import { HttpTelegramTransport, TelegramClient } from "./telegram";
import type { Vault } from "./library";
import type { VaultConfig, VaultNode } from "./types";

export type Check = { name: string; ok: boolean; detail: string };

const fail = (cause: unknown) => (cause instanceof Error ? cause.message : String(cause));

/** Comprueba token, chat, descarga y reproduccion directa para saber donde falla la nube. */
export async function diagnose(config: VaultConfig, sample: VaultNode | null): Promise<Check[]> {
  const checks: Check[] = [];
  if (config.driver !== "telegram") {
    return [{ name: "Espacio", ok: true, detail: "modo local, sin Telegram" }];
  }

  const transport = new HttpTelegramTransport(config.bot_token);
  const client = new TelegramClient(transport, config.chat_id);

  try {
    const bot = await client.verifyBot();
    checks.push({ name: "Token del bot", ok: true, detail: `@${bot.username ?? bot.first_name}` });
  } catch (cause) {
    checks.push({ name: "Token del bot", ok: false, detail: fail(cause) });
    return checks;
  }

  try {
    const chat = await client.verifyChat();
    checks.push({ name: "Chat de destino", ok: true, detail: `#${chat.id} ${chat.first_name ?? ""}`.trim() });
  } catch (cause) {
    checks.push({ name: "Chat de destino", ok: false, detail: fail(cause) });
  }

  if (!sample || !sample.chunks.length) {
    checks.push({ name: "Archivo de prueba", ok: false, detail: "no hay archivos con contenido" });
    return checks;
  }

  let url: string | null = null;
  try {
    const info = await transport.call<{ file_path: string }>("getFile", { file_id: sample.chunks[0].file_id });
    url = info.file_path ? transport.fileUrl(info.file_path) : null;
    checks.push({
      name: "Referencia del archivo",
      ok: Boolean(url),
      detail: url ? `${sample.name} · ${info.file_path}` : "Telegram no devolvio la ruta",
    });
  } catch (cause) {
    checks.push({ name: "Referencia del archivo", ok: false, detail: fail(cause) });
  }
  if (!url) return checks;

  const started = performance.now();
  try {
    const response = await fetch(url);
    const length = response.headers.get("content-length") ?? "?";
    let first = 0;
    if (response.body) {
      const reader = response.body.getReader();
      const chunk = await reader.read();
      first = chunk.value?.length ?? 0;
      await reader.cancel();
    }
    checks.push({
      name: "Descarga desde el navegador",
      ok: response.ok && response.type !== "opaque" && first > 0,
      detail: `HTTP ${response.status} · tipo ${response.type} · ${length} B · ${Math.round(performance.now() - started)} ms · leidos ${first} B`,
    });
  } catch (cause) {
    checks.push({
      name: "Descarga desde el navegador",
      ok: false,
      detail: `${fail(cause)} (${Math.round(performance.now() - started)} ms)`,
    });
  }

  checks.push(await playCheck(url));
  return checks;
}

function playCheck(url: string): Promise<Check> {
  return new Promise((resolve) => {
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    const done = (check: Check) => {
      audio.removeAttribute("src");
      audio.load();
      resolve(check);
    };
    const timer = window.setTimeout(() => done({ name: "Reproduccion directa", ok: false, detail: "sin respuesta en 12 s" }), 12000);
    audio.onloadedmetadata = () => {
      window.clearTimeout(timer);
      done({
        name: "Reproduccion directa",
        ok: Number.isFinite(audio.duration),
        detail: `duracion ${audio.duration.toFixed(1)} s`,
      });
    };
    audio.onerror = () => {
      window.clearTimeout(timer);
      const code = audio.error?.code ?? 0;
      const reason = ["", "cancelado", "error de red", "no se puede decodificar", "formato no soportado"][code] ?? `codigo ${code}`;
      done({ name: "Reproduccion directa", ok: false, detail: reason });
    };
    audio.src = url;
  });
}

export function reportText(checks: Check[], config: VaultConfig): string {
  const lines = checks.map((check) => `${check.ok ? "OK " : "FALLA"} ${check.name}: ${check.detail}`);
  lines.push(`navegador: ${navigator.userAgent}`);
  lines.push(`espacio: ${config.driver} · trozos de ${Math.round(config.chunk_bytes / (1024 * 1024))} MB`);
  return lines.join("\n");
}

export async function diagnoseVault(vault: Vault, config: VaultConfig): Promise<Check[]> {
  const nodes = await vault.nodes();
  const files = nodes.filter((node) => node.kind === "file" && node.chunks.length > 0);
  files.sort((left, right) => left.size - right.size);
  return diagnose(config, files[0] ?? null);
}
