import { zipSync, strToU8 } from "fflate";
import { describe, expect, it } from "vitest";
import {
  languageOf,
  listZipEntries,
  parseDelimited,
  parseInline,
  parseMarkdown,
  prettyJson,
  previewKindFor,
  readsAsText,
  tokenizeJson,
} from "../src/lib/preview";
import type { VaultNode } from "../src/lib/types";

function node(name: string, mime_type = "application/octet-stream", kind: "file" | "folder" = "file"): Pick<VaultNode, "name" | "mime_type" | "kind"> {
  return { name, mime_type, kind };
}

describe("previewKindFor", () => {
  it("reconoce los tipos por extension aunque el MIME sea generico", () => {
    expect(previewKindFor(node("foto.JPG"))).toBe("image");
    expect(previewKindFor(node("clip.mp4"))).toBe("video");
    expect(previewKindFor(node("cancion.mp3"))).toBe("audio");
    expect(previewKindFor(node("notas.md"))).toBe("markdown");
    expect(previewKindFor(node("datos.json"))).toBe("json");
    expect(previewKindFor(node("tabla.csv"))).toBe("csv");
    expect(previewKindFor(node("backup.zip"))).toBe("zip");
    expect(previewKindFor(node("main.ts"))).toBe("code");
    expect(previewKindFor(node("leeme.txt"))).toBe("text");
    expect(previewKindFor(node("logo.svg"))).toBe("svg");
    expect(previewKindFor(node("tesis.pdf"))).toBe("pdf");
  });

  it("usa el MIME cuando no hay extension conocida", () => {
    expect(previewKindFor(node("archivo", "image/png"))).toBe("image");
    expect(previewKindFor(node("archivo", "image/svg+xml"))).toBe("svg");
    expect(previewKindFor(node("archivo", "video/webm"))).toBe("video");
    expect(previewKindFor(node("archivo", "audio/ogg"))).toBe("audio");
    expect(previewKindFor(node("archivo", "application/pdf"))).toBe("pdf");
    expect(previewKindFor(node("archivo", "application/json"))).toBe("json");
    expect(previewKindFor(node("archivo", "text/markdown"))).toBe("markdown");
  });

  it("deja sin vista previa lo desconocido y las carpetas", () => {
    expect(previewKindFor(node("raro.bin", "application/octet-stream"))).toBe("none");
    expect(previewKindFor(node("Carpeta", "", "folder"))).toBe("none");
    expect(previewKindFor(node("modelo.psd"))).toBe("none");
  });

  it("solo lee como texto lo que es texto", () => {
    expect(readsAsText("markdown")).toBe(true);
    expect(readsAsText("csv")).toBe(true);
    expect(readsAsText("code")).toBe(true);
    expect(readsAsText("image")).toBe(false);
    expect(readsAsText("zip")).toBe(false);
  });

  it("etiqueta el lenguaje por extension", () => {
    expect(languageOf("app.py")).toBe("Python");
    expect(languageOf("styles.css")).toBe("CSS");
    expect(languageOf("desconocido.xyz")).toBe("Texto");
  });
});

describe("parseDelimited", () => {
  it("separa filas y columnas con comillas", () => {
    const table = parseDelimited('nombre,edad\n"Perez, Ana",30\nLuis,25');
    expect(table.head).toEqual(["nombre", "edad"]);
    expect(table.rows).toEqual([
      ["Perez, Ana", "30"],
      ["Luis", "25"],
    ]);
    expect(table.total).toBe(2);
    expect(table.truncated).toBe(false);
  });

  it("admite saltos de linea dentro de comillas y comillas escapadas", () => {
    const table = parseDelimited('a,b\n"linea 1\nlinea 2","dice ""hola"""');
    expect(table.rows[0]).toEqual(["linea 1\nlinea 2", 'dice "hola"']);
  });

  it("detecta tabuladores y recorta filas de mas", () => {
    const tsv = parseDelimited("a\tb\n1\t2\n3\t4", 2);
    expect(tsv.delimiter).toBe("TAB");
    expect(tsv.head).toEqual(["a", "b"]);
    expect(tsv.rows).toHaveLength(1);
    expect(tsv.truncated).toBe(true);
  });
});

describe("prettyJson", () => {
  it("formatea objetos y matrices", () => {
    const object = prettyJson('{"a":1,"b":[true,null]}');
    expect(object.ok).toBe(true);
    if (object.ok) {
      expect(object.kind).toBe("object");
      expect(object.count).toBe(2);
      expect(object.text).toContain('"a": 1');
    }
    const array = prettyJson("[1,2,3]");
    expect(array.ok && array.count).toBe(3);
  });

  it("rechaza lo que no es JSON", () => {
    expect(prettyJson("hola mundo").ok).toBe(false);
    expect(prettyJson("").ok).toBe(false);
  });

  it("colorea claves, cadenas y numeros", () => {
    const parsed = prettyJson('{"clave":"valor","n":42,"ok":false}');
    if (!parsed.ok) throw new Error("deberia ser JSON valido");
    const tokens = tokenizeJson(parsed.text);
    expect(tokens.some((token) => token.type === "key" && token.value === '"clave"')).toBe(true);
    expect(tokens.some((token) => token.type === "string" && token.value === '"valor"')).toBe(true);
    expect(tokens.some((token) => token.type === "number" && token.value === "42")).toBe(true);
    expect(tokens.some((token) => token.type === "literal" && token.value === "false")).toBe(true);
    expect(tokens.map((token) => token.value).join("")).toBe(parsed.text);
  });
});

describe("parseMarkdown", () => {
  it("separa titulos, listas, codigo y citas", () => {
    const blocks = parseMarkdown("# Titulo\n\nTexto con **negrita**.\n\n- uno\n- dos\n\n```ts\nconst a = 1;\n```\n\n> cita");
    expect(blocks[0]).toEqual({ type: "heading", level: 1, text: "Titulo" });
    expect(blocks[1]).toEqual({ type: "paragraph", text: "Texto con **negrita**." });
    expect(blocks[2]).toEqual({ type: "list", ordered: false, items: ["uno", "dos"] });
    expect(blocks[3]).toEqual({ type: "code", lang: "ts", code: "const a = 1;" });
    expect(blocks[4]).toEqual({ type: "quote", text: "cita" });
  });

  it("entiende listas numeradas y tablas", () => {
    const blocks = parseMarkdown("1. primero\n2. segundo\n\n| a | b |\n| --- | --- |\n| 1 | 2 |");
    expect(blocks[0]).toEqual({ type: "list", ordered: true, items: ["primero", "segundo"] });
    expect(blocks[1]).toEqual({ type: "table", head: ["a", "b"], rows: [["1", "2"]] });
  });

  it("formatea en linea sin romper el texto", () => {
    const tokens = parseInline("hola **mundo** y `codigo` y [enlace](https://example.com)");
    expect(tokens.map((token) => token.type)).toEqual(["text", "bold", "text", "code", "text", "link"]);
    expect(tokens[tokens.length - 1]).toEqual({ type: "link", value: "enlace", href: "https://example.com" });
  });

  it("no genera enlaces peligrosos", () => {
    const tokens = parseInline("[malo](javascript:alert(1))");
    expect(tokens.every((token) => token.type !== "link")).toBe(true);
  });
});

describe("listZipEntries", () => {
  it("lista nombres y tamanos sin descomprimir", () => {
    const zip = zipSync({
      "hola.txt": strToU8("hola mundo"),
      "carpeta/": new Uint8Array(),
      "carpeta/dentro.md": strToU8("# dentro"),
    });
    const { entries, truncated } = listZipEntries(zip);
    expect(truncated).toBe(false);
    expect(entries.map((entry) => entry.name)).toEqual(["carpeta/", "carpeta/dentro.md", "hola.txt"]);
    expect(entries.find((entry) => entry.name === "hola.txt")?.size).toBe(10);
    expect(entries.find((entry) => entry.name === "carpeta/")?.dir).toBe(true);
  });

  it("no revienta con datos que no son ZIP", () => {
    expect(listZipEntries(strToU8("no soy un zip")).entries).toEqual([]);
  });

  it("respeta el limite de entradas", () => {
    const zip = zipSync({ "a.txt": strToU8("a"), "b.txt": strToU8("b"), "c.txt": strToU8("c") });
    const { entries, truncated } = listZipEntries(zip, 2);
    expect(entries).toHaveLength(2);
    expect(truncated).toBe(true);
  });
});
