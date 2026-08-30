export interface CandleShape {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export const MAX_WICK_RATIO = 0.01;
export const RIALS_PER_TOMAN = 10;

export function rialToToman(value: number) {
  return value / RIALS_PER_TOMAN;
}

/**
 * Keeps the real candle body untouched while limiting malformed/extreme wicks.
 * A wick may extend at most one percent beyond the corresponding body edge.
 */
export function clampCandleWicks<T extends CandleShape>(bar: T, maxWickRatio = MAX_WICK_RATIO): T {
  const bodyHigh = Math.max(bar.open, bar.close);
  const bodyLow = Math.min(bar.open, bar.close);
  const highLimit = bodyHigh * (1 + maxWickRatio);
  const lowLimit = bodyLow * (1 - maxWickRatio);

  return {
    ...bar,
    high: Math.max(bodyHigh, Math.min(bar.high, highLimit)),
    low: Math.min(bodyLow, Math.max(bar.low, lowLimit)),
  };
}

/** Applies a real last-match price only to the still-open candle. */
export function withLiveClose<T extends CandleShape>(bar: T, price: number): T {
  return clampCandleWicks({
    ...bar,
    close: price,
    high: Math.max(bar.high, price),
    low: Math.min(bar.low, price),
  });
}
