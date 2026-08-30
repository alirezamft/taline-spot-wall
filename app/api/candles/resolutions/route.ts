const RESOLUTION_SECONDS = {
  "1": 60,
  "5": 5 * 60,
  "15": 15 * 60,
  "30": 30 * 60,
  "60": 60 * 60,
  "240": 4 * 60 * 60,
  D: 24 * 60 * 60,
  W: 7 * 24 * 60 * 60,
  M: 30 * 24 * 60 * 60,
};

export function GET() {
  return Response.json(
    { resolution_seconds: RESOLUTION_SECONDS, supported_resolutions: Object.keys(RESOLUTION_SECONDS) },
    { headers: { "Cache-Control": "public, max-age=3600" } },
  );
}
