import "server-only";

import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

const ORDERBOOK_ENDPOINT = "https://my.tlyn.ir/api/v1/orders/data";
const RUNTIME_DIRECTORY = path.join(process.cwd(), ".runtime");
const SESSION_FILE = path.join(RUNTIME_DIRECTORY, "market-session.json");

let cachedCookie: string | null | undefined;

export function normalizeMarketCookie(value: unknown) {
  if (typeof value !== "string") return null;
  const trimmed = value.replace(/^cookie:\s*/i, "").trim();
  if (trimmed.length < 12 || trimmed.length > 12_000 || /[\r\n]/.test(trimmed)) return null;
  return trimmed.includes("=") ? trimmed : `apptlynir_session=${trimmed}`;
}

async function readPersistedCookie() {
  try {
    const payload = JSON.parse(await readFile(SESSION_FILE, "utf8")) as { cookie?: unknown };
    return normalizeMarketCookie(payload.cookie);
  } catch {
    return null;
  }
}

export async function getMarketCookie() {
  if (cachedCookie !== undefined) return cachedCookie;
  cachedCookie = await readPersistedCookie() ?? normalizeMarketCookie(process.env.TLYN_SESSION_COOKIE);
  return cachedCookie;
}

export async function saveMarketCookie(value: unknown) {
  const cookie = normalizeMarketCookie(value);
  if (!cookie) return false;
  await mkdir(RUNTIME_DIRECTORY, { recursive: true, mode: 0o700 });
  const temporaryFile = `${SESSION_FILE}.next`;
  await writeFile(temporaryFile, JSON.stringify({ cookie }), { encoding: "utf8", mode: 0o600 });
  await rename(temporaryFile, SESSION_FILE);
  cachedCookie = cookie;
  return true;
}

export async function testMarketCookie(value: unknown) {
  const cookie = normalizeMarketCookie(value);
  if (!cookie) return { ok: false, upstreamStatus: 0, error: "INVALID_COOKIE" } as const;

  try {
    const response = await fetch(ORDERBOOK_ENDPOINT, {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(5_000),
      headers: { Accept: "application/json", Cookie: cookie },
    });
    const contentType = response.headers.get("content-type") ?? "";
    const payload = response.status === 200 && contentType.includes("application/json")
      ? await response.json().catch(() => null)
      : null;
    return {
      ok: response.status === 200 && payload?.status === true,
      upstreamStatus: response.status,
      error: response.status === 401 || response.status === 403 ? "UNAUTHORIZED" : undefined,
    } as const;
  } catch {
    return { ok: false, upstreamStatus: 0, error: "UPSTREAM_UNAVAILABLE" } as const;
  }
}
