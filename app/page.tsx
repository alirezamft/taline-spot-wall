"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { BitycleChart, type ChartTheme } from "./bitycle-chart";
import { TlynMarketDataProvider, type MarketHealth, type MarketSnapshot, type OrderLevel } from "./market-data";

type ChartTimeframe = "1h" | "1d";
type SessionDialogState = "idle" | "testing" | "verified" | "saving" | "saved" | "error";
type OrderbookMotionMode = "row-flash" | "depth-replay" | "depth-random";
type OrderbookMotionSpeed = "slow" | "normal" | "fast";
type NumberMotionMode = "off" | "count" | "type";

const faInteger = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });
const faAmount = new Intl.NumberFormat("fa-IR", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const timeframeLabels: Record<ChartTimeframe, string> = { "1h": "۱ ساعت", "1d": "۱ روز" };
const bitycleIntervals: Record<ChartTimeframe, "60" | "D"> = { "1h": "60", "1d": "D" };
const MOTION_STORAGE_KEY = "tlyn-orderbook-motion";
const MOTION_SPEED_STORAGE_KEY = "tlyn-orderbook-motion-speed";
const NUMBER_MOTION_STORAGE_KEY = "tlyn-orderbook-number-motion";
const LEGACY_COUNTER_STORAGE_KEY = "tlyn-orderbook-price-counter";
const PRICE_FLASH_STORAGE_KEY = "tlyn-orderbook-price-flash";
const REFRESH_SECONDS_STORAGE_KEY = "tlyn-orderbook-refresh-seconds";
const CHART_VISIBILITY_STORAGE_KEY = "tlyn-chart-visible";
const THEME_STORAGE_KEY = "tlyn-spot-theme";
const DISPLAY_HEIGHT_STORAGE_KEY = "tlyn-display-height-percent";
const MOTION_EVENT = "tlyn-orderbook-motion-changed";
const STAGE_WIDTH = 1_344;
const STAGE_HEIGHT = 576;
const MAX_RESPONSIVE_STAGE_HEIGHT = 806;
const motionProfiles = {
  slow: { cycle: 9_500, step: 360, depthDuration: 980, randomBase: 1_300, randomRange: 1_501 },
  normal: { cycle: 7_500, step: 280, depthDuration: 820, randomBase: 900, randomRange: 1_301 },
  fast: { cycle: 5_700, step: 210, depthDuration: 680, randomBase: 650, randomRange: 951 },
} satisfies Record<OrderbookMotionSpeed, { cycle: number; step: number; depthDuration: number; randomBase: number; randomRange: number }>;

const toman = (value: number | null) => value === null ? "—" : faInteger.format(value / 10);
const amount = (value: number) => faAmount.format(value);

function readMotionMode(): OrderbookMotionMode {
  const saved = window.localStorage.getItem(MOTION_STORAGE_KEY);
  return saved === "depth-replay" || saved === "depth-random" ? saved : "row-flash";
}

function readMotionSpeed(): OrderbookMotionSpeed {
  const saved = window.localStorage.getItem(MOTION_SPEED_STORAGE_KEY);
  return saved === "slow" || saved === "fast" ? saved : "normal";
}

function readNumberMotion(): NumberMotionMode {
  const saved = window.localStorage.getItem(NUMBER_MOTION_STORAGE_KEY);
  if (saved === "count" || saved === "type") return saved;
  return window.localStorage.getItem(LEGACY_COUNTER_STORAGE_KEY) === "true" ? "count" : "off";
}

function readPriceFlash() {
  return window.localStorage.getItem(PRICE_FLASH_STORAGE_KEY) !== "false";
}

function readRefreshSeconds() {
  const saved = Number(window.localStorage.getItem(REFRESH_SECONDS_STORAGE_KEY));
  return Number.isFinite(saved) && saved >= 1 && saved <= 300 ? saved : 5;
}

function readChartVisible() {
  return window.localStorage.getItem(CHART_VISIBILITY_STORAGE_KEY) !== "false";
}

function readSpotTheme(): ChartTheme {
  return window.localStorage.getItem(THEME_STORAGE_KEY) === "light" ? "light" : "dark";
}

function readDisplayHeight() {
  const saved = Number(window.localStorage.getItem(DISPLAY_HEIGHT_STORAGE_KEY));
  return Number.isFinite(saved) && saved >= 50 && saved <= 120 ? saved : 100;
}

function nextRandomPulse(rowCount: number, previousRow: number) {
  const entropy = new Uint32Array(2);
  window.crypto.getRandomValues(entropy);
  const candidate = rowCount > 1 && entropy[0] % rowCount === previousRow
    ? (previousRow + 1 + (entropy[0] % (rowCount - 1))) % rowCount
    : entropy[0] % Math.max(1, rowCount);
  return { row: candidate, wait: 900 + (entropy[1] % 1_301) };
}

function subscribeMotionMode(listener: () => void) {
  window.addEventListener("storage", listener);
  window.addEventListener(MOTION_EVENT, listener);
  return () => {
    window.removeEventListener("storage", listener);
    window.removeEventListener(MOTION_EVENT, listener);
  };
}

function useMotionMode() {
  return useSyncExternalStore<OrderbookMotionMode>(subscribeMotionMode, readMotionMode, () => "row-flash");
}

function useMotionSpeed() {
  return useSyncExternalStore<OrderbookMotionSpeed>(subscribeMotionMode, readMotionSpeed, () => "normal");
}

function useNumberMotion() {
  return useSyncExternalStore<NumberMotionMode>(subscribeMotionMode, readNumberMotion, () => "off");
}

function usePriceFlash() {
  return useSyncExternalStore(subscribeMotionMode, readPriceFlash, () => true);
}

function useRefreshSeconds() {
  return useSyncExternalStore(subscribeMotionMode, readRefreshSeconds, () => 5);
}

function useChartVisible() {
  return useSyncExternalStore(subscribeMotionMode, readChartVisible, () => true);
}

function useSpotTheme() {
  return useSyncExternalStore<ChartTheme>(subscribeMotionMode, readSpotTheme, () => "dark");
}

function useDisplayHeight() {
  return useSyncExternalStore(subscribeMotionMode, readDisplayHeight, () => 100);
}

function useMarketData(refreshSeconds: number) {
  const [provider] = useState(() => new TlynMarketDataProvider());
  const [snapshot, setSnapshot] = useState<MarketSnapshot>(() => provider.getSnapshot());
  useEffect(() => provider.setPollInterval(refreshSeconds * 1_000), [provider, refreshSeconds]);
  useEffect(() => provider.subscribe(setSnapshot), [provider]);
  return snapshot;
}

function useStageScale(heightPercent: number) {
  const [layout, setLayout] = useState({ scale: 1, logicalHeight: STAGE_HEIGHT, viewportHeight: STAGE_HEIGHT });
  useEffect(() => {
    const resize = () => {
      const scale = window.innerWidth / STAGE_WIDTH;
      const requestedHeight = window.innerHeight * (heightPercent / 100);
      const logicalHeight = Math.min(MAX_RESPONSIVE_STAGE_HEIGHT, requestedHeight / scale);
      setLayout({ scale, logicalHeight, viewportHeight: logicalHeight * scale });
    };
    resize();
    window.addEventListener("resize", resize, { passive: true });
    return () => window.removeEventListener("resize", resize);
  }, [heightPercent]);
  return layout;
}

function healthText(health: MarketHealth) {
  if (health === "live") return "داده زنده";
  if (health === "loading") return "در حال دریافت داده";
  if (health === "session-required") return "نیاز به تنظیم اتصال";
  return "آخرین داده دریافتی";
}

function MarketChart({ timeframe, lastPrice, theme, onTimeframeChange }: { timeframe: ChartTimeframe; lastPrice: number | null; theme: ChartTheme; onTimeframeChange: (value: ChartTimeframe) => void }) {
  return (
    <section className="chart-card" aria-label="نمودار واقعی بازار طلا">
      <div className="chart-toolbar">
        <div className="chart-title"><b>نمودار طلای ۱۸ عیار</b></div>
        <div className="ranges" aria-label="انتخاب بازه کندل">
          {(["1d", "1h"] as ChartTimeframe[]).map((value) => (
            <button type="button" className={timeframe === value ? "active" : ""} onClick={() => onTimeframeChange(value)} key={value}>
              {timeframeLabels[value]}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-canvas">
        <BitycleChart key={`${timeframe}-${theme}`} interval={bitycleIntervals[timeframe]} lastPrice={lastPrice === null ? null : lastPrice / 10} theme={theme} />
      </div>
    </section>
  );
}

function BookValue({ value, className, format, motion, direction, trigger, delay }: { value: number; className: string; format: (value: number) => string; motion: NumberMotionMode; direction: "buy" | "sell" | "amount"; trigger: number; delay: number }) {
  const elementRef = useRef<HTMLSpanElement>(null);
  const formatted = format(value);
  useEffect(() => {
    const element = elementRef.current;
    if (!element || motion !== "count") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      element.textContent = formatted;
      return;
    }
    const offset = direction === "amount" ? Math.max(value * 0.12, 0.001) : Math.max(value * 0.00035, 10);
    const start = direction === "sell" ? value + offset : Math.max(0, value - offset);
    const steps = 8;
    let step = 0;
    let interval = 0;
    const timeout = window.setTimeout(() => {
      element.textContent = format(start);
      interval = window.setInterval(() => {
        step += 1;
        const progress = 1 - Math.pow(1 - step / steps, 3);
        element.textContent = format(start + (value - start) * progress);
        if (step >= steps) {
          window.clearInterval(interval);
          element.textContent = formatted;
        }
      }, 42);
    }, delay);
    return () => {
      window.clearTimeout(timeout);
      window.clearInterval(interval);
      if (element) element.textContent = formatted;
    };
  }, [delay, direction, format, formatted, motion, trigger, value]);
  return <span key={`${motion}-${trigger}`} ref={elementRef} className={`${className}${motion === "type" ? " book-type-motion" : motion === "count" ? " book-count-motion" : ""}`} aria-label={formatted}>{formatted}</span>;
}

function PairedOrderRows({ bids, asks, refreshSequence, replaySequence, randomRow, motionMode, motionSpeed, numberMotion, priceFlash, wide }: { bids: OrderLevel[]; asks: OrderLevel[]; refreshSequence: number; replaySequence: number; randomRow: number; motionMode: OrderbookMotionMode; motionSpeed: OrderbookMotionSpeed; numberMotion: NumberMotionMode; priceFlash: boolean; wide: boolean }) {
  const bidMax = bids.length ? Math.max(...bids.map((row) => row.amount)) : 0;
  const askMax = asks.length ? Math.max(...asks.map((row) => row.amount)) : 0;
  const rowCount = Math.max(bids.length, asks.length);
  const profile = motionProfiles[motionSpeed];

  return Array.from({ length: rowCount }, (_, index) => {
    const ask = asks[index];
    const bid = bids[index];
    const sellDepth = ask && askMax > 0 ? ask.amount / askMax : 0;
    const buyDepth = bid && bidMax > 0 ? bid.amount / bidMax : 0;
    const rowMotion = ask?.motion === "reprice" || bid?.motion === "reprice" ? "row-reprice" : "row-volume";
    const animationDelay = motionMode === "row-flash"
      ? index * Math.round(profile.step * 0.72)
      : motionMode === "depth-random" ? 0 : index * profile.step;
    const depthStyle = {
      "--sell-depth": String(sellDepth),
      "--buy-depth": String(buyDepth),
      "--refresh-delay": `${animationDelay}ms`,
      "--depth-duration": `${profile.depthDuration}ms`,
    } as CSSProperties;
    const revision = Math.max(ask?.revision ?? 0, bid?.revision ?? 0);
    const activeNumberMotion = motionMode === "depth-replay" ? numberMotion : "off";
    const refreshClass = motionMode === "row-flash"
      ? `row-flash-mode refresh-${refreshSequence % 2}`
      : motionMode === "depth-random"
        ? index === randomRow ? `depth-replay-mode replay-${replaySequence % 2}` : ""
        : `depth-replay-mode replay-${replaySequence % 2}`;
    return (
      <div
        className={`book-paired-row ${rowMotion} revision-${revision % 2} ${refreshClass}${motionMode === "depth-replay" && priceFlash ? " price-flash-on" : ""}`}
        key={`${ask?.price ?? "sell-empty"}:${bid?.price ?? "buy-empty"}`}
        style={depthStyle}
        {...(bid ? { "data-bid-price": bid.price, "data-bid-amount": bid.amount } : {})}
        {...(ask ? { "data-ask-price": ask.price, "data-ask-amount": ask.amount } : {})}
      >
        {ask ? <>
          <BookValue value={ask.amount} className="paired-amount sell-amount" format={amount} motion={activeNumberMotion} direction="amount" trigger={replaySequence} delay={animationDelay} />
          {wide && <BookValue value={ask.price * ask.amount} className="paired-total sell-total" format={toman} motion={activeNumberMotion} direction="amount" trigger={replaySequence} delay={animationDelay} />}
          <BookValue value={ask.price} className="paired-price sell-price" format={toman} motion={activeNumberMotion} direction="sell" trigger={replaySequence} delay={animationDelay} />
        </> : Array.from({ length: wide ? 3 : 2 }, (_, emptyIndex) => <span key={`sell-empty-${emptyIndex}`} />)}
        {bid ? <>
          <BookValue value={bid.price} className="paired-price buy-price" format={toman} motion={activeNumberMotion} direction="buy" trigger={replaySequence} delay={animationDelay} />
          {wide && <BookValue value={bid.price * bid.amount} className="paired-total buy-total" format={toman} motion={activeNumberMotion} direction="amount" trigger={replaySequence} delay={animationDelay} />}
          <BookValue value={bid.amount} className="paired-amount buy-amount" format={amount} motion={activeNumberMotion} direction="amount" trigger={replaySequence} delay={animationDelay} />
        </> : Array.from({ length: wide ? 3 : 2 }, (_, emptyIndex) => <span key={`buy-empty-${emptyIndex}`} />)}
        {ask && <i className="paired-depth sell-depth" aria-hidden="true" />}
        {bid && <i className="paired-depth buy-depth" aria-hidden="true" />}
        <i className="row-refresh" aria-hidden="true" />
      </div>
    );
  });
}

function OrderBook({ snapshot, motionMode, motionSpeed, numberMotion, priceFlash, refreshSeconds, wide }: { snapshot: MarketSnapshot; motionMode: OrderbookMotionMode; motionSpeed: OrderbookMotionSpeed; numberMotion: NumberMotionMode; priceFlash: boolean; refreshSeconds: number; wide: boolean }) {
  const [replaySequence, setReplaySequence] = useState(0);
  const [randomRow, setRandomRow] = useState(-1);
  const previousRandomRow = useRef(-1);
  const rowCount = Math.max(snapshot.bids.length, snapshot.asks.length);
  const profile = motionProfiles[motionSpeed];
  useEffect(() => {
    if (motionMode === "row-flash" || rowCount === 0) return;
    if (motionMode === "depth-replay") {
      const timer = window.setInterval(() => setReplaySequence((value) => value + 1), refreshSeconds * 1_000);
      return () => window.clearInterval(timer);
    }
    let timer: number;
    const pulseOneRow = () => {
      const pulse = nextRandomPulse(rowCount, previousRandomRow.current);
      previousRandomRow.current = pulse.row;
      setRandomRow(pulse.row);
      setReplaySequence((value) => value + 1);
      const scaledWait = profile.randomBase + Math.round((pulse.wait - 900) * (profile.randomRange / 1_301));
      timer = window.setTimeout(pulseOneRow, scaledWait);
    };
    timer = window.setTimeout(pulseOneRow, 650);
    return () => window.clearTimeout(timer);
  }, [motionMode, profile, refreshSeconds, rowCount]);
  const bidVolume = snapshot.bids.reduce((sum, level) => sum + level.amount, 0);
  const askVolume = snapshot.asks.reduce((sum, level) => sum + level.amount, 0);
  const totalVolume = bidVolume + askVolume;
  const buyShare = totalVolume > 0 ? Math.round((bidVolume / totalVolume) * 100) : null;

  return (
    <aside
      className={`orderbook-card${wide ? " wide" : ""}`}
      aria-label="دفتر سفارش‌های بازار"
      data-last-price={snapshot.lastPrice ?? undefined}
      data-best-bid={snapshot.bestBid ?? undefined}
      data-best-ask={snapshot.bestAsk ?? undefined}
      data-health={snapshot.health}
    >
      <div className="book-heading">
        <div><b>دفتر سفارش‌ها</b><span>عمق بازار</span></div>
        {buyShare !== null && <div className="book-balance" aria-label="تعادل سفارش‌ها">
          <span className="buy-share">خرید {faInteger.format(buyShare)}٪</span>
          <span className="sell-share">فروش {faInteger.format(100 - buyShare)}٪</span>
        </div>}
      </div>
      <div className={`book-center ${snapshot.lastMove}`}>
        <div><b>{toman(snapshot.lastPrice)}</b><span>آخرین قیمت</span></div>
        <div><strong>{toman(snapshot.spread)}</strong><span>اختلاف بهترین قیمت خرید و فروش</span></div>
      </div>
      <div className="book-head paired-head">
        <span>مقدار فروش</span>{wide && <span>کل فروش</span>}<span className="sell-price">قیمت فروش</span><span className="buy-price">قیمت خرید</span>{wide && <span>کل خرید</span>}<span>مقدار خرید</span>
      </div>
      {snapshot.bids.length === 0 && snapshot.asks.length === 0
        ? <div className="book-empty">{snapshot.health === "session-required" ? "برای دریافت بازار، اتصال را از لوگوی طلاین تنظیم کنید" : "در حال دریافت دفتر سفارش‌ها…"}</div>
        : <PairedOrderRows bids={snapshot.bids} asks={snapshot.asks} refreshSequence={snapshot.refreshSequence} replaySequence={replaySequence} randomRow={randomRow} motionMode={motionMode} motionSpeed={motionSpeed} numberMotion={numberMotion} priceFlash={priceFlash} wide={wide} />}
    </aside>
  );
}

interface SessionDialogProps {
  open: boolean;
  motionMode: OrderbookMotionMode;
  motionSpeed: OrderbookMotionSpeed;
  numberMotion: NumberMotionMode;
  priceFlash: boolean;
  refreshSeconds: number;
  chartVisible: boolean;
  theme: ChartTheme;
  displayHeight: number;
  onMotionModeChange: (mode: OrderbookMotionMode) => void;
  onMotionSpeedChange: (speed: OrderbookMotionSpeed) => void;
  onNumberMotionChange: (mode: NumberMotionMode) => void;
  onPriceFlashChange: (enabled: boolean) => void;
  onRefreshSecondsChange: (seconds: number) => void;
  onChartVisibleChange: (enabled: boolean) => void;
  onThemeChange: (theme: ChartTheme) => void;
  onDisplayHeightChange: (percent: number) => void;
  onClose: () => void;
}

function SessionDialog({ open, motionMode, motionSpeed, numberMotion, priceFlash, refreshSeconds, chartVisible, theme, displayHeight, onMotionModeChange, onMotionSpeedChange, onNumberMotionChange, onPriceFlashChange, onRefreshSecondsChange, onChartVisibleChange, onThemeChange, onDisplayHeightChange, onClose }: SessionDialogProps) {
  const [cookie, setCookie] = useState("");
  const [verifiedCookie, setVerifiedCookie] = useState("");
  const [state, setState] = useState<SessionDialogState>("idle");
  const [message, setMessage] = useState("");
  const [refreshDraft, setRefreshDraft] = useState(String(refreshSeconds));

  const close = () => {
    if (state === "testing" || state === "saving") return;
    setCookie("");
    setVerifiedCookie("");
    setState("idle");
    setMessage("");
    onClose();
  };

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && state !== "testing" && state !== "saving") close();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  });

  if (!open) return null;

  const commitRefreshSeconds = () => {
    const parsed = Number(refreshDraft);
    const next = Number.isFinite(parsed) ? Math.min(300, Math.max(1, parsed)) : refreshSeconds;
    setRefreshDraft(String(next));
    onRefreshSecondsChange(next);
  };

  const request = async (action: "test" | "save") => {
    const candidate = cookie.trim();
    if (!candidate) {
      setState("error");
      setMessage("کوکی را وارد کنید.");
      return;
    }
    setState(action === "test" ? "testing" : "saving");
    setMessage("");
    try {
      const response = await fetch("/api/market-session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, cookie: candidate }),
      });
      const result = await response.json() as { ok?: boolean; upstreamStatus?: number };
      if (!response.ok || !result.ok) {
        setState("error");
        setVerifiedCookie("");
        setMessage(result.upstreamStatus ? `اتصال تأیید نشد؛ پاسخ API: ${faInteger.format(result.upstreamStatus)}` : "اتصال به API برقرار نشد.");
        return;
      }
      if (action === "test") {
        setVerifiedCookie(candidate);
        setState("verified");
        setMessage("اتصال تأیید شد؛ پاسخ API: ۲۰۰");
      } else {
        setState("saved");
        setMessage("کوکی جدید ذخیره و فعال شد.");
        window.dispatchEvent(new Event("tlyn-session-updated"));
        window.setTimeout(close, 700);
      }
    } catch {
      setState("error");
      setVerifiedCookie("");
      setMessage("اتصال به API برقرار نشد.");
    }
  };

  return (
    <div className="session-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && close()}>
      <section className="session-dialog" role="dialog" aria-modal="true" aria-labelledby="session-title">
        <div className="session-dialog-title">
          <div><strong id="session-title">تنظیم اتصال داده</strong><span>کوکی دسترسی API طلاین</span></div>
          <button type="button" onClick={close} aria-label="بستن">×</button>
        </div>
        <label htmlFor="market-cookie">Cookie</label>
        <textarea
          id="market-cookie"
          dir="ltr"
          value={cookie}
          onChange={(event) => {
            setCookie(event.target.value);
            setVerifiedCookie("");
            setState("idle");
            setMessage("");
          }}
          placeholder="apptlynir_session=..."
          autoComplete="off"
          spellCheck={false}
          maxLength={12_000}
        />
        <fieldset className="motion-settings">
          <legend>نمایش به‌روزرسانی اوردربوک</legend>
          <label htmlFor="motion-row-flash" aria-label="فلش ردیف">
            <input id="motion-row-flash" type="radio" name="motion-mode" checked={motionMode === "row-flash"} onChange={() => onMotionModeChange("row-flash")} />
            <span><b>فلش ردیف</b><small>روشن‌شدن ملایم کل ردیف‌ها به‌ترتیب</small></span>
          </label>
          <label htmlFor="motion-depth-replay" aria-label="بازشدن عمق">
            <input id="motion-depth-replay" type="radio" name="motion-mode" checked={motionMode === "depth-replay"} onChange={() => onMotionModeChange("depth-replay")} />
            <span><b>بازشدن عمق</b><small>بازشدن مرتب نوار عمق؛ موشن عدد و فلش قابل تنظیم است</small></span>
          </label>
          <label htmlFor="motion-depth-random" aria-label="بازشدن تصادفی عمق">
            <input id="motion-depth-random" type="radio" name="motion-mode" checked={motionMode === "depth-random"} onChange={() => onMotionModeChange("depth-random")} />
            <span><b>عمق تصادفی</b><small>به‌روزرسانی پیوستهٔ یک ردیف با فاصلهٔ متغیر</small></span>
          </label>
        </fieldset>
        <div className="motion-controls">
          <label className="speed-setting" htmlFor="number-motion">
            <span>ورود قیمت و مقدار در حالت ۲</span>
            <select id="number-motion" value={numberMotion} onChange={(event) => onNumberMotionChange(event.target.value as NumberMotionMode)}>
              <option value="off">بدون موشن</option>
              <option value="count">شمارنده تا عدد نهایی</option>
              <option value="type">تایپ عدد نهایی</option>
            </select>
          </label>
          <label className="speed-setting" htmlFor="motion-speed">
            <span>سرعت اجرای ردیف‌ها</span>
            <select id="motion-speed" value={motionSpeed} onChange={(event) => onMotionSpeedChange(event.target.value as OrderbookMotionSpeed)}>
              <option value="slow">آرام</option>
              <option value="normal">متعادل</option>
              <option value="fast">سریع</option>
            </select>
          </label>
          <label className="counter-setting" htmlFor="motion-price-flash" aria-label="فلش قیمت در حالت ۲">
            <input id="motion-price-flash" type="checkbox" checked={priceFlash} onChange={(event) => onPriceFlashChange(event.target.checked)} />
            <span><b>فلش قیمت در حالت ۲</b><small>روشن یا خاموش‌کردن تأکید رنگی قیمت هنگام لود</small></span>
          </label>
          <label className="speed-setting" htmlFor="refresh-seconds">
            <span>بازه دریافت و رفرش (ثانیه)</span>
            <input id="refresh-seconds" type="number" inputMode="decimal" min="1" max="300" step="1" value={refreshDraft} onChange={(event) => setRefreshDraft(event.target.value)} onBlur={commitRefreshSeconds} onKeyDown={(event) => event.key === "Enter" && commitRefreshSeconds()} />
          </label>
          <label className="counter-setting" htmlFor="chart-visible" aria-label="نمایش نمودار">
            <input id="chart-visible" type="checkbox" checked={chartVisible} onChange={(event) => onChartVisibleChange(event.target.checked)} />
            <span><b>نمایش نمودار</b><small>در حالت خاموش، اوردربوک تمام‌عرض و سه‌ستونه می‌شود</small></span>
          </label>
          <label className="speed-setting" htmlFor="spot-theme">
            <span>تم بخش اسپات</span>
            <select id="spot-theme" value={theme} onChange={(event) => onThemeChange(event.target.value as ChartTheme)}>
              <option value="dark">تیره</option>
              <option value="light">روشن</option>
            </select>
          </label>
          <label className="speed-setting" htmlFor="display-height">
            <span>ارتفاع نمایشگر (درصد)</span>
            <input id="display-height" type="number" min="50" max="120" step="1" value={displayHeight} onChange={(event) => onDisplayHeightChange(Math.min(120, Math.max(50, Number(event.target.value) || 100)))} />
          </label>
        </div>
        <p className={`session-message ${state}`}>{message || "ابتدا اتصال را تست کنید؛ سپس ذخیره فعال می‌شود."}</p>
        <div className="session-actions">
          <button type="button" className="secondary" onClick={close}>انصراف</button>
          <button type="button" className="secondary" disabled={state === "testing" || state === "saving"} onClick={() => void request("test")}>
            {state === "testing" ? "در حال تست…" : "تست اتصال"}
          </button>
          <button type="button" className="primary" disabled={verifiedCookie !== cookie.trim() || state === "saving"} onClick={() => void request("save")}>
            {state === "saving" ? "در حال ذخیره…" : "تأیید و ذخیره"}
          </button>
        </div>
      </section>
    </div>
  );
}

function Header({ snapshot, onOpenSession }: { snapshot: MarketSnapshot; onOpenSession: () => void }) {
  const metrics = [
    { label: "بیشترین ۲۴ ساعت", value: toman(snapshot.high24h) },
    { label: "کمترین ۲۴ ساعت", value: toman(snapshot.low24h) },
    { label: "بهترین خرید", value: toman(snapshot.bestBid), tone: "positive" },
    { label: "بهترین فروش", value: toman(snapshot.bestAsk), tone: "negative" },
    { label: "اختلاف قیمت", value: toman(snapshot.spread) },
  ];
  const priceTone = snapshot.lastMove === "buy" ? "positive" : snapshot.lastMove === "sell" ? "negative" : "";
  return (
    <header className="market-header">
      <section className="identity">
        <button className="identity-trigger" type="button" onClick={onOpenSession} aria-label="تنظیم اتصال داده">
          <Image src="/taline-logo.png" alt="لوگوی طلاین" width={43} height={43} priority />
        </button>
        <div><strong>طلاین</strong><small dir="ltr">GOLD18IRT · SPOT</small></div>
      </section>
      <section className="headline-price">
        <span>آخرین قیمت <small>تومان</small></span>
        <strong className={`price-number ${priceTone}`}>{toman(snapshot.lastPrice)}</strong>
        <small className={`health-copy ${snapshot.health}`}>{healthText(snapshot.health)}</small>
      </section>
      {metrics.map((metric) => (
        <section className="metric" key={metric.label}>
          <span>{metric.label}</span>
          <strong className={metric.tone ?? ""}>{metric.value}</strong>
        </section>
      ))}
    </header>
  );
}

function MarketWall({ displayHeight }: { displayHeight: number }) {
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("1d");
  const [sessionOpen, setSessionOpen] = useState(false);
  const motionMode = useMotionMode();
  const motionSpeed = useMotionSpeed();
  const numberMotion = useNumberMotion();
  const priceFlash = usePriceFlash();
  const refreshSeconds = useRefreshSeconds();
  const chartVisible = useChartVisible();
  const theme = useSpotTheme();
  const snapshot = useMarketData(refreshSeconds);
  const updateStoredSetting = (key: string, value: string) => {
    window.localStorage.setItem(key, value);
    window.dispatchEvent(new Event(MOTION_EVENT));
  };
  const updateMotionMode = (mode: OrderbookMotionMode) => {
    updateStoredSetting(MOTION_STORAGE_KEY, mode);
  };
  const updateMotionSpeed = (speed: OrderbookMotionSpeed) => {
    updateStoredSetting(MOTION_SPEED_STORAGE_KEY, speed);
  };
  const updateNumberMotion = (mode: NumberMotionMode) => {
    window.localStorage.removeItem(LEGACY_COUNTER_STORAGE_KEY);
    updateStoredSetting(NUMBER_MOTION_STORAGE_KEY, mode);
  };
  const selectedTimeframe = Object.hasOwn(bitycleIntervals, timeframe) ? timeframe : "1d";
  return (
    <main className="market-stage" data-theme={theme} dir="rtl">
      <Header snapshot={snapshot} onOpenSession={() => setSessionOpen(true)} />
      <section className={`workspace${chartVisible ? "" : " chart-hidden"}`}>
        {chartVisible && <MarketChart timeframe={selectedTimeframe} lastPrice={snapshot.lastPrice} theme={theme} onTimeframeChange={setTimeframe} />}
        <OrderBook snapshot={snapshot} motionMode={motionMode} motionSpeed={motionSpeed} numberMotion={numberMotion} priceFlash={priceFlash} refreshSeconds={refreshSeconds} wide={!chartVisible} />
      </section>
      <SessionDialog
        open={sessionOpen}
        motionMode={motionMode}
        motionSpeed={motionSpeed}
        numberMotion={numberMotion}
        priceFlash={priceFlash}
        refreshSeconds={refreshSeconds}
        chartVisible={chartVisible}
        theme={theme}
        displayHeight={displayHeight}
        onMotionModeChange={updateMotionMode}
        onMotionSpeedChange={updateMotionSpeed}
        onNumberMotionChange={updateNumberMotion}
        onPriceFlashChange={(enabled) => updateStoredSetting(PRICE_FLASH_STORAGE_KEY, String(enabled))}
        onRefreshSecondsChange={(seconds) => updateStoredSetting(REFRESH_SECONDS_STORAGE_KEY, String(seconds))}
        onChartVisibleChange={(enabled) => updateStoredSetting(CHART_VISIBILITY_STORAGE_KEY, String(enabled))}
        onThemeChange={(nextTheme) => updateStoredSetting(THEME_STORAGE_KEY, nextTheme)}
        onDisplayHeightChange={(percent) => updateStoredSetting(DISPLAY_HEIGHT_STORAGE_KEY, String(percent))}
        onClose={() => setSessionOpen(false)}
      />
    </main>
  );
}

export default function Home() {
  const displayHeight = useDisplayHeight();
  const { scale, logicalHeight, viewportHeight } = useStageScale(displayHeight);
  const scalerStyle = { transform: `scale(${scale})`, "--stage-height": `${logicalHeight}px` } as CSSProperties;
  return (
    <div className="stage-viewport" style={{ width: STAGE_WIDTH * scale, height: viewportHeight }}>
      <div style={scalerStyle} className="stage-scaler">
        <div className="wall-layout">
          <MarketWall displayHeight={displayHeight} />
          <aside className="analysis-panel" aria-label="تحلیل لحظه‌ای بازار طلا">
            <iframe src="/market-analysis.html" title="تحلیل لحظه‌ای بازار طلا" />
          </aside>
        </div>
      </div>
    </div>
  );
}
