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
export const RIALS_PER_TOMAN = 10;

export function rialToToman(value: number) {
  return value / RIALS_PER_TOMAN;
}

/**
 * Keeps the real candle body untouched while limiting malformed/extreme wicks.
 * A wick may extend at most one percent beyond the corresponding body edge.
 */
export function clampCandleWicks<T extends CandleShape>(bar: T, maxWickRatio = MAX_WICK_RATIO, maxWickToBody = Number.POSITIVE_INFINITY): T {
  const bodyHigh = Math.max(bar.open, bar.close);
  const bodyLow = Math.min(bar.open, bar.close);
  const bodySize = bodyHigh - bodyLow;
  const highPriceAllowance = bodyHigh * maxWickRatio;
  const lowPriceAllowance = bodyLow * maxWickRatio;
  const bodyAllowance = bodySize > 0 ? bodySize * maxWickToBody : Number.POSITIVE_INFINITY;
  const highLimit = bodyHigh + Math.min(highPriceAllowance, bodyAllowance);
  const lowLimit = bodyLow - Math.min(lowPriceAllowance, bodyAllowance);

  return {
    ...bar,
    high: Math.max(bodyHigh, Math.min(bar.high, highLimit)),
    low: Math.min(bodyLow, Math.max(bar.low, lowLimit)),
  };
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
