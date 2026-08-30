import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("keeps the existing Persian videowall and operator session control", async () => {
  const [page, css, sessionRoute, sessionStore, layout] = await Promise.all([
    read("app/page.tsx"),
    read("app/globals.css"),
    read("app/api/market-session/route.ts"),
    read("app/market-session.ts"),
    read("app/layout.tsx"),
  ]);

  assert.match(layout, /lang="fa" dir="rtl"/);
  assert.match(page, /Math\.min\(window\.innerWidth \/ 960, window\.innerHeight \/ 576\)/);
  assert.match(page, /طلاین/);
  assert.match(page, /دفتر سفارش‌ها/);
  assert.match(page, /نمودار طلای ۱۸ عیار/);
  assert.match(page, /identity-trigger/);
  assert.match(page, /\/api\/market-session/);
  assert.match(page, /تست اتصال/);
  assert.match(page, /تأیید و ذخیره/);
  assert.match(sessionRoute, /testMarketCookie/);
  assert.match(sessionRoute, /saveMarketCookie/);
  assert.match(sessionStore, /\.runtime/);
  assert.match(sessionStore, /process\.env\.TLYN_SESSION_COOKIE/);
  assert.match(css, /\.stage\s*\{[^}]*width: 960px;[^}]*height: 576px;/s);
  assert.match(css, /YekanBakhFaNum-Regular\.woff2/);
  assert.doesNotMatch(`${page}\n${sessionRoute}\n${sessionStore}`, /analytics_token=|XSRF-TOKEN=|apptlynir_session=ey/);
});

test("uses only real order-book and market-stat data", async () => {
  const [page, marketData, orderbookRoute, priceRoute, css] = await Promise.all([
    read("app/page.tsx"),
    read("app/market-data.ts"),
    read("app/api/orderbook/route.ts"),
    read("app/api/market-price/route.ts"),
    read("app/globals.css"),
  ]);
  const production = `${page}\n${marketData}`;

  assert.match(marketData, /const POLL_INTERVAL_MS = 5_000/);
  assert.match(marketData, /private requestController/);
  assert.match(marketData, /if \(this\.listeners\.size === 0 \|\| this\.requestController\) return/);
  assert.match(marketData, /this\.requestController\?\.abort\(\)/);
  assert.match(marketData, /payload\.data\.active_orders\?\.buy/);
  assert.match(marketData, /payload\.data\.active_orders\?\.sell/);
  assert.match(marketData, /payload\.data\.last_price/);
  assert.match(marketData, /item\.symbol === "GOLD18"/);
  assert.match(marketData, /gold\?\.price\?\.highest/);
  assert.match(marketData, /gold\?\.price\?\.lowest/);
  assert.match(marketData, /stats\?\.high24h \?\? previous\.high24h/);
  assert.match(marketData, /stats\?\.low24h \?\? previous\.low24h/);
  assert.match(marketData, /refreshSequence: previous\.refreshSequence \+ 1/);
  assert.match(marketData, /health: stats \? "live" as const : "stale" as const/);
  assert.doesNotMatch(production, /Math\.random|stableAmount|supplemental|BOOK_LEVELS|LIVE_LEVELS|HISTORICAL_CANDLE_SEED|MockMarketDataProvider|createCandles|updateCandles/);
  assert.doesNotMatch(marketData, /setInterval/);
  assert.match(orderbookRoute, /https:\/\/my\.tlyn\.ir\/api\/v1\/orders\/data/);
  assert.match(orderbookRoute, /getMarketCookie/);
  assert.match(priceRoute, /https:\/\/price\.tlyn\.ir\/api\/v1\/price/);
  assert.match(page, /rowCount = Math\.max\(bids\.length, asks\.length\)/);
  assert.match(page, /ask\.amount \/ askMax/);
  assert.match(page, /bid\.amount \/ bidMax/);
  assert.match(page, /key=\{`\$\{ask\?\.price/);
  assert.match(page, /index \* 200/);
  assert.match(css, /rowRefreshEven 420ms ease-out var\(--refresh-delay\)/);
  assert.match(css, /transition: transform 880ms/);
  assert.match(css, /scaleX\(var\(--sell-depth\)\)/);
  assert.match(css, /scaleX\(var\(--buy-depth\)\)/);
  assert.doesNotMatch(css, /numberShockUp|numberShockDown/);
});

test("uses Bitycle with authenticated real candle data", async () => {
  const [page, chart, candleRoute, resolutionRoute] = await Promise.all([
    read("app/page.tsx"),
    read("app/bitycle-chart.tsx"),
    read("app/api/candles/route.ts"),
    read("app/api/candles/resolutions/route.ts"),
  ]);

  assert.match(page, /<BitycleChart/);
  assert.doesNotMatch(page, /<canvas|drawMarketChart/);
  assert.match(chart, /widget\.bitycle\.com\/static\/script\/v1\/script\.js/);
  assert.match(chart, /datafeed_type: "external"/);
  assert.match(chart, /symbol: "GOLD18IRT"/);
  assert.match(chart, /calendar_type: "shamsi"/);
  assert.match(chart, /Asia\/Tehran/);
  assert.match(chart, /function toChartTime/);
  assert.match(chart, /function fromChartTime/);
  assert.match(chart, /case "getBars"/);
  assert.match(chart, /case "subscribeBars"/);
  assert.match(chart, /case "unsubscribeBars"/);
  assert.match(chart, /case "subscribeQuotes"/);
  assert.match(chart, /case "unsubscribeQuotes"/);
  assert.match(candleRoute, /https:\/\/my\.tlyn\.ir\/api\/v1\/candle-price-chart/);
  assert.match(candleRoute, /getMarketCookie/);
  assert.match(resolutionRoute, /"15": 15 \* 60/);
  assert.match(resolutionRoute, /"60": 60 \* 60/);
  assert.doesNotMatch(`${chart}\n${candleRoute}`, /Math\.random|fake|mock|seed/);
  await assert.rejects(access(new URL("../app/history-seed.ts", import.meta.url)));
  await assert.rejects(access(new URL("../app/api/history/route.ts", import.meta.url)));
});

test("keeps required assets and no obsolete starter surface", async () => {
  await access(new URL("../public/taline-logo.png", import.meta.url));
  await access(new URL("../public/fonts/YekanBakhFaNum-Regular.woff2", import.meta.url));
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
  await access(new URL("../.openai/hosting.json", import.meta.url));
});
