import { HISTORICAL_CANDLE_SEED } from "./history-seed";

export type TradeSide = "buy" | "sell";
export type ChartTimeframe = "15m" | "4h" | "1d";

export interface OrderLevel {
  price: number;
  amount: number;
  total: number;
  revision: number;
  origin: "live" | "supplemental";
  motion: "steady" | "volume" | "reprice";
}

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export interface MarketSnapshot {
  sequence: number;
  lastPrice: number;
  referencePrice: number;
  previousClose: number;
  changePercent: number;
  high24h: number;
  low24h: number;
  bestBid: number;
  bestAsk: number;
  spread: number;
  lastMove: TradeSide;
  bids: OrderLevel[];
  asks: OrderLevel[];
  candles: Record<ChartTimeframe, Candle[]>;
  nextCloseAt: Record<ChartTimeframe, number>;
  updatedAt: number;
}

export interface MarketDataProvider {
  getSnapshot(): MarketSnapshot;
  subscribe(listener: (snapshot: MarketSnapshot) => void): () => void;
}

interface TlynGoldPrice {
  symbol: string;
  direction: "up" | "down";
  price: { sell: number; buy: number; highest?: number; lowest?: number };
  date?: { utc_timestamp?: string };
}

interface TlynPriceResponse {
  prices: TlynGoldPrice[];
}

interface RawOrderLevel {
  quote: string;
  total_gram: number;
  order_count: number;
}

interface TlynOrderbookResponse {
  status: boolean;
  data?: {
    active_orders?: { buy?: RawOrderLevel[]; sell?: RawOrderLevel[] };
    prices?: { main_price?: number; buy_quote?: number; sell_quote?: number };
  };
}

interface OfficialPrice {
  midpoint: number;
  high: number;
  low: number;
  direction: "up" | "down";
}

interface CachedCandles {
  version: 4;
  candles: Record<ChartTimeframe, Candle[]>;
}

interface TlynHistoryResponse {
  status: boolean;
  candles?: Record<ChartTimeframe, Candle[]>;
}

const PRICE_API = "https://price.tlyn.ir/api/v1/price";
const ORDERBOOK_API = "/api/orderbook";
const HISTORY_API = "/api/history";
const PRICE_MULTIPLIER = 10_000;
const PRICE_STEP = 1_000;
const BOOK_LEVELS = 15;
const LIVE_LEVELS = 5;
const POLL_INTERVAL_MS = 3_000;
const BOOK_UPDATE_DELAY = { min: 2_400, max: 5_600 };
const TICKER_UPDATE_DELAY = { min: 1_500, max: 3_400 };
const MAX_CANDLES = 90;
const CACHE_KEY = "tlyn:spot-wall:candles:v4";
const TIMEFRAMES: ChartTimeframe[] = ["15m", "4h", "1d"];
const TIMEFRAME_MS: Record<ChartTimeframe, number> = {
  "15m": 15 * 60_000,
  "4h": 4 * 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};

const FALLBACK = {
  reference: 218_372_500,
  bestBid: 217_499_000,
  bestAsk: 219_246_000,
  high: 219_070_000,
  low: 215_530_000,
};

const roundToStep = (value: number) => Math.round(value / PRICE_STEP) * PRICE_STEP;
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const randomBetween = (minimum: number, maximum: number) => minimum + Math.random() * (maximum - minimum);
const randomInteger = (minimum: number, maximum: number) => Math.floor(randomBetween(minimum, maximum + 1));

function currentBucket(now: number, timeframe: ChartTimeframe) {
  const interval = TIMEFRAME_MS[timeframe];
  return Math.floor(now / interval) * interval;
}

function nextBoundary(now: number, timeframe: ChartTimeframe) {
  return currentBucket(now, timeframe) + TIMEFRAME_MS[timeframe];
}

function stableAmount(price: number, index: number, side: TradeSide) {
  const seed = Math.abs(Math.trunc(price / PRICE_STEP) * 31 + index * 97 + (side === "buy" ? 17 : 53));
  return Number((0.12 + (seed % 245) / 100).toFixed(3));
}

function medianGap(levels: RawOrderLevel[]) {
  const prices = levels.map((level) => Number(level.quote)).filter(Number.isFinite).sort((a, b) => a - b);
  const gaps = prices.slice(1).map((value, index) => value - prices[index]).filter((value) => value > 0).sort((a, b) => a - b);
  return Math.max(PRICE_STEP * 5, gaps[Math.floor(gaps.length / 2)] ?? 24_000);
}

function liveLevels(raw: RawOrderLevel[], side: TradeSide) {
  return raw
    .filter((level) => Number.isFinite(Number(level.quote)) && Number(level.quote) > 0 && Number(level.total_gram) > 0)
    .sort((a, b) => side === "buy" ? Number(b.quote) - Number(a.quote) : Number(a.quote) - Number(b.quote));
}

function exactLevels(raw: RawOrderLevel[], side: TradeSide) {
  return liveLevels(raw, side).slice(0, LIVE_LEVELS).map((level) => {
    const price = Number(level.quote);
    const amount = Number(Number(level.total_gram).toFixed(3));
    return { price, amount, total: price * amount, revision: 1, origin: "live" as const, motion: "steady" as const };
  });
}

function makeBookSide(
  raw: RawOrderLevel[],
  side: TradeSide,
  fallbackAnchor: number,
  previous: OrderLevel[],
  updateRevision: number,
) {
  const live = exactLevels(raw, side);
  const priorByPrice = new Map(previous.map((level) => [level.price, level]));
  const unique = new Map<number, OrderLevel>();
  for (const level of live) {
    if (!unique.has(level.price)) {
      const previousLevel = priorByPrice.get(level.price);
      const amountChanged = !previousLevel || Math.abs(previousLevel.amount - level.amount) >= 0.0005;
      const levelRevision = previousLevel && !amountChanged
        ? previousLevel.revision
        : updateRevision;
      unique.set(level.price, {
        ...level,
        revision: levelRevision,
        motion: previousLevel ? (amountChanged ? "volume" : "steady") : "reprice",
      });
    }
  }

  const gap = medianGap(liveLevels(raw, side));
  const anchor = live.at(-1)?.price ?? fallbackAnchor;
  const isOutsideLiveBook = (price: number) => side === "buy" ? price < anchor : price > anchor;
  const previousSupplementals = previous
    .filter((level) => level.origin === "supplemental" && isOutsideLiveBook(level.price))
    .sort((a, b) => side === "buy" ? b.price - a.price : a.price - b.price);

  for (const level of previousSupplementals) {
    if (unique.size >= BOOK_LEVELS || unique.has(level.price)) continue;
    unique.set(level.price, { ...level, total: level.price * level.amount, motion: "steady" });
  }

  let fillerIndex = 1;
  while (unique.size < BOOK_LEVELS) {
    const direction = side === "buy" ? -1 : 1;
    const price = roundToStep(anchor + direction * gap * fillerIndex);
    if (unique.has(price)) {
      fillerIndex += 1;
      continue;
    }
    const amount = stableAmount(price, fillerIndex, side);
    unique.set(price, {
      price,
      amount,
      total: price * amount,
      revision: updateRevision,
      origin: "supplemental",
      motion: "reprice",
    });
    fillerIndex += 1;
  }

  return [...unique.values()]
    .sort((a, b) => side === "buy" ? b.price - a.price : a.price - b.price)
    .slice(0, BOOK_LEVELS)
    .map((level) => ({ ...level, total: level.price * level.amount }));
}

function oneCandle(price: number, now: number, timeframe: ChartTimeframe): Candle[] {
  return [{ time: currentBucket(now, timeframe), open: price, high: price, low: price, close: price }];
}

function initialCandles(timeframe: ChartTimeframe) {
  return HISTORICAL_CANDLE_SEED[timeframe]
    .filter(isCandle)
    .map((candle) => ({ ...candle }))
    .sort((a, b) => a.time - b.time)
    .slice(-MAX_CANDLES);
}

function updateCandles(candles: Candle[], timeframe: ChartTimeframe, now: number, tickPrice: number, officialPrice: number) {
  const bucket = currentBucket(now, timeframe);
  const valid = candles.filter((candle) => candle.time <= bucket).slice(-MAX_CANDLES).map((candle) => ({ ...candle }));
  let active = valid.at(-1);

  if (!active || active.time < bucket) {
    if (active) {
      active.close = officialPrice;
      active.high = Math.max(active.high, officialPrice);
      active.low = Math.min(active.low, officialPrice);
    }
    active = { time: bucket, open: officialPrice, high: Math.max(officialPrice, tickPrice), low: Math.min(officialPrice, tickPrice), close: tickPrice };
    valid.push(active);
  } else {
    active.close = tickPrice;
    active.high = Math.max(active.high, tickPrice);
    active.low = Math.min(active.low, tickPrice);
  }

  return valid.slice(-MAX_CANDLES);
}

function isCandle(value: unknown): value is Candle {
  if (!value || typeof value !== "object") return false;
  const candle = value as Candle;
  return [candle.time, candle.open, candle.high, candle.low, candle.close].every(Number.isFinite)
    && candle.high >= Math.max(candle.open, candle.close)
    && candle.low <= Math.min(candle.open, candle.close);
}

function initialBookSide(side: TradeSide, anchor: number) {
  return makeBookSide([], side, anchor, [], 1);
}

function createInitialSnapshot(): MarketSnapshot {
  const now = Date.now();
  const bids = initialBookSide("buy", FALLBACK.bestBid);
  const asks = initialBookSide("sell", FALLBACK.bestAsk);
  const previousClose = FALLBACK.reference / 1.0064;
  return {
    sequence: 1,
    lastPrice: FALLBACK.reference,
    referencePrice: FALLBACK.reference,
    previousClose,
    changePercent: ((FALLBACK.reference - previousClose) / previousClose) * 100,
    high24h: Math.max(FALLBACK.high, FALLBACK.reference),
    low24h: Math.min(FALLBACK.low, FALLBACK.reference),
    bestBid: bids[0].price,
    bestAsk: asks[0].price,
    spread: asks[0].price - bids[0].price,
    lastMove: "buy",
    bids,
    asks,
    candles: {
      "15m": initialCandles("15m"),
      "4h": initialCandles("4h"),
      "1d": initialCandles("1d"),
    },
    nextCloseAt: {
      "15m": nextBoundary(now, "15m"),
      "4h": nextBoundary(now, "4h"),
      "1d": nextBoundary(now, "1d"),
    },
    updatedAt: now,
  };
}

export class TlynMarketDataProvider implements MarketDataProvider {
  private snapshot = createInitialSnapshot();
  private listeners = new Set<(snapshot: MarketSnapshot) => void>();
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private requestSequence = 0;
  private hydrated = false;
  private historyRequested = false;
  private refreshing = false;
  private bookTimers: Partial<Record<TradeSide, ReturnType<typeof setTimeout>>> = {};
  private tickerTimer: ReturnType<typeof setTimeout> | null = null;
  private lastVisualMotionAt = 0;

  getSnapshot() {
    return this.snapshot;
  }

  subscribe(listener: (snapshot: MarketSnapshot) => void) {
    this.listeners.add(listener);
    if (!this.hydrated) this.hydrateCandles();
    listener(this.snapshot);
    if (this.pollTimer === null) {
      void this.bootstrapHistory();
      void this.refresh();
      this.pollTimer = setInterval(() => void this.refresh(), POLL_INTERVAL_MS);
      this.startVisualSimulation();
    }

    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0 && this.pollTimer !== null) {
        clearInterval(this.pollTimer);
        this.pollTimer = null;
        this.stopVisualSimulation();
      }
    };
  }

  private notify() {
    this.listeners.forEach((listener) => listener(this.snapshot));
  }

  private startVisualSimulation() {
    this.scheduleBookUpdate("buy");
    this.scheduleBookUpdate("sell");
    this.scheduleTickerUpdate();
  }

  private stopVisualSimulation() {
    for (const side of ["buy", "sell"] as const) {
      const timer = this.bookTimers[side];
      if (timer) clearTimeout(timer);
      delete this.bookTimers[side];
    }
    if (this.tickerTimer) clearTimeout(this.tickerTimer);
    this.tickerTimer = null;
  }

  private scheduleBookUpdate(side: TradeSide) {
    if (this.listeners.size === 0) return;
    const delay = randomInteger(BOOK_UPDATE_DELAY.min, BOOK_UPDATE_DELAY.max);
    this.bookTimers[side] = setTimeout(() => {
      delete this.bookTimers[side];
      if (this.claimVisualMotion()) this.applyVisualBookUpdate(side);
      this.scheduleBookUpdate(side);
    }, delay);
  }

  private scheduleTickerUpdate() {
    if (this.listeners.size === 0) return;
    const delay = randomInteger(TICKER_UPDATE_DELAY.min, TICKER_UPDATE_DELAY.max);
    this.tickerTimer = setTimeout(() => {
      this.tickerTimer = null;
      if (this.claimVisualMotion()) this.applyVisualTickerUpdate();
      this.scheduleTickerUpdate();
    }, delay);
  }

  private claimVisualMotion() {
    const now = Date.now();
    if (now - this.lastVisualMotionAt < 140) return false;
    this.lastVisualMotionAt = now;
    return true;
  }

  private applyVisualBookUpdate(side: TradeSide) {
    const previous = this.snapshot;
    const source = side === "buy" ? previous.bids : previous.asks;
    const available = source
      .map((level, index) => ({ level, index }))
      .filter(({ level, index }) => index >= LIVE_LEVELS && level.origin === "supplemental");
    if (available.length === 0) return;

    const selected: number[] = [];
    const targetCount = Math.min(randomInteger(1, 3), available.length);
    while (selected.length < targetCount) {
      const eligible = available.filter(({ index }) => !selected.some((selectedIndex) => Math.abs(selectedIndex - index) <= 1));
      if (eligible.length === 0) break;
      const next = eligible[randomInteger(0, eligible.length - 1)];
      selected.push(next.index);
    }

    const revision = previous.sequence + 1;
    const replacementIndex = Math.random() < 0.2 ? selected[0] : -1;
    const updated: OrderLevel[] = source.map((level, index) => {
      if (!selected.includes(index)) return level.motion === "steady" ? level : { ...level, motion: "steady" as const };
      const amount = Number(clamp(level.amount * randomBetween(0.7, 1.35), 0.04, 9.5).toFixed(3));
      const price = index === replacementIndex ? this.nudgeSupplementalPrice(source, index, side) : level.price;
      return {
        ...level,
        price,
        amount,
        total: price * amount,
        revision,
        motion: price === level.price ? "volume" as const : "reprice" as const,
      };
    });
    const sorted = updated
      .sort((a, b) => side === "buy" ? b.price - a.price : a.price - b.price)
      .slice(0, BOOK_LEVELS);

    this.snapshot = {
      ...previous,
      sequence: revision,
      bids: side === "buy" ? sorted : previous.bids,
      asks: side === "sell" ? sorted : previous.asks,
      updatedAt: Date.now(),
    };
    this.notify();
  }

  private nudgeSupplementalPrice(levels: OrderLevel[], index: number, side: TradeSide) {
    const level = levels[index];
    const preceding = levels[index - 1];
    const following = levels[index + 1];
    const lowerNeighbor = side === "buy" ? following : preceding;
    const higherNeighbor = side === "buy" ? preceding : following;
    const minimum = lowerNeighbor ? lowerNeighbor.price + PRICE_STEP : Math.max(PRICE_STEP, level.price - PRICE_STEP * 4);
    const maximum = higherNeighbor ? higherNeighbor.price - PRICE_STEP : level.price + PRICE_STEP * 4;
    if (maximum < minimum) return level.price;
    const nudge = PRICE_STEP * randomInteger(1, 3) * (Math.random() < 0.5 ? -1 : 1);
    return roundToStep(clamp(level.price + nudge, minimum, maximum));
  }

  private applyVisualTickerUpdate() {
    const previous = this.snapshot;
    const safeLow = previous.bestBid + PRICE_STEP;
    const safeHigh = previous.bestAsk - PRICE_STEP;
    if (safeHigh < safeLow) return;

    const current = roundToStep(clamp(previous.lastPrice, safeLow, safeHigh));
    const maxSteps = Math.max(1, Math.min(12, Math.floor((safeHigh - safeLow) / (PRICE_STEP * 4))));
    const direction = Math.random() < 0.5 ? -1 : 1;
    const movement = direction * PRICE_STEP * randomInteger(1, maxSteps);
    let lastPrice = roundToStep(clamp(current + movement, safeLow, safeHigh));
    if (lastPrice === current) lastPrice = roundToStep(clamp(current - movement, safeLow, safeHigh));
    if (lastPrice === current) return;

    const now = Date.now();
    const candles = {} as Record<ChartTimeframe, Candle[]>;
    const nextCloseAt = {} as Record<ChartTimeframe, number>;
    for (const timeframe of TIMEFRAMES) {
      candles[timeframe] = updateCandles(previous.candles[timeframe], timeframe, now, lastPrice, previous.referencePrice);
      nextCloseAt[timeframe] = nextBoundary(now, timeframe);
    }

    this.snapshot = {
      ...previous,
      sequence: previous.sequence + 1,
      lastPrice,
      lastMove: lastPrice >= previous.lastPrice ? "buy" : "sell",
      changePercent: ((lastPrice - previous.previousClose) / previous.previousClose) * 100,
      candles,
      nextCloseAt,
      updatedAt: now,
    };
    this.persistCandles();
    this.notify();
  }

  private hydrateCandles() {
    this.hydrated = true;
    if (typeof window === "undefined") return;
    try {
      const cached = JSON.parse(window.localStorage.getItem(CACHE_KEY) ?? "null") as CachedCandles | null;
      if (!cached || cached.version !== 4) return;
      const restored = {} as Record<ChartTimeframe, Candle[]>;
      for (const timeframe of TIMEFRAMES) {
        const source = cached.candles?.[timeframe];
        if (!Array.isArray(source)) return;
        restored[timeframe] = source.filter(isCandle).sort((a, b) => a.time - b.time).slice(-MAX_CANDLES);
        if (restored[timeframe].length === 0) return;
      }
      this.snapshot = { ...this.snapshot, candles: restored };
    } catch {
      window.localStorage.removeItem(CACHE_KEY);
    }
  }

  private persistCandles() {
    if (typeof window === "undefined") return;
    try {
      const payload: CachedCandles = { version: 4, candles: this.snapshot.candles };
      window.localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
    } catch {
      // The live view keeps working when storage is unavailable.
    }
  }

  private async bootstrapHistory() {
    if (this.historyRequested) return;
    this.historyRequested = true;
    try {
      const response = await fetch(HISTORY_API, { cache: "no-store" });
      if (!response.ok) return;
      const payload = await response.json() as TlynHistoryResponse;
      if (!payload.status || !payload.candles) return;
      const merged = {} as Record<ChartTimeframe, Candle[]>;
      for (const timeframe of TIMEFRAMES) {
        const history = payload.candles[timeframe];
        if (!Array.isArray(history)) return;
        const byTime = new Map<number, Candle>();
        for (const candle of history.filter(isCandle)) byTime.set(candle.time, candle);
        for (const candle of this.snapshot.candles[timeframe].filter(isCandle)) byTime.set(candle.time, candle);
        merged[timeframe] = [...byTime.values()].sort((a, b) => a.time - b.time).slice(-MAX_CANDLES);
      }
      this.snapshot = { ...this.snapshot, candles: merged };
      this.persistCandles();
      this.notify();
    } catch {
      // A valid local cache remains the offline history source.
    }
  }

  private async refresh() {
    if (this.refreshing) return;
    this.refreshing = true;
    const requestId = ++this.requestSequence;
    try {
      const [priceResult, orderResult] = await Promise.allSettled([
        fetch(PRICE_API, { cache: "no-store", signal: AbortSignal.timeout(2_800) }).then(async (response) => {
          if (!response.ok) throw new Error("price");
          return response.json() as Promise<TlynPriceResponse>;
        }),
        fetch(ORDERBOOK_API, { cache: "no-store", signal: AbortSignal.timeout(2_800) }).then(async (response) => {
          if (!response.ok) throw new Error("orderbook");
          return response.json() as Promise<TlynOrderbookResponse>;
        }),
      ]);
      if (requestId !== this.requestSequence || this.listeners.size === 0) return;

      const official = this.readOfficialPrice(priceResult.status === "fulfilled" ? priceResult.value : null);
      const orderbook = orderResult.status === "fulfilled" && orderResult.value.status ? orderResult.value : null;
      this.applyMarketUpdate(official, orderbook);
    } finally {
      this.refreshing = false;
    }
  }

  private readOfficialPrice(payload: TlynPriceResponse | null): OfficialPrice | null {
    const gold = payload?.prices.find((item) => item.symbol === "GOLD18");
    if (!gold) return null;
    const buy = Number(gold.price.buy) * PRICE_MULTIPLIER;
    const sell = Number(gold.price.sell) * PRICE_MULTIPLIER;
    if (!Number.isFinite(buy) || !Number.isFinite(sell)) return null;
    return {
      midpoint: roundToStep((buy + sell) / 2),
      high: Number(gold.price.highest ?? gold.price.sell) * PRICE_MULTIPLIER,
      low: Number(gold.price.lowest ?? gold.price.buy) * PRICE_MULTIPLIER,
      direction: gold.direction,
    };
  }

  private applyMarketUpdate(official: OfficialPrice | null, orderbook: TlynOrderbookResponse | null) {
    const previous = this.snapshot;
    const sequence = previous.sequence + 1;
    const orderPrices = orderbook?.data?.prices;
    const rawBids = orderbook?.data?.active_orders?.buy ?? [];
    const rawAsks = orderbook?.data?.active_orders?.sell ?? [];
    const realBids = exactLevels(rawBids, "buy");
    const realAsks = exactLevels(rawAsks, "sell");
    const officialReference = roundToStep(Number(orderPrices?.main_price) || official?.midpoint || previous.referencePrice);
    const bestBid = realBids[0]?.price ?? roundToStep(officialReference - 850_000);
    const bestAsk = realAsks[0]?.price ?? roundToStep(officialReference + 850_000);
    const bids = makeBookSide(rawBids, "buy", bestBid, previous.bids, sequence);
    const asks = makeBookSide(rawAsks, "sell", bestAsk, previous.asks, sequence);

    const innerLow = bestBid + PRICE_STEP;
    const innerHigh = bestAsk - PRICE_STEP;
    const safeLow = Math.min(innerLow, innerHigh);
    const safeHigh = Math.max(innerLow, innerHigh);
    const apiPriceChanged = officialReference !== previous.referencePrice
      || bestBid !== previous.bestBid
      || bestAsk !== previous.bestAsk;
    const target = clamp(officialReference, safeLow, safeHigh);
    const lastPrice = roundToStep(apiPriceChanged
      ? clamp(previous.lastPrice * 0.35 + target * 0.65, safeLow, safeHigh)
      : clamp(previous.lastPrice, safeLow, safeHigh));
    const previousClose = official
      ? official.direction === "up" ? officialReference / 1.0064 : officialReference / 0.9936
      : previous.previousClose;
    const now = Date.now();
    const candles = {} as Record<ChartTimeframe, Candle[]>;
    const nextCloseAt = {} as Record<ChartTimeframe, number>;
    const hasOnlyPlaceholderHistory = TIMEFRAMES.every((timeframe) => previous.candles[timeframe].length <= 1);
    for (const timeframe of TIMEFRAMES) {
      const sourceCandles = hasOnlyPlaceholderHistory ? oneCandle(lastPrice, now, timeframe) : previous.candles[timeframe];
      candles[timeframe] = updateCandles(sourceCandles, timeframe, now, lastPrice, officialReference);
      nextCloseAt[timeframe] = nextBoundary(now, timeframe);
    }

    this.snapshot = {
      ...previous,
      sequence,
      lastPrice,
      referencePrice: officialReference,
      previousClose,
      changePercent: ((lastPrice - previousClose) / previousClose) * 100,
      high24h: Math.max(official?.high ?? previous.high24h, lastPrice),
      low24h: Math.min(official?.low ?? previous.low24h, lastPrice),
      bestBid,
      bestAsk,
      spread: bestAsk - bestBid,
      lastMove: lastPrice >= previous.lastPrice ? "buy" : "sell",
      bids,
      asks,
      candles,
      nextCloseAt,
      updatedAt: now,
    };
    this.persistCandles();
    this.notify();
  }
}

// Compatibility alias for code that used the original demo provider name.
export class MockMarketDataProvider extends TlynMarketDataProvider {}
