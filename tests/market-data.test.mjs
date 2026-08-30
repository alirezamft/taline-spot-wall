import assert from "node:assert/strict";
import test from "node:test";
import { initialSnapshot, normalizeOrderbook, normalizePollInterval, normalizeStats, reduceMarketResponse } from "../app/market-data.ts";

const bookPayload = {
  status: true,
  data: {
    active_orders: {
      buy: [
        { quote: "3000", total_gram: 1.25, order_count: 1 },
        { quote: "5000", total_gram: 2.5, order_count: 2 },
        { quote: "4000", total_gram: 0.75, order_count: 1 },
      ],
      sell: [
        { quote: "8000", total_gram: 4.5, order_count: 2 },
        { quote: "7000", total_gram: 3.25, order_count: 1 },
      ],
    },
    prices: { main_price: 6100 },
    last_price: 6200,
  },
};

const pricePayload = {
  prices: [
    { symbol: "OTHER", price: { highest: 99, lowest: 1 } },
    { symbol: "GOLD18", price: { highest: 22, lowest: 20 } },
  ],
};

test("normalizes every and only API order level", () => {
  const book = normalizeOrderbook(bookPayload);
  assert.ok(book);
  assert.equal(book.bids.length, bookPayload.data.active_orders.buy.length);
  assert.equal(book.asks.length, bookPayload.data.active_orders.sell.length);
  assert.deepEqual(book.bids.map((level) => level.price), [5000, 4000, 3000]);
  assert.deepEqual(book.asks.map((level) => level.price), [7000, 8000]);
  assert.deepEqual(book.bids.map((level) => level.amount), [2.5, 0.75, 1.25]);
  assert.equal(book.lastPrice, bookPayload.data.last_price);
});

test("selects GOLD18 highest and lowest with the service scale", () => {
  assert.deepEqual(normalizeStats(pricePayload), { high24h: 220000, low24h: 200000 });
});

test("keeps the last successful real snapshot during failure", () => {
  const live = reduceMarketResponse(initialSnapshot(), bookPayload, pricePayload, 1000);
  assert.equal(live.health, "live");
  assert.equal(live.refreshSequence, 1);
  const stale = reduceMarketResponse(live, null, null, 2000);
  assert.equal(stale.health, "stale");
  assert.equal(stale.lastPrice, live.lastPrice);
  assert.deepEqual(stale.bids, live.bids);
  assert.deepEqual(stale.asks, live.asks);
  assert.equal(stale.refreshSequence, live.refreshSequence);
});

test("an unchanged valid response remains live and triggers refresh feedback", () => {
  const first = reduceMarketResponse(initialSnapshot(), bookPayload, pricePayload, 1000);
  const second = reduceMarketResponse(first, bookPayload, pricePayload, 2000);
  assert.equal(second.health, "live");
  assert.equal(second.lastMove, "neutral");
  assert.equal(second.refreshSequence, first.refreshSequence + 1);
});

test("shows session-required before any real snapshot instead of market fallbacks", () => {
  const snapshot = reduceMarketResponse(initialSnapshot(), null, null, 1000, true);
  assert.equal(snapshot.health, "session-required");
  assert.equal(snapshot.lastPrice, null);
  assert.equal(snapshot.high24h, null);
  assert.deepEqual(snapshot.bids, []);
  assert.deepEqual(snapshot.asks, []);
});

test("accepts operator-defined orderbook polling intervals within safe limits", () => {
  assert.equal(normalizePollInterval(4_000), 4_000);
  assert.equal(normalizePollInterval(10_000), 10_000);
  assert.equal(normalizePollInterval(100), 1_000);
  assert.equal(normalizePollInterval(900_000), 300_000);
});
