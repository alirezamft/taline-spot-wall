import { NextResponse } from "next/server";

const CONNECTIVITY_TARGET = "https://www.digikala.com/";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetch(CONNECTIVITY_TARGET, {
      method: "HEAD",
      cache: "no-store",
      redirect: "follow",
      signal: AbortSignal.timeout(6_000),
      headers: { "User-Agent": "TalineSpotWall/1.0 connectivity-check" },
    });
    return NextResponse.json(
      { online: response.status >= 200 && response.status < 500 },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  } catch {
    return NextResponse.json(
      { online: false },
      { headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }
}
