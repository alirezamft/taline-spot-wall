const PRICE_ENDPOINT = "https://price.tlyn.ir/api/v1/price";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch(PRICE_ENDPOINT, {
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(3_500),
      headers: { Accept: "application/json" },
    });
    const contentType = response.headers.get("content-type") ?? "";
    if (!response.ok || !contentType.includes("application/json")) {
      return Response.json({ status: false, error: "PRICE_UPSTREAM_ERROR" }, { status: 502, headers: { "Cache-Control": "no-store" } });
    }
    return Response.json(await response.json(), { headers: { "Cache-Control": "no-store, max-age=0" } });
  } catch {
    return Response.json({ status: false, error: "PRICE_UPSTREAM_UNAVAILABLE" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
