import { getMarketCookie } from "../../market-session";

const SENTIMENT_ENDPOINT = "https://my.tlyn.ir/api/v2/gold-transactions/supply-demand";

export const dynamic = "force-dynamic";
export const preferredRegion = "fra1";
export const runtime = "nodejs";

export async function GET() {
  const sessionCookie = await getMarketCookie();
  if (!sessionCookie) {
    return Response.json(
      { status: false, error: "SENTIMENT_SESSION_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const response = await fetch(SENTIMENT_ENDPOINT, {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(3_500),
      headers: { Accept: "application/json", Cookie: sessionCookie },
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.includes("application/json")) {
      const status = response.status === 401 || response.status === 403 ? response.status : 502;
      return Response.json(
        { status: false, error: status === 502 ? "SENTIMENT_UPSTREAM_ERROR" : "SENTIMENT_UNAUTHORIZED" },
        { status, headers: { "Cache-Control": "no-store" } },
      );
    }
    return Response.json(await response.json(), { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    return Response.json(
      { status: false, error: "SENTIMENT_UPSTREAM_UNAVAILABLE" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
