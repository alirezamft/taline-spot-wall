"use client";

import Image from "next/image";
import { useEffect, useState, type CSSProperties } from "react";
import { BitycleChart } from "./bitycle-chart";
import { TlynMarketDataProvider, type MarketHealth, type MarketSnapshot, type OrderLevel } from "./market-data";

type ChartTimeframe = "15m" | "1h" | "1d";
type SessionDialogState = "idle" | "testing" | "verified" | "saving" | "saved" | "error";

const faInteger = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });
const faAmount = new Intl.NumberFormat("fa-IR", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const timeframeLabels: Record<ChartTimeframe, string> = { "15m": "۱۵ دقیقه", "1h": "۱ ساعت", "1d": "۱ روز" };
const bitycleIntervals: Record<ChartTimeframe, "15" | "60" | "D"> = { "15m": "15", "1h": "60", "1d": "D" };

const toman = (value: number | null) => value === null ? "—" : faInteger.format(value / 10);
const amount = (value: number) => faAmount.format(value);

function useMarketData() {
  const [provider] = useState(() => new TlynMarketDataProvider());
  const [snapshot, setSnapshot] = useState<MarketSnapshot>(() => provider.getSnapshot());
  useEffect(() => provider.subscribe(setSnapshot), [provider]);
  return snapshot;
}

function useStageScale() {
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const resize = () => setScale(Math.min(window.innerWidth / 960, window.innerHeight / 576));
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

function MarketChart({ timeframe, onTimeframeChange }: { timeframe: ChartTimeframe; onTimeframeChange: (value: ChartTimeframe) => void }) {
  return (
    <section className="chart-card" aria-label="نمودار واقعی بازار طلا">
      <div className="chart-toolbar">
        <div className="chart-title">
          <b>نمودار طلای ۱۸ عیار</b>
          <span dir="ltr">GOLD18IRT · BITYCLE</span>
        </div>
        <div className="ranges" aria-label="انتخاب بازه کندل">
          {(["1d", "1h", "15m"] as ChartTimeframe[]).map((value) => (
            <button type="button" className={timeframe === value ? "active" : ""} onClick={() => onTimeframeChange(value)} key={value}>
              {timeframeLabels[value]}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-canvas">
        <BitycleChart key={timeframe} interval={bitycleIntervals[timeframe]} />
      </div>
    </section>
  );
}

function PairedOrderRows({ bids, asks, refreshSequence }: { bids: OrderLevel[]; asks: OrderLevel[]; refreshSequence: number }) {
  const bidMax = bids.length ? Math.max(...bids.map((row) => row.amount)) : 0;
  const askMax = asks.length ? Math.max(...asks.map((row) => row.amount)) : 0;
  const rowCount = Math.max(bids.length, asks.length);

  return Array.from({ length: rowCount }, (_, index) => {
    const ask = asks[index];
    const bid = bids[index];
    const sellDepth = ask && askMax > 0 ? ask.amount / askMax : 0;
    const buyDepth = bid && bidMax > 0 ? bid.amount / bidMax : 0;
    const rowMotion = ask?.motion === "reprice" || bid?.motion === "reprice" ? "row-reprice" : "row-volume";
    const depthStyle = {
      "--sell-depth": String(sellDepth),
      "--buy-depth": String(buyDepth),
      "--refresh-delay": `${index * 200}ms`,
    } as CSSProperties;
    const revision = Math.max(ask?.revision ?? 0, bid?.revision ?? 0);
    return (
      <div
        className={`book-paired-row ${rowMotion} revision-${revision % 2} refresh-${refreshSequence % 2}`}
        key={`${ask?.price ?? "sell-empty"}:${bid?.price ?? "buy-empty"}`}
        style={depthStyle}
        {...(bid ? { "data-bid-price": bid.price, "data-bid-amount": bid.amount } : {})}
        {...(ask ? { "data-ask-price": ask.price, "data-ask-amount": ask.amount } : {})}
      >
        {ask ? <><span className="paired-amount sell-amount">{amount(ask.amount)}</span><span className="paired-price sell-price">{toman(ask.price)}</span></> : <><span /><span /></>}
        {bid ? <><span className="paired-price buy-price">{toman(bid.price)}</span><span className="paired-amount buy-amount">{amount(bid.amount)}</span></> : <><span /><span /></>}
        {ask && <i className="paired-depth sell-depth" aria-hidden="true" />}
        {bid && <i className="paired-depth buy-depth" aria-hidden="true" />}
        <i className="row-refresh" aria-hidden="true" />
      </div>
    );
  });
}

function OrderBook({ snapshot }: { snapshot: MarketSnapshot }) {
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
        : <PairedOrderRows bids={snapshot.bids} asks={snapshot.asks} refreshSequence={snapshot.refreshSequence} />}
    </aside>
  );
}

function SessionDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
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
        <div><strong>طلاین</strong><span className={`market-health ${snapshot.health}`}>{healthText(snapshot.health)}</span><small dir="ltr">GOLD18IRT · SPOT</small></div>
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
  const selectedTimeframe = Object.hasOwn(bitycleIntervals, timeframe) ? timeframe : "1h";
  return (
    <main className="stage" dir="rtl">
      <Header snapshot={snapshot} onOpenSession={() => setSessionOpen(true)} />
      <section className="workspace">
        <MarketChart timeframe={selectedTimeframe} onTimeframeChange={setTimeframe} />
        <OrderBook snapshot={snapshot} />
      </section>
      <SessionDialog open={sessionOpen} onClose={() => setSessionOpen(false)} />
    </main>
  );
}

export default function Home() {
  const scale = useStageScale();
  return (
    <div className="stage-viewport" style={{ width: 960 * scale, height: 576 * scale }}>
      <div style={{ transform: `scale(${scale})` }} className="stage-scaler"><MarketWall /></div>
    </div>
  );
}
