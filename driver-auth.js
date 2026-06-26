function bearerToken(request) {
  const header = request.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

export function isMeterDriverAuthorized(request, env) {
  const expected = String(env?.METER_DRIVER_TOKEN || "").trim();
  if (!expected) {
    return false;
  }
  const token = bearerToken(request);
  return Boolean(token && token === expected);
}

export function parseDriverTenantHeaders(request) {
  const franchiseeId = String(request.headers.get("X-Franchisee-Id") || "").trim();
  const storeId = String(request.headers.get("X-Store-Id") || "").trim();
  return { franchiseeId, storeId };
}
