"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Image from "next/image";
import {
  TlynMarketDataProvider,
  type Candle,
  type ChartTimeframe,
  type MarketSnapshot,
  type OrderLevel,
  type TradeSide,
} from "./market-data";

const faInteger = new Intl.NumberFormat("fa-IR", { maximumFractionDigits: 0 });
const faDecimal = new Intl.NumberFormat("fa-IR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const faAmount = new Intl.NumberFormat("fa-IR", { minimumFractionDigits: 2, maximumFractionDigits: 3 });
const faPercent = new Intl.NumberFormat("fa-IR", { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "always" });
const faDay = new Intl.DateTimeFormat("fa-IR", { month: "numeric", day: "numeric" });

const timeframeLabels: Record<ChartTimeframe, string> = { "15m": "۱۵ دقیقه", "4h": "۴ ساعت", "1d": "۱ روز" };
const toman = (value: number) => faInteger.format(value / 10);
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

function useClock(initialNow: number) {
  const [now, setNow] = useState(initialNow);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

function formatRemaining(target: number, now: number) {
  const seconds = Math.max(0, Math.ceil((target - now) / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const rest = seconds % 60;
  const pad = (value: number) => faInteger.format(value).padStart(2, "۰");
  return hours > 0 ? `${pad(hours)}:${pad(minutes)}:${pad(rest)}` : `${pad(minutes)}:${pad(rest)}`;
}

function chartTimeLabel(time: number, timeframe: ChartTimeframe) {
  const date = new Date(time);
  if (timeframe === "1d") return faDay.format(date);
  return `${faInteger.format(date.getHours()).padStart(2, "۰")}:${faInteger.format(date.getMinutes()).padStart(2, "۰")}`;
}

function drawMarketChart(
  canvas: HTMLCanvasElement,
  candles: Candle[],
  lastPrice: number,
  side: TradeSide,
  timeframe: ChartTimeframe,
  countdown: string,
) {
  const width = canvas.clientWidth;
  const height = canvas.clientHeight;
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const context = canvas.getContext("2d");
  if (!context) return;
  context.setTransform(ratio, 0, 0, ratio, 0, 0);
  context.clearRect(0, 0, width, height);

  const plot = { left: 15, right: width - 86, top: 18, bottom: height - 27 };
  const safeCandles = candles.length > 0 ? candles : [{ time: Date.now(), open: lastPrice, high: lastPrice, low: lastPrice, close: lastPrice }];
  const bodies = safeCandles.map((candle) => Math.abs(candle.close - candle.open)).filter((value) => value > 0).sort((a, b) => a - b);
  const medianBody = bodies[Math.floor(bodies.length / 2)] ?? 0;
  const isFifteenMinute = timeframe === "15m";
  const timeframeFloor = lastPrice * (isFifteenMinute ? 0.00012 : timeframe === "4h" ? 0.0012 : 0.003);
  const wickLimit = Math.max(medianBody * (isFifteenMinute ? 1.15 : 2.4), timeframeFloor);
  const displayCandles = safeCandles.map((candle) => {
    const bodyHigh = Math.max(candle.open, candle.close);
    const bodyLow = Math.min(candle.open, candle.close);
    return {
      ...candle,
      high: Math.min(candle.high, bodyHigh + wickLimit),
      low: Math.max(candle.low, bodyLow - wickLimit),
    };
  });
  let min = Math.min(...displayCandles.map((candle) => candle.low), lastPrice);
  let max = Math.max(...displayCandles.map((candle) => candle.high), lastPrice);
  const padding = Math.max((max - min) * 0.16, lastPrice * 0.00135);
  min -= padding;
  max += padding;
  const toY = (value: number) => plot.top + ((max - value) / Math.max(1, max - min)) * (plot.bottom - plot.top);

  context.lineWidth = 1;
  context.strokeStyle = "#15191f";
  context.fillStyle = "#616974";
  context.font = "8px YekanBakh, Tahoma, sans-serif";
  context.textAlign = "left";
  context.textBaseline = "middle";
  for (let line = 0; line < 6; line += 1) {
    const y = plot.top + (line * (plot.bottom - plot.top)) / 5;
    context.beginPath();
    context.moveTo(plot.left, y);
    context.lineTo(plot.right, y);
    context.stroke();
    const labelValue = max - (line * (max - min)) / 5;
    context.fillText(`${faDecimal.format(labelValue / 10_000_000)} م`, plot.right + 8, y);
  }
  for (let line = 0; line < 6; line += 1) {
    const x = plot.left + (line * (plot.right - plot.left)) / 5;
    context.beginPath();
    context.moveTo(x, plot.top);
    context.lineTo(x, plot.bottom);
    context.stroke();
  }

  const visibleSlots = Math.max(48, safeCandles.length);
  const slot = (plot.right - plot.left) / visibleSlots;
  const startSlot = visibleSlots - safeCandles.length;
  const bodyWidth = Math.max(isFifteenMinute ? 4.5 : 3.5, Math.min(isFifteenMinute ? 8 : 7, slot * (isFifteenMinute ? 0.74 : 0.62)));
  displayCandles.forEach((candle, index) => {
    const rising = candle.close >= candle.open;
    const color = rising ? "#20d6a0" : "#f04461";
    const x = plot.left + slot * (startSlot + index) + slot / 2;
    const openY = toY(candle.open);
    const closeY = toY(candle.close);
    context.strokeStyle = color;
    context.fillStyle = color;
    context.beginPath();
    context.moveTo(x, toY(candle.high));
    context.lineTo(x, toY(candle.low));
    context.stroke();
    context.fillRect(x - bodyWidth / 2, Math.min(openY, closeY), bodyWidth, Math.max(isFifteenMinute ? 3.4 : 2, Math.abs(closeY - openY)));
  });

  const currentY = toY(lastPrice);
  const activeColor = side === "buy" ? "#20d6a0" : "#f04461";
  context.setLineDash([3, 3]);
  context.strokeStyle = activeColor;
  context.globalAlpha = 0.88;
  context.beginPath();
  context.moveTo(plot.left, currentY);
  context.lineTo(plot.right, currentY);
  context.stroke();
  context.setLineDash([]);
  context.globalAlpha = 1;

  const labelTop = clampCanvas(currentY - 17, plot.top, plot.bottom - 34);
  context.fillStyle = activeColor;
  context.fillRect(plot.right + 3, labelTop, 81, 34);
  context.fillStyle = "#00100b";
  context.font = "700 9px YekanBakh, Tahoma, sans-serif";
  context.textAlign = "center";
  context.fillText(toman(lastPrice), plot.right + 43, labelTop + 11);
  context.font = "600 7px YekanBakh, Tahoma, sans-serif";
  context.fillText(countdown, plot.right + 43, labelTop + 24);

  context.fillStyle = "#575f69";
  context.font = "7px YekanBakh, Tahoma, sans-serif";
  context.textAlign = "center";
  const activeTime = safeCandles.at(-1)!.time;
  for (let line = 0; line < 5; line += 1) {
    const slotIndex = Math.round((line * (visibleSlots - 1)) / 4);
    const time = activeTime - (visibleSlots - 1 - slotIndex) * timeframeDuration(timeframe);
    const x = plot.left + slot * slotIndex + slot / 2;
    context.fillText(chartTimeLabel(time, timeframe), x, height - 9);
  }
}

function clampCanvas(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

function timeframeDuration(timeframe: ChartTimeframe) {
  if (timeframe === "15m") return 15 * 60_000;
  if (timeframe === "4h") return 4 * 60 * 60_000;
  return 24 * 60 * 60_000;
}

function MarketChart({
  snapshot,
  timeframe,
  onTimeframeChange,
}: {
  snapshot: MarketSnapshot;
  timeframe: ChartTimeframe;
  onTimeframeChange: (value: ChartTimeframe) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const now = useClock(snapshot.updatedAt);
  const candles = snapshot.candles[timeframe];
  const countdown = formatRemaining(snapshot.nextCloseAt[timeframe], now);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    drawMarketChart(canvas, candles, snapshot.lastPrice, snapshot.lastMove, timeframe, countdown);
  }, [candles, snapshot.lastPrice, snapshot.lastMove, timeframe, countdown]);

  return (
    <section className="chart-card" aria-label="نمودار زنده بازار طلا">
      <div className="chart-toolbar">
        <div className="chart-title">
          <b>نمودار طلای ۱۸ عیار</b>
          <span dir="ltr">XAU18 / IRT · SPOT</span>
        </div>
        <div className="ranges" aria-label="انتخاب بازه کندل">
          {(["1d", "4h", "15m"] as ChartTimeframe[]).map((value) => (
            <button type="button" className={timeframe === value ? "active" : ""} onClick={() => onTimeframeChange(value)} key={value}>
              {timeframeLabels[value]}
            </button>
          ))}
        </div>
      </div>
      <div className="chart-canvas">
        <span className="chart-watermark" dir="ltr">TALINE · XAU18</span>
        <canvas ref={canvasRef} />
      </div>
    </section>
  );
}

function PairedOrderRows({ bids, asks }: { bids: OrderLevel[]; asks: OrderLevel[] }) {
  const bidMax = Math.max(...bids.map((row) => row.amount));
  const askMax = Math.max(...asks.map((row) => row.amount));

  return asks.map((ask, index) => {
    const bid = bids[index];
    const sellDepth = ask.amount / Math.max(askMax, 0.001);
    const buyDepth = bid.amount / Math.max(bidMax, 0.001);
    const rowMotion = ask.motion === "reprice" || bid.motion === "reprice" ? "row-reprice" : "row-volume";
    const depthStyle = {
      "--sell-depth": String(sellDepth),
      "--buy-depth": String(buyDepth),
    } as CSSProperties;
    return (
      <div
        className={`book-paired-row ${rowMotion} revision-${Math.max(bid.revision, ask.revision) % 2}`}
        key={`${bid.price}-${ask.price}`}
        style={depthStyle}
        data-bid-price={bid.price}
        data-bid-amount={bid.amount}
        data-ask-price={ask.price}
        data-ask-amount={ask.amount}
      >
        <span className="paired-amount sell-amount">{amount(ask.amount)}</span>
        <span className="paired-price sell-price">{toman(ask.price)}</span>
        <span className="paired-price buy-price">{toman(bid.price)}</span>
        <span className="paired-amount buy-amount">{amount(bid.amount)}</span>
        <i className="paired-depth sell-depth" aria-hidden="true" />
        <i className="paired-depth buy-depth" aria-hidden="true" />
      </div>
    );
  });
}

function OrderBook({ snapshot }: { snapshot: MarketSnapshot }) {
  const bidVolume = snapshot.bids.reduce((sum, level) => sum + level.amount, 0);
  const askVolume = snapshot.asks.reduce((sum, level) => sum + level.amount, 0);
  const buyShare = Math.round((bidVolume / Math.max(0.001, bidVolume + askVolume)) * 100);

  return (
    <aside
      className="orderbook-card"
      aria-label="دفتر سفارش‌های بازار"
      data-last-price={snapshot.lastPrice}
      data-best-bid={snapshot.bestBid}
      data-best-ask={snapshot.bestAsk}
    >
      <div className="book-heading">
        <div><b>دفتر سفارش‌ها</b><span>عمق بازار</span></div>
        <div className="book-balance" aria-label="تعادل سفارش‌ها">
          <span className="buy-share">خرید {faInteger.format(buyShare)}٪</span>
          <span className="sell-share">فروش {faInteger.format(100 - buyShare)}٪</span>
        </div>
      </div>
      <div className={`book-center ${snapshot.lastMove}`}>
        <div><b key={snapshot.sequence}>{toman(snapshot.lastPrice)}</b><span>آخرین قیمت</span></div>
        <div><strong>{toman(snapshot.spread)}</strong><span>اختلاف بهترین قیمت خرید و فروش</span></div>
      </div>
      <div className="book-head paired-head">
        <span>مقدار فروش</span><span className="sell-price">قیمت فروش</span><span className="buy-price">قیمت خرید</span><span>مقدار خرید</span>
      </div>
      <PairedOrderRows bids={snapshot.bids} asks={snapshot.asks} />
    </aside>
  );
}

function Header({ snapshot }: { snapshot: MarketSnapshot }) {
  const metrics = [
    { label: "بیشترین ۲۴ ساعت", value: toman(snapshot.high24h) },
    { label: "کمترین ۲۴ ساعت", value: toman(snapshot.low24h) },
    { label: "بهترین خرید", value: toman(snapshot.bestBid), tone: "positive" },
    { label: "بهترین فروش", value: toman(snapshot.bestAsk), tone: "negative" },
    { label: "اختلاف قیمت", value: toman(snapshot.spread) },
  ];
  return (
    <header className="market-header">
      <section className="identity">
        <Image src="/taline-logo.png" alt="لوگوی طلاین" width={43} height={43} priority />
        <div><strong>طلاین</strong><span>طلای ۱۸ عیار</span><small dir="ltr">XAU18 / IRT · SPOT</small></div>
      </section>
      <section className="headline-price">
        <span>آخرین قیمت <small>تومان</small></span>
        <strong className={`price-number ${snapshot.lastMove}`} key={snapshot.sequence}>{toman(snapshot.lastPrice)}</strong>
        <small className={snapshot.changePercent >= 0 ? "positive" : "negative"}>{faPercent.format(snapshot.changePercent)}٪ امروز</small>
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
  const [timeframe, setTimeframe] = useState<ChartTimeframe>("4h");
  return (
    <main className="stage" dir="rtl">
      <Header snapshot={snapshot} />
      <section className="workspace">
        <MarketChart snapshot={snapshot} timeframe={timeframe} onTimeframeChange={setTimeframe} />
        <OrderBook snapshot={snapshot} />
      </section>
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
