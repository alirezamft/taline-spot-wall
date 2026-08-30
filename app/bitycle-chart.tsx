"use client";

import { useEffect, useRef, useState } from "react";
import { clampCandleWicks, rialToToman, withLiveClose, type CandleShape } from "./candle-cleaner";

type ResolutionMap = Record<string, number>;
type Bar = CandleShape;
type Widget = {
  subscribe: (channel: string, handler: (payload: unknown) => unknown) => unknown;
  pushExternalData: (type: string, payload: unknown) => void;
  setConfig?: (patch: Record<string, unknown>) => void;
};
type Subscription = { resolution: string; ticker: string; realBar?: Bar };
type DatafeedController = { cleanup: () => void; pushLastPrice: (price: number | null) => void };

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
const CHART_OVERRIDES = {
  "paneProperties.background": "#000000",
  "paneProperties.backgroundType": "solid",
  "paneProperties.vertGridProperties.color": "#111419",
  "paneProperties.horzGridProperties.color": "#111419",
  "scalesProperties.backgroundColor": "#000000",
  "scalesProperties.lineColor": "#1a1e24",
  "scalesProperties.textColor": "#727984",
  "mainSeriesProperties.showCountdown": true,
  "mainSeriesProperties.candleStyle.upColor": "#20d6a0",
  "mainSeriesProperties.candleStyle.downColor": "#f04461",
  "mainSeriesProperties.candleStyle.borderUpColor": "#20d6a0",
  "mainSeriesProperties.candleStyle.borderDownColor": "#f04461",
  "mainSeriesProperties.candleStyle.wickUpColor": "#20d6a0",
  "mainSeriesProperties.candleStyle.wickDownColor": "#f04461",
  "mainSeriesProperties.candleStyle.drawWick": true,
  "mainSeriesProperties.candleStyle.drawBorder": true,
};
const CHART_PALETTE = {
  dark: {
    primary: "#20d6a0",
    secondary: "#f04461",
    success: "#20d6a0",
    error: "#f04461",
    text: "#727984",
    background: "#000000",
  },
  light: {
    primary: "#20d6a0",
    secondary: "#f04461",
    success: "#20d6a0",
    error: "#f04461",
    text: "#727984",
    background: "#000000",
  },
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

function isOpenCandle(bar: Bar, resolution: string, resolutionSeconds: ResolutionMap) {
  const start = fromChartTime(Math.floor(bar.time / 1_000), resolution);
  const duration = resolutionSeconds[normalizeResolution(resolution)] ?? 60;
  return Date.now() / 1_000 < start + duration;
}

function liveBar(bar: Bar, price: number | null, resolution: string, resolutionSeconds: ResolutionMap) {
  return price !== null && Number.isFinite(price) && price > 0 && isOpenCandle(bar, resolution, resolutionSeconds)
    ? withLiveClose(bar, price)
    : bar;
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
  const bars = times.map((time, index) => clampCandleWicks({
    time: toChartTime(Number(time), normalized) * 1_000,
    open: rialToToman(Number(opens[index])),
    high: rialToToman(Number(highs[index])),
    low: rialToToman(Number(lows[index])),
    close: rialToToman(Number(closes[index])),
    ...(volumes && Number.isFinite(Number(volumes[index])) ? { volume: Number(volumes[index]) } : {}),
  }));
  if (bars.some((bar) => ![bar.time, bar.open, bar.high, bar.low, bar.close].every(Number.isFinite))) {
    throw new Error("invalid candle values");
  }
  return { bars, meta: { noData: bars.length === 0 } };
}

function installExternalDatafeed(widget: Widget, resolutionSeconds: ResolutionMap, supportedResolutions: string[], initialLastPrice: number | null): DatafeedController {
  const barTimers = new Map<string, ReturnType<typeof setInterval>>();
  const quoteTimers = new Map<string, ReturnType<typeof setInterval>>();
  const subscriptions = new Map<string, Subscription>();
  const lastBarByKey = new Map<string, Bar>();
  let lastPrice = initialLastPrice;
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
          description: "گرم طلای ۱۸ عیار / تومان",
          type: "commodity",
          session: "24x7",
          timezone: CHART_TIMEZONE,
          exchange: "TLYN",
          minmov: 1,
          pricescale: 1,
          has_intraday: true,
          visible_plots_set: "ohlc",
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
          return {
            requestId,
            result: {
              ...result,
              bars: result.bars.map((bar, index) => index === result.bars.length - 1
                ? liveBar(bar, lastPrice, resolution, resolutionSeconds)
                : bar),
            },
          };
        }).catch((error) => ({ requestId, error: error instanceof Error ? error.message : "candle request failed" }));
      }
      case "getQuotes": {
        const symbols = Array.isArray(body.symbols) ? body.symbols.map(String) : [];
        const latest = [...lastBarByKey.values()].at(-1);
        return {
          requestId,
          result: symbols.map((name) => latest
            ? { n: name, s: "ok", v: { lp: lastPrice ?? latest.close } }
            : { n: name, s: "no_data", v: {} }),
        };
      }
      case "subscribeBars": {
        const subscriberUID = String(body.subscriberUID);
        const resolution = normalizeResolution(body.resolution ?? "D");
        const ticker = String((body.symbolInfo as { ticker?: unknown } | undefined)?.ticker ?? "GOLD18IRT");
        subscriptions.set(subscriberUID, { resolution, ticker });
        const existing = barTimers.get(subscriberUID);
        if (existing) clearInterval(existing);
        const pollLatest = async () => {
          const now = Math.floor(Date.now() / 1_000);
          try {
            const result = await fetchBars(now - bucketSeconds(resolution) * 2, now, resolution);
            const latest = result.bars.at(-1);
            const subscription = subscriptions.get(subscriberUID);
            const previous = subscription?.realBar;
            if (!latest || !subscription || (previous && latest.time < previous.time)) return;
            subscription.realBar = latest;
            lastBarByKey.set(keyFor(ticker, resolution), latest);
            widget.pushExternalData("bar", { subscriberUID, bar: liveBar(latest, lastPrice, resolution, resolutionSeconds) });
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
        subscriptions.delete(uid);
        return { requestId, result: { ok: true } };
      }
      case "subscribeQuotes": {
        const listenerGUID = String(body.listenerGUID);
        const symbols = [...(Array.isArray(body.symbols) ? body.symbols : []), ...(Array.isArray(body.fastSymbols) ? body.fastSymbols : [])].map(String);
        const existing = quoteTimers.get(listenerGUID);
        if (existing) clearInterval(existing);
        quoteTimers.set(listenerGUID, setInterval(() => {
          const latest = [...subscriptions.values()].map((item) => item.realBar).filter((bar): bar is Bar => Boolean(bar)).at(-1) ?? [...lastBarByKey.values()].at(-1);
          if (!latest) return;
          widget.pushExternalData("quote", { listenerGUID, quotes: symbols.map((name) => ({ n: name, s: "ok", v: { lp: lastPrice ?? latest.close } })) });
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

  return {
    pushLastPrice(price) {
      lastPrice = price;
      subscriptions.forEach((subscription, subscriberUID) => {
        if (!subscription.realBar) return;
        widget.pushExternalData("bar", {
          subscriberUID,
          bar: liveBar(subscription.realBar, lastPrice, subscription.resolution, resolutionSeconds),
        });
      });
    },
    cleanup() {
      barTimers.forEach((timer) => clearInterval(timer));
      quoteTimers.forEach((timer) => clearInterval(timer));
      barTimers.clear();
      quoteTimers.clear();
      subscriptions.clear();
    },
  };
}

export function BitycleChart({ interval, lastPrice }: { interval: "15" | "60" | "D"; lastPrice: number | null }) {
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const datafeedRef = useRef<DatafeedController | null>(null);
  const lastPriceRef = useRef(lastPrice);

  useEffect(() => {
    lastPriceRef.current = lastPrice;
    datafeedRef.current?.pushLastPrice(lastPrice);
  }, [lastPrice]);

  useEffect(() => {
    let disposed = false;
    let registrationTimer: ReturnType<typeof setInterval> | null = null;
    let datafeed: DatafeedController | null = null;
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
        "color-palette": CHART_PALETTE,
        style: "tradingview",
        chart_style: "Candle",
        datafeed_type: "external",
        symbol: "GOLD18IRT",
        source_priority: [],
        interval,
        disabled_features: [
          "header_widget",
          "left_toolbar",
          "right_toolbar",
          "control_bar",
          "timeframes_toolbar",
          "legend_widget",
          "context_menus",
          "show_exchange",
          "order_panel",
          "trading_account_manager",
          "use_localstorage_for_settings",
          "load_last_chart",
        ],
        enabled_features: ["countdown"],
        overrides: CHART_OVERRIDES,
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
          datafeed = installExternalDatafeed(widget, resolutionSeconds, supportedResolutions, lastPriceRef.current);
          datafeedRef.current = datafeed;
          widget.setConfig?.({ mode: "dark", "color-palette": CHART_PALETTE, chart_style: "Candle", overrides: CHART_OVERRIDES });
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
      datafeed?.cleanup();
      if (datafeedRef.current === datafeed) datafeedRef.current = null;
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
