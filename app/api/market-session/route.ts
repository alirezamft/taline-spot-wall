import { getMarketCookie, saveMarketCookie, testMarketCookie } from "../../market-session";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const headers = { "Cache-Control": "no-store, max-age=0" };

export async function GET() {
  return Response.json({ configured: Boolean(await getMarketCookie()) }, { headers });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { action?: unknown; cookie?: unknown } | null;
  if (!body || (body.action !== "test" && body.action !== "save")) {
    return Response.json({ ok: false, error: "INVALID_REQUEST" }, { status: 400, headers });
  }

  const result = await testMarketCookie(body.cookie);
  if (!result.ok) {
    return Response.json(result, { status: 422, headers });
  }
  if (body.action === "save" && !(await saveMarketCookie(body.cookie))) {
    return Response.json({ ok: false, error: "INVALID_COOKIE" }, { status: 400, headers });
  }
  return Response.json({ ok: true, upstreamStatus: result.upstreamStatus, saved: body.action === "save" }, { headers });
}
