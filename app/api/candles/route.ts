import { getMarketCookie } from "../../market-session";

const CANDLE_ENDPOINT = "https://my.tlyn.ir/api/v1/candle-price-chart";
const RESOLUTIONS = new Set(["1", "5", "15", "30", "60", "D", "W", "M"]);
const MAX_RANGE_SECONDS = 5 * 366 * 24 * 60 * 60;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const cookie = await getMarketCookie();
  if (!cookie) {
    return Response.json({ s: "error", error: "CANDLE_SESSION_UNAVAILABLE" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }

  const url = new URL(request.url);
  const from = Number(url.searchParams.get("from"));
  const to = Number(url.searchParams.get("to"));
  const resolution = url.searchParams.get("resolution") ?? "";
  if (!Number.isInteger(from) || !Number.isInteger(to) || from <= 0 || to <= from || to - from > MAX_RANGE_SECONDS || !RESOLUTIONS.has(resolution)) {
    return Response.json({ s: "error", error: "INVALID_CANDLE_QUERY" }, { status: 400, headers: { "Cache-Control": "no-store" } });
  }

  const parameters = new URLSearchParams({ from: String(from), to: String(to), resolution });
  try {
    const response = await fetch(`${CANDLE_ENDPOINT}?${parameters}`, {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(8_000),
      headers: { Accept: "application/json", Cookie: cookie },
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.includes("application/json")) {
      const status = response.status === 401 || response.status === 403 ? response.status : 502;
      return Response.json({ s: "error", error: status === 502 ? "CANDLE_UPSTREAM_ERROR" : "CANDLE_UNAUTHORIZED" }, { status, headers: { "Cache-Control": "no-store" } });
    }
    const payload = await response.json();
    return Response.json(payload, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    return Response.json({ s: "error", error: "CANDLE_UPSTREAM_UNAVAILABLE" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
