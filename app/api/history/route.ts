import type { Candle, ChartTimeframe } from "../../market-data";

const HISTORY_ENDPOINT = "https://my.tlyn.ir/api/v1/candle-price-chart";
const RESOLUTIONS: Record<ChartTimeframe, { value: string; seconds: number }> = {
  "15m": { value: "15", seconds: 15 * 60 },
  "4h": { value: "240", seconds: 4 * 60 * 60 },
  "1d": { value: "D", seconds: 24 * 60 * 60 },
};

interface ColumnarCandles {
  s?: string;
  t?: number[];
  o?: number[];
  h?: number[];
  l?: number[];
  c?: number[];
}

export const dynamic = "force-dynamic";
export const preferredRegion = "fra1";

function toCandles(payload: ColumnarCandles): Candle[] {
  if (payload.s !== "ok" || !payload.t || !payload.o || !payload.h || !payload.l || !payload.c) return [];
  const length = Math.min(payload.t.length, payload.o.length, payload.h.length, payload.l.length, payload.c.length);
  const candles: Candle[] = [];
  for (let index = 0; index < length; index += 1) {
    const candle = {
      time: Number(payload.t[index]) * 1_000,
      open: Number(payload.o[index]),
      high: Number(payload.h[index]),
      low: Number(payload.l[index]),
      close: Number(payload.c[index]),
    };
    if (Object.values(candle).every(Number.isFinite)) candles.push(candle);
  }
  return candles.slice(-90);
}

export async function GET() {
  const sessionCookie = process.env.TLYN_SESSION_COOKIE;
  if (!sessionCookie) {
    return Response.json(
      { status: false, error: "HISTORY_SESSION_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const to = Math.floor(Date.now() / 1_000);
    const entries = await Promise.all(
      (Object.entries(RESOLUTIONS) as [ChartTimeframe, (typeof RESOLUTIONS)[ChartTimeframe]][]).map(async ([timeframe, config]) => {
        const parameters = new URLSearchParams({
          from: String(to - config.seconds * 92),
          to: String(to),
          resolution: config.value,
        });
        const response = await fetch(`${HISTORY_ENDPOINT}?${parameters}`, {
          cache: "no-store",
          signal: AbortSignal.timeout(8_000),
          headers: { Accept: "application/json", Cookie: sessionCookie },
        });
        if (!response.ok) throw new Error("history upstream");
        return [timeframe, toCandles(await response.json() as ColumnarCandles)] as const;
      }),
    );

    return Response.json(
      { status: true, candles: Object.fromEntries(entries) },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch {
    return Response.json(
      { status: false, error: "HISTORY_UPSTREAM_UNAVAILABLE" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
