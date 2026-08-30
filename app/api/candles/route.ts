import { getMarketCookie } from "../../market-session";

const CANDLE_ENDPOINT = "https://my.tlyn.ir/api/v1/candle-price-chart";
const RESOLUTIONS = new Set(["1", "5", "15", "30", "60", "240", "D", "W", "M"]);
const MAX_RANGE_SECONDS = 5 * 366 * 24 * 60 * 60;
const FOUR_HOURS_SECONDS = 4 * 60 * 60;
const TEHRAN_OFFSET_SECONDS = 3.5 * 60 * 60;

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function fourHourBucket(timestamp: number) {
  return Math.floor((timestamp + TEHRAN_OFFSET_SECONDS) / FOUR_HOURS_SECONDS) * FOUR_HOURS_SECONDS - TEHRAN_OFFSET_SECONDS;
}

export function aggregateHourlyToFourHours(payload: unknown) {
  if (!payload || typeof payload !== "object") return payload;
  const source = payload as Record<string, unknown>;
  if (source.s !== "ok" || ![source.t, source.o, source.h, source.l, source.c].every(Array.isArray)) return payload;
  const times = source.t as number[];
  const opens = source.o as number[];
  const highs = source.h as number[];
  const lows = source.l as number[];
  const closes = source.c as number[];
  const volumes = Array.isArray(source.v) ? source.v as number[] : null;
  if (![opens, highs, lows, closes].every((column) => column.length === times.length)) return payload;

  const result: { t: number[]; o: number[]; h: number[]; l: number[]; c: number[]; v?: number[] } = {
    t: [], o: [], h: [], l: [], c: [], ...(volumes ? { v: [] } : {}),
  };
  let activeBucket: number | null = null;
  for (let index = 0; index < times.length; index += 1) {
    const time = Number(times[index]);
    const open = Number(opens[index]);
    const high = Number(highs[index]);
    const low = Number(lows[index]);
    const close = Number(closes[index]);
    if (![time, open, high, low, close].every(Number.isFinite)) continue;
    const bucket = fourHourBucket(time);
    const last = result.t.length - 1;
    if (activeBucket !== bucket) {
      activeBucket = bucket;
      result.t.push(bucket);
      result.o.push(open);
      result.h.push(high);
      result.l.push(low);
      result.c.push(close);
      if (volumes && result.v) result.v.push(Number(volumes[index]) || 0);
    } else {
      result.h[last] = Math.max(result.h[last], high);
      result.l[last] = Math.min(result.l[last], low);
      result.c[last] = close;
      if (volumes && result.v) result.v[last] += Number(volumes[index]) || 0;
    }
  }
  return { ...source, ...result };
}

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

  const parameters = new URLSearchParams({ from: String(from), to: String(to), resolution: resolution === "240" ? "60" : resolution });
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
    return Response.json(resolution === "240" ? aggregateHourlyToFourHours(payload) : payload, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    return Response.json({ s: "error", error: "CANDLE_UPSTREAM_UNAVAILABLE" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
