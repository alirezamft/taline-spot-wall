export type TradeSide = "buy" | "sell";
export type MarketHealth = "loading" | "live" | "stale" | "session-required";

export interface OrderLevel {
  price: number;
  amount: number;
  orderCount: number;
  revision: number;
  motion: "steady" | "volume" | "reprice";
}

export interface MarketSnapshot {
  sequence: number;
  refreshSequence: number;
  health: MarketHealth;
  lastPrice: number | null;
  mainPrice: number | null;
  high24h: number | null;
  low24h: number | null;
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
  lastMove: TradeSide | "neutral";
  bids: OrderLevel[];
  asks: OrderLevel[];
  lastSuccessfulFetchAt: number | null;
  updatedAt: number;
}

export interface MarketDataProvider {
  getSnapshot(): MarketSnapshot;
  subscribe(listener: (snapshot: MarketSnapshot) => void): () => void;
  setPollInterval(milliseconds: number): void;
}

interface RawOrderLevel {
  quote?: unknown;
  total_gram?: unknown;
  order_count?: unknown;
}

interface RawOrderbookPayload {
  status?: unknown;
  data?: {
    active_orders?: { buy?: unknown; sell?: unknown };
    prices?: { main_price?: unknown };
    last_price?: unknown;
  };
}

interface RawGoldPrice {
  symbol?: unknown;
  price?: { highest?: unknown; lowest?: unknown };
}

interface RawPricePayload {
  prices?: unknown;
}

interface NormalizedOrderbook {
  bids: Array<Omit<OrderLevel, "revision" | "motion">>;
  asks: Array<Omit<OrderLevel, "revision" | "motion">>;
  lastPrice: number;
  mainPrice: number;
}

interface NormalizedStats {
  high24h: number;
  low24h: number;
}

const ORDERBOOK_API = "/api/orderbook";
const PRICE_API = "/api/market-price";
export const DEFAULT_POLL_INTERVAL_MS = 5_000;
const REQUEST_TIMEOUT_MS = 4_500;
const PRICE_MULTIPLIER = 10_000;

export function normalizePollInterval(milliseconds: number) {
  return Math.min(300_000, Math.max(1_000, Math.round(milliseconds)));
}

function positiveNumber(value: unknown) {
  const parsed = typeof value === "string" && value.trim() !== "" ? Number(value) : value;
  return typeof parsed === "number" && Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function normalizeSide(value: unknown, side: TradeSide) {
  if (!Array.isArray(value)) return null;
  const levels: Array<Omit<OrderLevel, "revision" | "motion">> = [];
  const prices = new Set<number>();
  for (const raw of value as RawOrderLevel[]) {
    const price = positiveNumber(raw.quote);
    const amount = positiveNumber(raw.total_gram);
    const count = positiveNumber(raw.order_count);
    if (price === null || amount === null || count === null || !Number.isInteger(count) || prices.has(price)) return null;
    prices.add(price);
    levels.push({ price, amount, orderCount: count });
  }
  return levels.sort((a, b) => side === "buy" ? b.price - a.price : a.price - b.price);
}

export function normalizeOrderbook(payload: RawOrderbookPayload): NormalizedOrderbook | null {
  if (payload.status !== true || !payload.data) return null;
  const bids = normalizeSide(payload.data.active_orders?.buy, "buy");
  const asks = normalizeSide(payload.data.active_orders?.sell, "sell");
  const lastPrice = positiveNumber(payload.data.last_price);
  const mainPrice = positiveNumber(payload.data.prices?.main_price);
  if (!bids || !asks || lastPrice === null || mainPrice === null) return null;
  if (bids.length > 0 && asks.length > 0 && bids[0].price >= asks[0].price) return null;
  return { bids, asks, lastPrice, mainPrice };
}

export function normalizeStats(payload: RawPricePayload): NormalizedStats | null {
  if (!Array.isArray(payload.prices)) return null;
  const gold = (payload.prices as RawGoldPrice[]).find((item) => item.symbol === "GOLD18");
  const highest = positiveNumber(gold?.price?.highest);
  const lowest = positiveNumber(gold?.price?.lowest);
  if (highest === null || lowest === null || highest < lowest) return null;
  return { high24h: highest * PRICE_MULTIPLIER, low24h: lowest * PRICE_MULTIPLIER };
}

function mergeLevels(incoming: Array<Omit<OrderLevel, "revision" | "motion">>, previous: OrderLevel[], revision: number) {
  const previousByPrice = new Map(previous.map((level) => [level.price, level]));
  return incoming.map((level) => {
    const prior = previousByPrice.get(level.price);
    const amountChanged = prior ? prior.amount !== level.amount || prior.orderCount !== level.orderCount : false;
    return {
      ...level,
      revision: !prior || amountChanged ? revision : prior.revision,
      motion: !prior ? "reprice" as const : amountChanged ? "volume" as const : "steady" as const,
    };
  });
}

export function initialSnapshot(): MarketSnapshot {
  return {
    sequence: 0,
    refreshSequence: 0,
    health: "loading",
    lastPrice: null,
    mainPrice: null,
    high24h: null,
    low24h: null,
    bestBid: null,
    bestAsk: null,
    spread: null,
    lastMove: "neutral",
    bids: [],
    asks: [],
    lastSuccessfulFetchAt: null,
    updatedAt: Date.now(),
  };
}

export function reduceMarketResponse(
  previous: MarketSnapshot,
  bookPayload: RawOrderbookPayload | null,
  pricePayload: RawPricePayload | null,
  now: number,
  sessionRequired = false,
) {
  const orderbook = bookPayload ? normalizeOrderbook(bookPayload) : null;
  const stats = pricePayload ? normalizeStats(pricePayload) : null;
  const nextSequence = previous.sequence + 1;
  if (!orderbook) {
    return {
      ...previous,
      sequence: nextSequence,
      health: previous.lastSuccessfulFetchAt === null && sessionRequired ? "session-required" as const : "stale" as const,
      high24h: stats?.high24h ?? previous.high24h,
      low24h: stats?.low24h ?? previous.low24h,
      updatedAt: now,
    };
  }

  const bestBid = orderbook.bids[0]?.price ?? null;
  const bestAsk = orderbook.asks[0]?.price ?? null;
  return {
    ...previous,
    sequence: nextSequence,
    refreshSequence: previous.refreshSequence + 1,
    health: stats ? "live" as const : "stale" as const,
    lastPrice: orderbook.lastPrice,
    mainPrice: orderbook.mainPrice,
    high24h: stats?.high24h ?? previous.high24h,
    low24h: stats?.low24h ?? previous.low24h,
    bestBid,
    bestAsk,
    spread: bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null,
    lastMove: previous.lastPrice === null || orderbook.lastPrice === previous.lastPrice
      ? "neutral" as const
      : orderbook.lastPrice > previous.lastPrice ? "buy" as const : "sell" as const,
    bids: mergeLevels(orderbook.bids, previous.bids, nextSequence),
    asks: mergeLevels(orderbook.asks, previous.asks, nextSequence),
    lastSuccessfulFetchAt: now,
    updatedAt: now,
  };
}

async function fetchJson<T>(url: string, signal: AbortSignal) {
  const response = await fetch(url, { cache: "no-store", signal });
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok || !contentType.includes("application/json")) {
    const error = new Error("market request failed") as Error & { status?: number };
    error.status = response.status;
    throw error;
  }
  return response.json() as Promise<T>;
}

export class TlynMarketDataProvider implements MarketDataProvider {
  private snapshot = initialSnapshot();
  private listeners = new Set<(snapshot: MarketSnapshot) => void>();
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private requestController: AbortController | null = null;
  private requestSequence = 0;
  private pollIntervalMs = DEFAULT_POLL_INTERVAL_MS;
  private sessionListener = () => void this.refresh();

  getSnapshot() {
    return this.snapshot;
  }

  setPollInterval(milliseconds: number) {
    const next = normalizePollInterval(milliseconds);
    if (next === this.pollIntervalMs) return;
    this.pollIntervalMs = next;
    if (this.listeners.size > 0 && !this.requestController) this.scheduleNext();
  }

  subscribe(listener: (snapshot: MarketSnapshot) => void) {
    this.listeners.add(listener);
    listener(this.snapshot);
    if (this.listeners.size === 1) {
      window.addEventListener("tlyn-session-updated", this.sessionListener);
      void this.refresh();
    }
    return () => {
      this.listeners.delete(listener);
      if (this.listeners.size === 0) this.stop();
    };
  }

  private notify() {
    this.listeners.forEach((listener) => listener(this.snapshot));
  }

  private stop() {
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = null;
    this.requestController?.abort();
    this.requestController = null;
    window.removeEventListener("tlyn-session-updated", this.sessionListener);
  }

  private scheduleNext() {
    if (this.listeners.size === 0) return;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => {
      this.pollTimer = null;
      void this.refresh();
    }, this.pollIntervalMs);
  }

  private async refresh() {
    if (this.listeners.size === 0 || this.requestController) return;
    const requestId = ++this.requestSequence;
    const controller = new AbortController();
    this.requestController = controller;
    const timeout = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    const previous = this.snapshot;

    try {
      const [bookResult, statsResult] = await Promise.allSettled([
        fetchJson<RawOrderbookPayload>(ORDERBOOK_API, controller.signal),
        fetchJson<RawPricePayload>(PRICE_API, controller.signal),
      ]);
      if (requestId !== this.requestSequence || this.listeners.size === 0) return;

      const now = Date.now();
      const failureStatus = bookResult.status === "rejected" && typeof bookResult.reason === "object" && bookResult.reason
        ? Number((bookResult.reason as { status?: number }).status)
        : 0;
      this.snapshot = reduceMarketResponse(
        previous,
        bookResult.status === "fulfilled" ? bookResult.value : null,
        statsResult.status === "fulfilled" ? statsResult.value : null,
        now,
        [401, 403, 503].includes(failureStatus),
      );
      this.notify();
    } catch {
      if (!controller.signal.aborted && requestId === this.requestSequence) {
        this.snapshot = { ...previous, sequence: previous.sequence + 1, health: "stale", updatedAt: Date.now() };
        this.notify();
      }
    } finally {
      window.clearTimeout(timeout);
      if (this.requestController === controller) this.requestController = null;
      this.scheduleNext();
    }
  }
}
