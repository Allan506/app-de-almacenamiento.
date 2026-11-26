import { MAX_CHUNK_BYTES, MIN_CHUNK_BYTES } from "./telegram";
import { VaultDb } from "./db";
import type { VaultConfig } from "./types";

const CONFIG_KEY = "config";

export function normalizeChunkBytes(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return MAX_CHUNK_BYTES;
  return Math.min(MAX_CHUNK_BYTES, Math.max(MIN_CHUNK_BYTES, Math.round(value)));
}

export function normalizeConfig(input: VaultConfig): VaultConfig {
  const chatId = input.chat_id.trim().replace(/^@/, "");
  if (input.driver === "telegram" && (!input.bot_token.trim() || !chatId)) {
    throw new Error("Necesitas el token del bot y el chat_id");
  }
  return {
    ...input,
    driver: input.driver,
    bot_token: input.bot_token.trim(),
    chat_id: chatId,
    chunk_bytes: normalizeChunkBytes(input.chunk_bytes),
    display_name: input.display_name.trim() || "Mi nube",
  };
}

export async function readConfig(): Promise<VaultConfig | null> {
  const db = await VaultDb.open();
  try {
    return await db.getSetting<VaultConfig>(CONFIG_KEY);
  } finally {
    db.close();
  }
}

export async function writeConfig(config: VaultConfig): Promise<void> {
  const db = await VaultDb.open();
  try {
    await db.setSetting(CONFIG_KEY, config);
  } finally {
    db.close();
  }
}

export async function clearConfig(): Promise<void> {
  const db = await VaultDb.open();
  try {
    await db.deleteSetting(CONFIG_KEY);
  } finally {
    db.close();
  }
}

/** Deja el token visible solo en Ajustes, nunca en una copia de seguridad. */
export function redactConfig(config: VaultConfig): Omit<VaultConfig, "bot_token"> {
  const { bot_token: _token, ...rest } = config;
  return rest;
}
