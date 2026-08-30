import assert from "node:assert/strict";
import test from "node:test";
import { clampCandleWicks, HOURLY_MAX_WICK_RATIO, HOURLY_MAX_WICK_TO_BODY, rialToToman, withLiveClose } from "../app/candle-cleaner.ts";

test("converts every chart price from rial to toman", () => {
  assert.equal(rialToToman(217_681_000), 21_768_100);
});

test("clamps each wick to one percent beyond the real candle body", () => {
  const candle = clampCandleWicks({ time: 1, open: 100, high: 140, low: 60, close: 110 });
  assert.equal(candle.open, 100);
  assert.equal(candle.close, 110);
  assert.equal(candle.high, 111.1);
  assert.equal(candle.low, 99);
});

test("repairs invalid high and low without changing the body", () => {
  const candle = clampCandleWicks({ time: 1, open: 110, high: 105, low: 120, close: 100 });
  assert.equal(candle.high, 110);
  assert.equal(candle.low, 100);
});

test("keeps hourly wicks close to the candle body", () => {
  const candle = clampCandleWicks({ time: 1, open: 100, high: 140, low: 60, close: 110 }, HOURLY_MAX_WICK_RATIO, HOURLY_MAX_WICK_TO_BODY);
  assert.equal(candle.high, 110.055);
  assert.equal(candle.low, 99.95);
});

test("uses the real live match as close and keeps wick limits", () => {
  const candle = withLiveClose({ time: 1, open: 100, high: 102, low: 98, close: 101 }, 120);
  assert.equal(candle.open, 100);
  assert.equal(candle.close, 120);
  assert.equal(candle.high, 120);
  assert.equal(candle.low, 99);
});
