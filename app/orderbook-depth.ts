export const ORDER_BOOK_MIN_DEPTH_WIDTH = 1.5;
export const ORDER_BOOK_DEPTH_GAMMA = 0.55;

export function getOrderBookDepthWidth(
  volume: number | null | undefined,
  maxVisibleVolume: number,
) {
  if (
    !Number.isFinite(volume) ||
    (volume ?? 0) <= 0 ||
    !Number.isFinite(maxVisibleVolume) ||
    maxVisibleVolume <= 0
  ) {
    return 0;
  }

  const ratio = Math.min(1, Math.max(0, (volume as number) / maxVisibleVolume));
  return ORDER_BOOK_MIN_DEPTH_WIDTH
    + (100 - ORDER_BOOK_MIN_DEPTH_WIDTH) * Math.pow(ratio, ORDER_BOOK_DEPTH_GAMMA);
}
