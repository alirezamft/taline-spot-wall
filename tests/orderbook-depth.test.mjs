import assert from "node:assert/strict";
import test from "node:test";

import {
  getOrderBookDepthWidth,
  ORDER_BOOK_MIN_DEPTH_WIDTH,
} from "../app/orderbook-depth.ts";

test("keeps every positive real order visible while preserving depth hierarchy", () => {
  const volumes = [30, 10, 4, 1, 0.2, 0.05, 0.01];
  const widths = volumes.map((volume) => getOrderBookDepthWidth(volume, 30));

  assert.equal(widths[0], 100);
  assert.ok(widths.at(-1) >= ORDER_BOOK_MIN_DEPTH_WIDTH);
  widths.slice(1).forEach((width, index) => assert.ok(widths[index] > width));
});

test("normalizes the visible bid and ask sides independently", () => {
  const visibleAsks = [30, 4, 0.2];
  const visibleBids = [10, 1, 0.01];
  const maxVisibleAskVolume = Math.max(...visibleAsks);
  const maxVisibleBidVolume = Math.max(...visibleBids);

  assert.equal(getOrderBookDepthWidth(30, maxVisibleAskVolume), 100);
  assert.equal(getOrderBookDepthWidth(10, maxVisibleBidVolume), 100);
  assert.ok(getOrderBookDepthWidth(4, maxVisibleAskVolume) < 100);
  assert.ok(getOrderBookDepthWidth(1, maxVisibleBidVolume) < 100);
});

test("returns zero for invalid depth inputs and caps values at 100 percent", () => {
  assert.equal(getOrderBookDepthWidth(0, 30), 0);
  assert.equal(getOrderBookDepthWidth(-1, 30), 0);
  assert.equal(getOrderBookDepthWidth(Number.NaN, 30), 0);
  assert.equal(getOrderBookDepthWidth(undefined, 30), 0);
  assert.equal(getOrderBookDepthWidth(1, 0), 0);
  assert.equal(getOrderBookDepthWidth(31, 30), 100);
});
