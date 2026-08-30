"use client";

import { useEffect, useState } from "react";

type ResolutionMap = Record<string, number>;
type Bar = { time: number; open: number; high: number; low: number; close: number; volume?: number };
type Widget = {
  subscribe: (channel: string, handler: (payload: unknown) => unknown) => unknown;
  pushExternalData: (type: string, payload: unknown) => void;
};

declare global {
  interface Window {
    BitycleWidget?: Record<string, Widget>;
  }
}

const WIDGET_ID = "bitycle-ac-widget";
const CANDLE_URL = "/api/candles";
const RESOLUTIONS_URL = "/api/candles/resolutions";
const CHART_TIMEZONE = "Asia/Tehran";
const DATE_BASED_RESOLUTIONS = new Set(["D", "W", "M"]);
const DEFAULT_RESOLUTION_SECONDS: ResolutionMap = {
  "1": 60,
  "5": 5 * 60,
  "15": 15 * 60,
  "30": 30 * 60,
  "60": 60 * 60,
  D: 24 * 60 * 60,
  W: 7 * 24 * 60 * 60,
  M: 30 * 24 * 60 * 60,
};

function normalizeResolution(value: unknown) {
  const resolution = String(value ?? "D");
  if (resolution === "1D") return "D";
  if (resolution === "1W") return "W";
  if (resolution === "1M") return "M";
  return resolution;
}

function localOffsetSeconds(epochSeconds: number) {
  const date = new Date(epochSeconds * 1_000);
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: CHART_TIMEZONE,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(date).reduce<Record<string, string>>((result, part) => {
    result[part.type] = part.value;
    return result;
  }, {});
  const localAsUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour) % 24,
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((localAsUtc - date.getTime()) / 1_000);
}

function toChartTime(epochSeconds: number, resolution: string) {
  return DATE_BASED_RESOLUTIONS.has(normalizeResolution(resolution))
    ? epochSeconds + localOffsetSeconds(epochSeconds)
    : epochSeconds;
}

function fromChartTime(epochSeconds: number, resolution: string) {
  return DATE_BASED_RESOLUTIONS.has(normalizeResolution(resolution))
    ? epochSeconds - localOffsetSeconds(epochSeconds)
    : epochSeconds;
}

function validColumnarPayload(payload: unknown) {
  if (!payload || typeof payload !== "object") return false;
  const data = payload as Record<string, unknown>;
  if (data.s !== "ok") return false;
  const columns = [data.t, data.o, data.h, data.l, data.c];
  if (!columns.every(Array.isArray)) return false;
  const length = (data.t as unknown[]).length;
  return columns.every((column) => (column as unknown[]).length === length);
}

async function fetchBars(fromSeconds: number, toSeconds: number, resolution: string) {
  const normalized = normalizeResolution(resolution);
  const parameters = new URLSearchParams({
    from: String(Math.floor(fromSeconds)),
    to: String(Math.floor(toSeconds)),
    resolution: normalized,
  });
  const response = await fetch(`${CANDLE_URL}?${parameters}`, { cache: "no-store" });
  if (!response.ok) throw new Error("candle request failed");
  const data = await response.json() as Record<string, unknown>;
  if (data.s !== "ok") {
    const nextTime = typeof data.nextTime === "number"
      ? toChartTime(Math.floor(data.nextTime / 1_000), normalized)
      : undefined;
    return { bars: [] as Bar[], meta: { noData: true, ...(nextTime ? { nextTime } : {}) } };
  }
  if (!validColumnarPayload(data)) throw new Error("invalid candle payload");
  const times = data.t as number[];
  const opens = data.o as number[];
  const highs = data.h as number[];
  const lows = data.l as number[];
  const closes = data.c as number[];
  const volumes = Array.isArray(data.v) ? data.v as number[] : null;
  const bars = times.map((time, index) => ({
    time: toChartTime(Number(time), normalized) * 1_000,
    open: Number(opens[index]),
    high: Number(highs[index]),
    low: Number(lows[index]),
    close: Number(closes[index]),
    ...(volumes && Number.isFinite(Number(volumes[index])) ? { volume: Number(volumes[index]) } : {}),
  }));
  if (bars.some((bar) => ![bar.time, bar.open, bar.high, bar.low, bar.close].every(Number.isFinite))) {
    throw new Error("invalid candle values");
  }
  return { bars, meta: { noData: bars.length === 0 } };
}

function installExternalDatafeed(widget: Widget, resolutionSeconds: ResolutionMap, supportedResolutions: string[]) {
  const barTimers = new Map<string, ReturnType<typeof setInterval>>();
  const quoteTimers = new Map<string, ReturnType<typeof setInterval>>();
  const lastBarBySubscriber = new Map<string, Bar>();
  const lastBarByKey = new Map<string, Bar>();
  const keyFor = (ticker: string, resolution: string) => `${ticker}|${normalizeResolution(resolution)}`;
  const bucketSeconds = (resolution: string) => resolutionSeconds[normalizeResolution(resolution)] ?? 60;

  widget.subscribe("ExternalDatafeed", (payload: unknown) => {
    const envelope = payload && typeof payload === "object" && "value" in payload
      ? ((payload as { value?: Record<string, unknown> }).value ?? {})
      : {};
    const requestId = envelope.requestId;
    const method = envelope.method;
    const body = envelope.body && typeof envelope.body === "object" ? envelope.body as Record<string, unknown> : {};

    switch (method) {
      case "onReady":
        return { requestId, result: {
          supported_resolutions: supportedResolutions,
          supports_time: true,
          exchanges: [{ value: "TLYN", name: "Taline", desc: "" }],
          symbols_types: [{ name: "Gold", value: "commodity" }],
        } };
      case "searchSymbols":
        return { requestId, result: [] };
      case "resolveSymbol": {
        const name = String(body.symbolName ?? "GOLD18IRT");
        return { requestId, result: {
          name,
          ticker: name,
          description: "گرم طلای ۱۸ عیار / ریال",
          type: "commodity",
          session: "24x7",
          timezone: CHART_TIMEZONE,
          exchange: "TLYN",
          minmov: 1,
          pricescale: 1,
          has_intraday: true,
          has_no_volume: true,
          has_weekly_and_monthly: true,
          supported_resolutions: supportedResolutions,
          data_status: "streaming",
        } };
      }
      case "getServerTime":
        return { requestId, result: Math.floor(Date.now() / 1_000) };
      case "getBars": {
        const period = body.periodParams && typeof body.periodParams === "object"
          ? body.periodParams as Record<string, unknown>
          : {};
        const resolution = normalizeResolution(body.resolution ?? "D");
        const ticker = String((body.symbolInfo as { ticker?: unknown } | undefined)?.ticker ?? "GOLD18IRT");
        return fetchBars(
          fromChartTime(Number(period.from), resolution),
          fromChartTime(Number(period.to), resolution),
          resolution,
        ).then((result) => {
          const latest = result.bars.at(-1);
          if (latest) lastBarByKey.set(keyFor(ticker, resolution), latest);
          return { requestId, result };
        }).catch((error) => ({ requestId, error: error instanceof Error ? error.message : "candle request failed" }));
      }
      case "getQuotes": {
        const symbols = Array.isArray(body.symbols) ? body.symbols.map(String) : [];
        const latest = [...lastBarByKey.values()].at(-1);
        return {
          requestId,
          result: symbols.map((name) => latest
            ? { n: name, s: "ok", v: { lp: latest.close } }
            : { n: name, s: "no_data", v: {} }),
        };
      }
      case "subscribeBars": {
        const subscriberUID = String(body.subscriberUID);
        const resolution = normalizeResolution(body.resolution ?? "D");
        const ticker = String((body.symbolInfo as { ticker?: unknown } | undefined)?.ticker ?? "GOLD18IRT");
        const existing = barTimers.get(subscriberUID);
        if (existing) clearInterval(existing);
        const pollLatest = async () => {
          const now = Math.floor(Date.now() / 1_000);
          try {
            const result = await fetchBars(now - bucketSeconds(resolution) * 2, now, resolution);
            const latest = result.bars.at(-1);
            const previous = lastBarBySubscriber.get(subscriberUID);
            if (!latest || (previous && latest.time < previous.time)) return;
            lastBarBySubscriber.set(subscriberUID, latest);
            lastBarByKey.set(keyFor(ticker, resolution), latest);
            widget.pushExternalData("bar", { subscriberUID, bar: latest });
          } catch {
            // Bitycle keeps the last successful real bar on transient failures.
          }
        };
        void pollLatest();
        const interval = Math.min(60, Math.max(10, bucketSeconds(resolution))) * 1_000;
        barTimers.set(subscriberUID, setInterval(() => void pollLatest(), interval));
        return { requestId, result: { ok: true } };
      }
      case "unsubscribeBars": {
        const uid = String(body.subscriberUID);
        const timer = barTimers.get(uid);
        if (timer) clearInterval(timer);
        barTimers.delete(uid);
        lastBarBySubscriber.delete(uid);
        return { requestId, result: { ok: true } };
      }
      case "subscribeQuotes": {
        const listenerGUID = String(body.listenerGUID);
        const symbols = [...(Array.isArray(body.symbols) ? body.symbols : []), ...(Array.isArray(body.fastSymbols) ? body.fastSymbols : [])].map(String);
        const existing = quoteTimers.get(listenerGUID);
        if (existing) clearInterval(existing);
        quoteTimers.set(listenerGUID, setInterval(() => {
          const latest = [...lastBarBySubscriber.values()].at(-1) ?? [...lastBarByKey.values()].at(-1);
          if (!latest) return;
          widget.pushExternalData("quote", { listenerGUID, quotes: symbols.map((name) => ({ n: name, s: "ok", v: { lp: latest.close } })) });
        }, 5_000));
        return { requestId, result: { ok: true } };
      }
      case "unsubscribeQuotes": {
        const listenerGUID = String(body.listenerGUID);
        const timer = quoteTimers.get(listenerGUID);
        if (timer) clearInterval(timer);
        quoteTimers.delete(listenerGUID);
        return { requestId, result: { ok: true } };
      }
      default:
        return { requestId, result: null };
    }
  });

  return () => {
    barTimers.forEach((timer) => clearInterval(timer));
    quoteTimers.forEach((timer) => clearInterval(timer));
    barTimers.clear();
    quoteTimers.clear();
  };
}

export function BitycleChart({ interval }: { interval: "15" | "60" | "D" }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let disposed = false;
    let registrationTimer: ReturnType<typeof setInterval> | null = null;
    let cleanupDatafeed: (() => void) | null = null;
    const container = document.getElementById(WIDGET_ID);
    if (!container) return;
    container.replaceChildren();
    if (window.BitycleWidget?.[WIDGET_ID]) delete window.BitycleWidget[WIDGET_ID];

    const initialize = async () => {
      let resolutionSeconds = DEFAULT_RESOLUTION_SECONDS;
      let supportedResolutions = Object.keys(DEFAULT_RESOLUTION_SECONDS);
      try {
        const response = await fetch(RESOLUTIONS_URL, { cache: "no-store" });
        if (response.ok) {
          const payload = await response.json() as { resolution_seconds?: ResolutionMap; supported_resolutions?: string[] };
          if (payload.resolution_seconds && Array.isArray(payload.supported_resolutions)) {
            resolutionSeconds = payload.resolution_seconds;
            supportedResolutions = payload.supported_resolutions;
          }
        }
      } catch {
        // Resolution metadata is static configuration; candle values still only come from the real API.
      }
      if (disposed) return;

      const script = document.createElement("script");
      script.src = "https://widget.bitycle.com/static/script/v1/script.js";
      script.async = true;
      script.type = "text/javascript";
      script.textContent = JSON.stringify({
        id: WIDGET_ID,
        theme: "taline",
        type: "ac",
        locale: "fa",
        mode: "dark",
        style: "tradingview",
        datafeed_type: "external",
        symbol: "GOLD18IRT",
        source_priority: [],
        interval,
        disabled_features: [],
        enabled_features: [],
        calendar_type: "shamsi",
      });
      script.addEventListener("error", () => !disposed && setState("error"), { once: true });
      document.body.appendChild(script);

      let attempts = 0;
      registrationTimer = setInterval(() => {
        attempts += 1;
        const widget = window.BitycleWidget?.[WIDGET_ID];
        if (widget && typeof widget.subscribe === "function") {
          if (registrationTimer) clearInterval(registrationTimer);
          registrationTimer = null;
          cleanupDatafeed = installExternalDatafeed(widget, resolutionSeconds, supportedResolutions);
          setState("ready");
        } else if (attempts >= 100) {
          if (registrationTimer) clearInterval(registrationTimer);
          registrationTimer = null;
          setState("error");
        }
      }, 300);

      return script;
    };

    let scriptElement: HTMLScriptElement | undefined;
    void initialize().then((script) => { scriptElement = script; });
    return () => {
      disposed = true;
      if (registrationTimer) clearInterval(registrationTimer);
      cleanupDatafeed?.();
      scriptElement?.remove();
      if (window.BitycleWidget?.[WIDGET_ID]) delete window.BitycleWidget[WIDGET_ID];
      container.replaceChildren();
    };
  }, [interval]);

  return (
    <div className="bitycle-shell">
      <div id={WIDGET_ID} className="bitycle-widget" />
      {state !== "ready" && <div className={`chart-state ${state}`}>{state === "error" ? "دریافت نمودار در دسترس نیست" : "در حال دریافت نمودار واقعی…"}</div>}
    </div>
  );
}
