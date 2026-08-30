import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("contains the complete Persian spot-market surface", async () => {
  const page = await readFile(new URL("../app/page.tsx", import.meta.url), "utf8");
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");

  assert.match(layout, /title:\s*"بازار اسپات طلای ۱۸ عیار"/);
  assert.match(page, /طلای ۱۸ عیار/);
  assert.match(page, /طلاین/);
  assert.match(page, /دفتر سفارش‌ها/);
  assert.match(page, /نمودار طلای ۱۸ عیار/);
  assert.match(page, /تومان/);
  assert.match(page, /۱۵ دقیقه/);
  assert.match(page, /مقدار خرید/);
  assert.match(page, /مقدار فروش/);
  assert.doesNotMatch(page, /مچ‌انجین|بازار فعال|معاملات امروز|حجم امروز|trade-chip|۱۵ سفارش|اتصال پایدار|منبع قیمت|داده‌های سفارش/);
  assert.doesNotMatch(page, />O\s|>H\s|>L\s|>C\s/);
});

test("keeps the wall fixed, scalable, API-ready, and motion-aware", async () => {
  const [page, marketData, orderbookRoute, historyRoute, sessionRoute, marketSession, seed, css, config, layout, packageJson] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/market-data.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/orderbook/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/history/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/api/market-session/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/market-session.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/history-seed.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../next.config.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
  ]);

  assert.match(page, /Math\.min\(window\.innerWidth \/ 960, window\.innerHeight \/ 576\)/);
  assert.match(page, /<canvas/);
  assert.match(page, /\["1d", "4h", "15m"\]/);
  assert.match(page, /function PairedOrderRows/);
  assert.match(page, /sellDepth = ask\.amount \/ Math\.max\(askMax/);
  assert.match(page, /buyDepth = bid\.amount \/ Math\.max\(bidMax/);
  assert.match(page, /"--sell-depth": String\(sellDepth\)/);
  assert.match(page, /"--buy-depth": String\(buyDepth\)/);
  assert.match(page, /const isFifteenMinute = timeframe === "15m"/);
  assert.match(page, /مقدار فروش[\s\S]*قیمت فروش[\s\S]*قیمت خرید[\s\S]*مقدار خرید/);
  assert.match(page, /اختلاف بهترین قیمت خرید و فروش/);
  assert.match(page, /toman\(snapshot\.lastPrice\)/);
  assert.match(marketData, /export interface MarketDataProvider/);
  assert.match(marketData, /export class TlynMarketDataProvider/);
  assert.match(marketData, /const BOOK_LEVELS = 15/);
  assert.match(marketData, /const LIVE_LEVELS = 5/);
  assert.match(marketData, /function exactLevels/);
  assert.match(marketData, /function validateOrderbook/);
  assert.match(marketData, /function hasExactLivePrefix/);
  assert.match(marketData, /private lastValidatedOrderbook/);
  assert.match(marketData, /slice\(0, LIVE_LEVELS\)/);
  assert.match(marketData, /const candidateBestBid = realBids\[0\]\?\.price/);
  assert.match(marketData, /const candidateBestAsk = realAsks\[0\]\?\.price/);
  assert.match(marketData, /const hasValidLivePrefix = Boolean\(sourceBook\)/);
  assert.match(marketData, /const POLL_INTERVAL_MS = 3_000/);
  assert.match(marketData, /const BOOK_UPDATE_DELAY = \{ min: 2_400, max: 5_600 \}/);
  assert.match(marketData, /const TICKER_UPDATE_DELAY = \{ min: 1_500, max: 3_400 \}/);
  assert.match(marketData, /private scheduleBookUpdate/);
  assert.match(marketData, /private scheduleTickerUpdate/);
  assert.match(marketData, /private stopVisualSimulation/);
  assert.match(marketData, /private claimVisualMotion/);
  assert.match(marketData, /setTimeout/);
  assert.match(marketData, /clearTimeout/);
  assert.match(marketData, /index >= LIVE_LEVELS && level\.origin === "supplemental"/);
  assert.match(marketData, /randomBetween\(0\.45, 1\.75\)/);
  assert.match(marketData, /motion: "reprice"/);
  assert.match(marketData, /apiPriceChanged/);
  assert.match(marketData, /https:\/\/price\.tlyn\.ir\/api\/v1\/price/);
  assert.match(marketData, /localStorage\.setItem\(CACHE_KEY/);
  assert.match(marketData, /fetch\(HISTORY_API/);
  assert.match(marketData, /HISTORICAL_CANDLE_SEED/);
  assert.match(marketData, /candles:v4/);
  assert.match(seed, /HISTORICAL_CANDLE_SEED/);
  assert.equal((seed.match(/"time":/g) ?? []).length, 270);
  assert.match(marketData, /sort\(\(a, b\) => side === "buy" \? b\.price - a\.price : a\.price - b\.price\)/);
  assert.doesNotMatch(marketData, /createCandles/);
  assert.doesNotMatch(marketData, /volume:/);
  assert.match(orderbookRoute, /getMarketCookie/);
  assert.match(orderbookRoute, /https:\/\/my\.tlyn\.ir\/api\/v1\/orders\/data/);
  assert.doesNotMatch(orderbookRoute, /analytics_token|apptlynir_session=|XSRF-TOKEN/);
  assert.match(historyRoute, /candle-price-chart/);
  assert.match(historyRoute, /"15m": \{ value: "15"/);
  assert.match(historyRoute, /"4h": \{ value: "240"/);
  assert.doesNotMatch(historyRoute, /analytics_token|apptlynir_session=|XSRF-TOKEN/);
  assert.match(page, /identity-trigger/);
  assert.match(page, /\/api\/market-session/);
  assert.match(page, /تست اتصال/);
  assert.match(sessionRoute, /testMarketCookie/);
  assert.match(sessionRoute, /saveMarketCookie/);
  assert.match(marketSession, /\.runtime/);
  assert.match(marketSession, /process\.env\.TLYN_SESSION_COOKIE/);
  assert.doesNotMatch(`${sessionRoute}\n${marketSession}`, /analytics_token|XSRF-TOKEN/);
  assert.doesNotMatch(config, /TLYN_SESSION_COOKIE:\s*orderbookSession/);
  assert.match(css, /\.stage\s*\{[^}]*width: 960px;[^}]*height: 576px;/s);
  assert.match(css, /right: 50%/);
  assert.match(css, /left: 50%/);
  assert.match(css, /\.sell-depth[\s\S]*right: 50%[\s\S]*scaleX\(var\(--sell-depth\)\)/);
  assert.match(css, /\.buy-depth[\s\S]*left: 50%[\s\S]*scaleX\(var\(--buy-depth\)\)/);
  assert.match(css, /transition: transform 880ms/);
  assert.match(css, /rowReposition/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /YekanBakhFaNum-Regular\.woff2/);
  assert.match(layout, /lang="fa" dir="rtl"/);
  assert.doesNotMatch(packageJson, /@fontsource-variable\/estedad/);
  assert.doesNotMatch(packageJson, /react-loading-skeleton/);
  assert.match(packageJson, /"next":/);
  await access(new URL("../public/taline-logo.png", import.meta.url));
  await access(new URL("../public/fonts/YekanBakhFaNum-Regular.woff2", import.meta.url));
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
  await assert.rejects(access(new URL("../app/_sites-preview/preview.css", import.meta.url)));
  await access(new URL("../.openai/hosting.json", import.meta.url));
  await access(root);
});
