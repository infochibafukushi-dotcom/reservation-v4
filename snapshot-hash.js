export function canonicalizeForHash(value) {
  if (value === null || typeof value !== "object") {
    return value;
  }
  if (Array.isArray(value)) {
    return value.map(canonicalizeForHash);
  }
  const out = {};
  for (const key of Object.keys(value).sort()) {
    out[key] = canonicalizeForHash(value[key]);
  }
  return out;
}

async function sha256Hex(text) {
  const bytes = new TextEncoder().encode(String(text || ""));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(hash))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function hashSnapshot(snapshot) {
  return sha256Hex(JSON.stringify(canonicalizeForHash(snapshot)));
}
