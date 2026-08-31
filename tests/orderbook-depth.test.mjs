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

test("normalizes both sides against one shared visible maximum", () => {
  const sharedMaximum = Math.max(...[30, 4, 0.2], ...[10, 1, 0.01]);

  assert.equal(getOrderBookDepthWidth(30, sharedMaximum), 100);
  assert.ok(getOrderBookDepthWidth(10, sharedMaximum) < 100);
  assert.equal(
    getOrderBookDepthWidth(4, sharedMaximum),
    getOrderBookDepthWidth(4, sharedMaximum),
  );
});

test("returns zero for invalid depth inputs and caps values at 100 percent", () => {
  assert.equal(getOrderBookDepthWidth(0, 30), 0);
  assert.equal(getOrderBookDepthWidth(-1, 30), 0);
  assert.equal(getOrderBookDepthWidth(Number.NaN, 30), 0);
  assert.equal(getOrderBookDepthWidth(undefined, 30), 0);
  assert.equal(getOrderBookDepthWidth(1, 0), 0);
  assert.equal(getOrderBookDepthWidth(31, 30), 100);
});
