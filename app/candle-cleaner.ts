export interface CandleShape {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export const MAX_WICK_RATIO = 0.01;
export const HOURLY_MAX_WICK_RATIO = 0.0005;
export const HOURLY_MAX_WICK_TO_BODY = 0.15;
export const NATURAL_MIN_WICK_RATIO = 0.003;
export const NATURAL_MAX_WICK_RATIO = 0.012;
export const NATURAL_MAX_WICK_TO_BODY = 0.55;
export const RIALS_PER_TOMAN = 10;

export function rialToToman(value: number) {
  return value / RIALS_PER_TOMAN;
}

/**
 * Keeps the real candle body untouched while limiting malformed/extreme wicks.
 * A wick may extend at most one percent beyond the corresponding body edge.
 */
export function clampCandleWicks<T extends CandleShape>(bar: T, maxWickRatio = MAX_WICK_RATIO, maxWickToBody = Number.POSITIVE_INFINITY): T {
  return clampCandleWicksBySide(bar, maxWickRatio, maxWickRatio, maxWickToBody);
}

function clampCandleWicksBySide<T extends CandleShape>(bar: T, highWickRatio: number, lowWickRatio: number, maxWickToBody: number): T {
  const bodyHigh = Math.max(bar.open, bar.close);
  const bodyLow = Math.min(bar.open, bar.close);
  const bodySize = bodyHigh - bodyLow;
  const highPriceAllowance = bodyHigh * highWickRatio;
  const lowPriceAllowance = bodyLow * lowWickRatio;
  const bodyAllowance = bodySize > 0 ? bodySize * maxWickToBody : Number.POSITIVE_INFINITY;
  const highLimit = bodyHigh + Math.min(highPriceAllowance, bodyAllowance);
  const lowLimit = bodyLow - Math.min(lowPriceAllowance, bodyAllowance);

  return {
    ...bar,
    high: Math.max(bodyHigh, Math.min(bar.high, highLimit)),
    low: Math.min(bodyLow, Math.max(bar.low, lowLimit)),
  };
}

function deterministicRatio(time: number, salt: number) {
  let value = (Math.trunc(time) ^ salt) >>> 0;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  const unit = ((value ^ (value >>> 16)) >>> 0) / 0xffffffff;
  return NATURAL_MIN_WICK_RATIO + unit * (NATURAL_MAX_WICK_RATIO - NATURAL_MIN_WICK_RATIO);
}

/**
 * Uses stable, candle-specific limits so real malformed spikes are removed
 * without giving every candle an identical wick silhouette after a reload.
 */
export function clampNaturalCandleWicks<T extends CandleShape>(bar: T): T {
  return clampCandleWicksBySide(
    bar,
    deterministicRatio(bar.time, 0x9e3779b9),
    deterministicRatio(bar.time, 0x85ebca6b),
    NATURAL_MAX_WICK_TO_BODY,
  );
}

/** Applies a real last-match price only to the still-open candle. */
export function withLiveClose<T extends CandleShape>(bar: T, price: number, maxWickRatio = MAX_WICK_RATIO, maxWickToBody = Number.POSITIVE_INFINITY): T {
  return clampCandleWicks({
    ...bar,
    close: price,
    high: Math.max(bar.high, price),
    low: Math.min(bar.low, price),
  }, maxWickRatio, maxWickToBody);
}

/** Applies the last real match and the same stable natural-wick policy. */
export function withNaturalLiveClose<T extends CandleShape>(bar: T, price: number): T {
  return clampNaturalCandleWicks({
    ...bar,
    close: price,
    high: Math.max(bar.high, price),
    low: Math.min(bar.low, price),
  });
}
