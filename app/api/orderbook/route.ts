const ORDERBOOK_ENDPOINT = "https://my.tlyn.ir/api/v1/orders/data";

export const dynamic = "force-dynamic";
export const preferredRegion = "fra1";

export async function GET() {
  const sessionCookie = process.env.TLYN_SESSION_COOKIE;

  if (!sessionCookie) {
    return Response.json(
      { status: false, error: "ORDERBOOK_SESSION_UNAVAILABLE" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const response = await fetch(ORDERBOOK_ENDPOINT, {
      cache: "no-store",
      signal: AbortSignal.timeout(2_500),
      headers: {
        Accept: "application/json",
        Cookie: sessionCookie,
      },
    });

    if (!response.ok) {
      return Response.json(
        { status: false, error: "ORDERBOOK_UPSTREAM_ERROR" },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }

    const payload = await response.json();
    return Response.json(payload, { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    return Response.json(
      { status: false, error: "ORDERBOOK_UPSTREAM_UNAVAILABLE" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
