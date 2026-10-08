export type ItemCursor = {
  id: string;
  updated_at: string;
};

function toBase64Url(json: string): string {
  return Buffer.from(json, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + "=".repeat(padLen), "base64").toString("utf8");
}

export function encodeCursor(cursor: ItemCursor): string {
  return toBase64Url(JSON.stringify(cursor));
}

export function decodeCursor(value: string): ItemCursor | null {
  try {
    const parsed: unknown = JSON.parse(fromBase64Url(value));
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("id" in parsed) ||
      !("updated_at" in parsed)
    ) {
      return null;
    }
    const id = (parsed as { id: unknown }).id;
    const updated_at = (parsed as { updated_at: unknown }).updated_at;
    if (typeof id !== "string" || typeof updated_at !== "string") return null;
    return { id, updated_at };
  } catch {
    return null;
  }
}
