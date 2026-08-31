import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("keeps the existing Persian videowall and operator session control", async () => {
  const [page, css, sessionRoute, sessionStore, connectivityRoute, layout] = await Promise.all([
    read("app/page.tsx"),
    read("app/globals.css"),
    read("app/api/market-session/route.ts"),
    read("app/market-session.ts"),
    read("app/api/connectivity-check/route.ts"),
    read("app/layout.tsx"),
  ]);

  assert.match(layout, /lang="fa" dir="rtl"/);
  assert.match(page, /const scale = window\.innerWidth \/ STAGE_WIDTH/);
  assert.match(page, /requestedHeight = window\.innerHeight \* \(heightPercent \/ 100\)/);
  assert.match(page, /Math\.min\(MAX_RESPONSIVE_STAGE_HEIGHT, requestedHeight \/ scale\)/);
  assert.match(page, /PAGE_RELOAD_INTERVAL_MS = 10 \* 60 \* 1_000/);
  assert.match(page, /fetch\("\/api\/connectivity-check"/);
  assert.match(page, /payload\.online === true/);
  assert.match(page, /window\.location\.reload\(\)/);
  assert.match(connectivityRoute, /https:\/\/www\.digikala\.com\//);
  assert.match(connectivityRoute, /method: "HEAD"/);
  assert.match(connectivityRoute, /online: false/);
  assert.match(page, /طلاین/);
  assert.match(page, /دفتر سفارش‌ها/);
  assert.doesNotMatch(page, />عمق بازار</);
  assert.doesNotMatch(page, /className={`book-center/);
  assert.match(page, /قیمت آخرین معامله در بازار پیشرفته/);
  assert.match(page, /GOLD18 \/ IRT/);
  assert.match(page, /تعادل حجم سفارش‌ها/);
  assert.match(page, /className="header-value/);
  assert.match(page, /<small>تومان<\/small>/);
  assert.doesNotMatch(page, /price-column-gap/);
  assert.match(page, /انتخاب بازه کندل/);
  assert.match(page, /identity-trigger/);
  assert.match(page, /\/api\/market-session/);
  assert.match(page, /تست اتصال/);
  assert.match(page, /تأیید و ذخیره/);
  assert.match(sessionRoute, /testMarketCookie/);
  assert.match(sessionRoute, /saveMarketCookie/);
  assert.match(sessionStore, /\.runtime/);
  assert.match(sessionStore, /process\.env\.TLYN_SESSION_COOKIE/);
  assert.match(css, /\.market-stage\s*\{[^}]*width: 960px;[^}]*height: var\(--stage-height, 576px\)/s);
  assert.match(css, /\.wall-layout\s*\{[^}]*width: 1344px;[^}]*height: var\(--stage-height, 576px\)/s);
  assert.match(css, /Dana-Regular\.woff2/);
  assert.match(css, /--row-refresh: #eeeeee/);
  assert.match(page, /tlyn-orderbook-motion-v2/);
  assert.match(page, /tlyn-orderbook-price-flash-v2/);
  assert.match(page, /tlyn-spot-theme-v2/);
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

  assert.match(marketData, /DEFAULT_POLL_INTERVAL_MS = 5_000/);
  assert.match(marketData, /setPollInterval\(milliseconds: number\)/);
  assert.match(marketData, /this\.pollIntervalMs/);
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
  assert.match(marketData, /tlyn-last-real-market-snapshot/);
  assert.match(marketData, /window\.sessionStorage\.getItem/);
  assert.match(marketData, /health: "stale" as const/);
  assert.doesNotMatch(production, /Math\.random|stableAmount|supplemental|BOOK_LEVELS|LIVE_LEVELS|HISTORICAL_CANDLE_SEED|MockMarketDataProvider|createCandles|updateCandles/);
  assert.doesNotMatch(marketData, /setInterval/);
  assert.match(orderbookRoute, /https:\/\/my\.tlyn\.ir\/api\/v1\/orders\/data/);
  assert.match(orderbookRoute, /getMarketCookie/);
  assert.match(priceRoute, /https:\/\/price\.tlyn\.ir\/api\/v1\/price/);
  assert.match(page, /rowCount = Math\.max\(bids\.length, asks\.length\)/);
  assert.match(page, /maxVisibleVolume = Math\.max/);
  assert.match(page, /getOrderBookDepthWidth\(ask\?\.amount, maxVisibleVolume\)/);
  assert.match(page, /getOrderBookDepthWidth\(bid\?\.amount, maxVisibleVolume\)/);
  assert.doesNotMatch(page, /askMax|bidMax/);
  assert.match(page, /key=\{`\$\{ask\?\.price/);
  assert.match(page, /normal: \{ step: 300, depthDuration: 840 \}/);
  assert.match(page, /"freeze-replay"/);
  assert.doesNotMatch(page, /"depth-random"|nextRandomPulse|randomRow/);
  assert.match(page, /Math\.max\(refreshSeconds \* 1_000, fullCycleDuration\)/);
  assert.match(page, /duration=\{profile\.depthDuration\}/);
  assert.match(css, /rowRefreshEven 620ms ease-out var\(--refresh-delay\)/);
  assert.match(css, /transition: transform 130ms ease-out/);
  assert.match(css, /replaySellA var\(--depth-duration\)[^;]*forwards/);
  assert.match(css, /replayBuyA var\(--depth-duration\)[^;]*forwards/);
  assert.match(css, /freezeRowA/);
  assert.match(css, /--row-freeze: rgba\(246,248,250,\.96\)/);
  assert.match(css, /freezeRowA var\(--freeze-duration\)/);
  assert.match(css, /sellPriceRefreshA 520ms ease-out var\(--content-delay\)/);
  assert.match(css, /bookTypeA var\(--depth-duration\)[^;]*var\(--content-delay\)/);
  assert.match(page, /contentDelay = animationDelay \+ freezeDuration/);
  assert.match(page, /شمارنده تا عدد نهایی/);
  assert.match(page, /تایپ عدد نهایی/);
  assert.match(page, /فلش قیمت/);
  assert.match(page, /بازه دریافت و رفرش \(ثانیه\)/);
  assert.match(page, /سرعت اجرای ردیف‌ها/);
  assert.match(css, /bookTypeA/);
  assert.match(page, /paired-amount sell-amount[^\n]*motion=/);
  assert.match(page, /ask\.price \* ask\.amount/);
  assert.match(page, /bid\.price \* bid\.amount/);
  assert.match(page, /کل فروش/);
  assert.match(page, /کل خرید/);
  assert.match(css, /scaleX\(var\(--sell-depth\)\)/);
  assert.match(css, /scaleX\(var\(--buy-depth\)\)/);
  assert.match(css, /grid-template-rows: repeat\(var\(--book-row-count, 15\), minmax\(0, 1fr\)\)/);
  assert.match(css, /grid-template-columns: \.92fr 1\.08fr 1\.08fr \.92fr/);
  assert.doesNotMatch(css, /price-column-gap/);
  assert.match(page, /--book-row-count/);
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
  assert.match(chart, /chart_style: "Candle"/);
  assert.match(chart, /rialToToman/);
  assert.match(chart, /clampNaturalCandleWicks/);
  assert.match(chart, /withNaturalLiveClose/);
  assert.match(page, /lastPrice === null \? null : lastPrice \/ 10/);
  assert.match(chart, /symbol: "GOLD18IRT"/);
  assert.match(chart, /parentHostname: "my\.tlyn\.ir"/);
  assert.match(chart, /theme: "taline"/);
  assert.match(chart, /calendar_type: "shamsi"/);
  assert.match(chart, /"header_widget"/);
  assert.match(chart, /"left_toolbar"/);
  assert.match(chart, /"timeframes_toolbar"/);
  assert.match(chart, /"widget_logo"/);
  assert.match(chart, /"adaptive_logo"/);
  assert.match(chart, /"use_localstorage_for_settings"/);
  assert.match(chart, /mainSeriesProperties\.candleStyle\.upColor/);
  assert.match(chart, /"color-palette"/);
  assert.match(chart, /LIGHT_CHART_OVERRIDES/);
  assert.match(chart, /mode: theme/);
  assert.match(chart, /mainSeriesProperties\.showCountdown/);
  assert.match(chart, /visible_plots_set: "ohlc"/);
  assert.doesNotMatch(chart, /has_no_volume/);
  assert.match(chart, /pushExternalData\("bar"/);
  assert.doesNotMatch(chart, /candle-countdown|useCandleCountdown/);
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
  assert.match(resolutionRoute, /"240": 4 \* 60 \* 60/);
  assert.doesNotMatch(`${chart}\n${candleRoute}`, /Math\.random|fake|mock|seed/);
  await assert.rejects(access(new URL("../app/history-seed.ts", import.meta.url)));
  await assert.rejects(access(new URL("../app/api/history/route.ts", import.meta.url)));
});

test("keeps required assets and no obsolete starter surface", async () => {
  await access(new URL("../public/taline-logo.png", import.meta.url));
  await access(new URL("../public/fonts/Dana-Regular.woff2", import.meta.url));
  const [page, analysis, sentimentRoute] = await Promise.all([
    read("app/page.tsx"),
    read("public/market-analysis.html"),
    read("app/api/market-sentiment/route.ts"),
  ]);
  assert.match(page, /STAGE_WIDTH = 1_344/);
  assert.match(page, /src="\/market-analysis\.html"/);
  assert.match(page, /نمودار طلای ۱۸ عیار/);
  assert.match(page, /useState<ChartTimeframe>\("1d"\)/);
  assert.match(page, /"4h": "۴ ساعت"/);
  assert.match(page, /نمایش نمودار/);
  assert.match(page, /تم بخش اسپات/);
  assert.match(page, /ارتفاع نمایشگر \(درصد\)/);
  assert.match(page, /data-theme=\{theme\}/);
  assert.match(analysis, /const API_URL = '\/api\/market-price'/);
  assert.match(analysis, /const SENTIMENT_URL = '\/api\/market-sentiment'/);
  assert.match(analysis, /#needle\s*\{[^}]*opacity: 0/s);
  assert.match(analysis, /\.gauge__needle\s*\{\s*opacity: 1;/);
  assert.doesNotMatch(analysis, /id="(?:buyGram|sellGram)">[۰-۹]/);
  assert.match(sentimentRoute, /https:\/\/my\.tlyn\.ir\/api\/v2\/gold-transactions\/supply-demand/);
  assert.match(sentimentRoute, /getMarketCookie/);
  await access(new URL("../Start Spot Wall.command", import.meta.url));
  await assert.rejects(access(new URL("../app/_sites-preview/SkeletonPreview.tsx", import.meta.url)));
  await access(new URL("../.openai/hosting.json", import.meta.url));
});
