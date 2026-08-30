"use client";

import Image from "next/image";
import { useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { BitycleChart } from "./bitycle-chart";
import { TlynMarketDataProvider, type MarketHealth, type MarketSnapshot, type OrderLevel } from "./market-data";

type ChartTimeframe = "1h" | "1d";
type SessionDialogState = "idle" | "testing" | "verified" | "saving" | "saved" | "error";
type OrderbookMotionMode = "row-flash" | "depth-replay" | "depth-random";
type OrderbookMotionSpeed = "slow" | "normal" | "fast";

const faInteger = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });
const faAmount = new Intl.NumberFormat("fa-IR", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const timeframeLabels: Record<ChartTimeframe, string> = { "1h": "۱ ساعت", "1d": "۱ روز" };
const bitycleIntervals: Record<ChartTimeframe, "60" | "D"> = { "1h": "60", "1d": "D" };
const MOTION_STORAGE_KEY = "tlyn-orderbook-motion";
const MOTION_SPEED_STORAGE_KEY = "tlyn-orderbook-motion-speed";
const MOTION_COUNTER_STORAGE_KEY = "tlyn-orderbook-price-counter";
const MOTION_EVENT = "tlyn-orderbook-motion-changed";
const STAGE_WIDTH = 1_344;
const STAGE_HEIGHT = 576;
const FA_DIGITS = "۰۱۲۳۴۵۶۷۸۹";
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

function readMotionCounter() {
  return window.localStorage.getItem(MOTION_COUNTER_STORAGE_KEY) === "true";
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

function useMotionCounter() {
  return useSyncExternalStore(subscribeMotionMode, readMotionCounter, () => false);
}

function useMarketData() {
  const [provider] = useState(() => new TlynMarketDataProvider());
  const [snapshot, setSnapshot] = useState<MarketSnapshot>(() => provider.getSnapshot());
  useEffect(() => provider.subscribe(setSnapshot), [provider]);
  return snapshot;
}

function useStageScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const resize = () => setScale(Math.min(window.innerWidth / STAGE_WIDTH, window.innerHeight / STAGE_HEIGHT));
    resize();
    window.addEventListener("resize", resize, { passive: true });
    return () => window.removeEventListener("resize", resize);
  }, []);
  return scale;
}

function healthText(health: MarketHealth) {
  if (health === "live") return "داده زنده";
  if (health === "loading") return "در حال دریافت داده";
  if (health === "session-required") return "نیاز به تنظیم اتصال";
  return "آخرین داده دریافتی";
}

function MarketChart({ timeframe, lastPrice, onTimeframeChange }: { timeframe: ChartTimeframe; lastPrice: number | null; onTimeframeChange: (value: ChartTimeframe) => void }) {
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
        <BitycleChart key={timeframe} interval={bitycleIntervals[timeframe]} lastPrice={lastPrice === null ? null : lastPrice / 10} />
      </div>
    </section>
  );
}

function BookPrice({ value, className, roll, trigger }: { value: number; className: string; roll: boolean; trigger: number }) {
  const formatted = toman(value);
  if (!roll) return <span className={className}>{formatted}</span>;
  const characters = Array.from(formatted);
  return (
    <span className={`${className} odometer-price`} aria-label={formatted}>
      {characters.map((character, index) => {
        const digit = FA_DIGITS.indexOf(character);
        if (digit < 0) return <i className="book-number-separator" aria-hidden="true" key={`${character}-${index}`}>{character}</i>;
        const previous = FA_DIGITS[(digit + 9) % 10];
        const digitStyle = { "--digit-delay": `${(characters.length - index - 1) * 14}ms` } as CSSProperties;
        return (
          <i className="book-number-digit" aria-hidden="true" style={digitStyle} key={`${trigger}-${index}`}>
            <b className="book-number-strip"><em>{previous}</em><em>{character}</em></b>
          </i>
        );
      })}
    </span>
  );
}

function PairedOrderRows({ bids, asks, refreshSequence, replaySequence, randomRow, motionMode, motionSpeed, counterEnabled }: { bids: OrderLevel[]; asks: OrderLevel[]; refreshSequence: number; replaySequence: number; randomRow: number; motionMode: OrderbookMotionMode; motionSpeed: OrderbookMotionSpeed; counterEnabled: boolean }) {
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
    const refreshClass = motionMode === "row-flash"
      ? `row-flash-mode refresh-${refreshSequence % 2}`
      : motionMode === "depth-random"
        ? index === randomRow ? `depth-replay-mode replay-${replaySequence % 2}` : ""
        : `depth-replay-mode replay-${replaySequence % 2}`;
    return (
      <div
        className={`book-paired-row ${rowMotion} revision-${revision % 2} ${refreshClass}`}
        key={`${ask?.price ?? "sell-empty"}:${bid?.price ?? "buy-empty"}`}
        style={depthStyle}
        {...(bid ? { "data-bid-price": bid.price, "data-bid-amount": bid.amount } : {})}
        {...(ask ? { "data-ask-price": ask.price, "data-ask-amount": ask.amount } : {})}
      >
        {ask ? <><span className="paired-amount sell-amount">{amount(ask.amount)}</span><BookPrice value={ask.price} className="paired-price sell-price" roll={motionMode === "depth-replay" && counterEnabled} trigger={replaySequence} /></> : <><span /><span /></>}
        {bid ? <><BookPrice value={bid.price} className="paired-price buy-price" roll={motionMode === "depth-replay" && counterEnabled} trigger={replaySequence} /><span className="paired-amount buy-amount">{amount(bid.amount)}</span></> : <><span /><span /></>}
        {ask && <i className="paired-depth sell-depth" aria-hidden="true" />}
        {bid && <i className="paired-depth buy-depth" aria-hidden="true" />}
        <i className="row-refresh" aria-hidden="true" />
      </div>
    );
  });
}

function OrderBook({ snapshot, motionMode, motionSpeed, counterEnabled }: { snapshot: MarketSnapshot; motionMode: OrderbookMotionMode; motionSpeed: OrderbookMotionSpeed; counterEnabled: boolean }) {
  const [replaySequence, setReplaySequence] = useState(0);
  const [randomRow, setRandomRow] = useState(-1);
  const previousRandomRow = useRef(-1);
  const rowCount = Math.max(snapshot.bids.length, snapshot.asks.length);
  const profile = motionProfiles[motionSpeed];
  useEffect(() => {
    if (motionMode === "row-flash" || rowCount === 0) return;
    if (motionMode === "depth-replay") {
      const timer = window.setInterval(() => setReplaySequence((value) => value + 1), profile.cycle);
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
  }, [motionMode, profile, rowCount]);
  const bidVolume = snapshot.bids.reduce((sum, level) => sum + level.amount, 0);
  const askVolume = snapshot.asks.reduce((sum, level) => sum + level.amount, 0);
  const totalVolume = bidVolume + askVolume;
  const buyShare = totalVolume > 0 ? Math.round((bidVolume / totalVolume) * 100) : null;

  return (
    <aside
      className="orderbook-card"
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
        <span>مقدار فروش</span><span className="sell-price">قیمت فروش</span><span className="buy-price">قیمت خرید</span><span>مقدار خرید</span>
      </div>
      {snapshot.bids.length === 0 && snapshot.asks.length === 0
        ? <div className="book-empty">{snapshot.health === "session-required" ? "برای دریافت بازار، اتصال را از لوگوی طلاین تنظیم کنید" : "در حال دریافت دفتر سفارش‌ها…"}</div>
        : <PairedOrderRows bids={snapshot.bids} asks={snapshot.asks} refreshSequence={snapshot.refreshSequence} replaySequence={replaySequence} randomRow={randomRow} motionMode={motionMode} motionSpeed={motionSpeed} counterEnabled={counterEnabled} />}
    </aside>
  );
}

function SessionDialog({ open, motionMode, motionSpeed, counterEnabled, onMotionModeChange, onMotionSpeedChange, onCounterChange, onClose }: { open: boolean; motionMode: OrderbookMotionMode; motionSpeed: OrderbookMotionSpeed; counterEnabled: boolean; onMotionModeChange: (mode: OrderbookMotionMode) => void; onMotionSpeedChange: (speed: OrderbookMotionSpeed) => void; onCounterChange: (enabled: boolean) => void; onClose: () => void }) {
  const [cookie, setCookie] = useState("");
  const [verifiedCookie, setVerifiedCookie] = useState("");
  const [state, setState] = useState<SessionDialogState>("idle");
  const [message, setMessage] = useState("");

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
            <span><b>بازشدن عمق</b><small>بازشدن دوباره نوار عمق و فلش سفید قیمت</small></span>
          </label>
          <label htmlFor="motion-depth-random" aria-label="بازشدن تصادفی عمق">
            <input id="motion-depth-random" type="radio" name="motion-mode" checked={motionMode === "depth-random"} onChange={() => onMotionModeChange("depth-random")} />
            <span><b>عمق تصادفی</b><small>به‌روزرسانی پیوستهٔ یک ردیف با فاصلهٔ متغیر</small></span>
          </label>
        </fieldset>
        <div className="motion-controls">
          <label className="counter-setting" htmlFor="motion-price-counter" aria-label="شمارنده سریع قیمت">
            <input id="motion-price-counter" type="checkbox" checked={counterEnabled} onChange={(event) => onCounterChange(event.target.checked)} />
            <span><b>شمارنده سریع قیمت</b><small>فقط در حالت بازشدن عمق، رقم‌ها سریع به قیمت نهایی می‌رسند</small></span>
          </label>
          <label className="speed-setting" htmlFor="motion-speed">
            <span>سرعت رفرش اوردربوک</span>
            <select id="motion-speed" value={motionSpeed} onChange={(event) => onMotionSpeedChange(event.target.value as OrderbookMotionSpeed)}>
              <option value="slow">آرام</option>
              <option value="normal">متعادل</option>
              <option value="fast">سریع</option>
            </select>
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

function MarketWall() {
  const snapshot = useMarketData();
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("1h");
  const [sessionOpen, setSessionOpen] = useState(false);
  const motionMode = useMotionMode();
  const motionSpeed = useMotionSpeed();
  const counterEnabled = useMotionCounter();
  const updateMotionMode = (mode: OrderbookMotionMode) => {
    window.localStorage.setItem(MOTION_STORAGE_KEY, mode);
    window.dispatchEvent(new Event(MOTION_EVENT));
  };
  const updateMotionSpeed = (speed: OrderbookMotionSpeed) => {
    window.localStorage.setItem(MOTION_SPEED_STORAGE_KEY, speed);
    window.dispatchEvent(new Event(MOTION_EVENT));
  };
  const updateMotionCounter = (enabled: boolean) => {
    window.localStorage.setItem(MOTION_COUNTER_STORAGE_KEY, String(enabled));
    window.dispatchEvent(new Event(MOTION_EVENT));
  };
  const selectedTimeframe = Object.hasOwn(bitycleIntervals, timeframe) ? timeframe : "1h";
  return (
    <main className="market-stage" dir="rtl">
      <Header snapshot={snapshot} onOpenSession={() => setSessionOpen(true)} />
      <section className="workspace">
        <MarketChart timeframe={selectedTimeframe} lastPrice={snapshot.lastPrice} onTimeframeChange={setTimeframe} />
        <OrderBook snapshot={snapshot} motionMode={motionMode} motionSpeed={motionSpeed} counterEnabled={counterEnabled} />
      </section>
      <SessionDialog open={sessionOpen} motionMode={motionMode} motionSpeed={motionSpeed} counterEnabled={counterEnabled} onMotionModeChange={updateMotionMode} onMotionSpeedChange={updateMotionSpeed} onCounterChange={updateMotionCounter} onClose={() => setSessionOpen(false)} />
    </main>
  );
}

export default function Home() {
  const scale = useStageScale();
  return (
    <div className="stage-viewport" style={{ width: STAGE_WIDTH * scale, height: STAGE_HEIGHT * scale }}>
      <div style={{ transform: `scale(${scale})` }} className="stage-scaler">
        <div className="wall-layout">
          <MarketWall />
          <aside className="analysis-panel" aria-label="تحلیل لحظه‌ای بازار طلا">
            <iframe src="/market-analysis.html" title="تحلیل لحظه‌ای بازار طلا" />
          </aside>
        </div>
      </div>
    </div>
  );
}
