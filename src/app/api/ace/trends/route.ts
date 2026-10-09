import { NextResponse, type NextRequest } from "next/server";
import { TREND_WINDOWS, fetchUpstreamTrends, type TrendWindow } from "@/services/aceSeries";

export const dynamic = "force-dynamic";

/** Instantaneous data for the last 1 h (1-second values) or 6 h / 24 h (1-minute values). */
export async function GET(req: NextRequest) {
  const requested = req.nextUrl.searchParams.get("window") ?? "6h";
  const window: TrendWindow = (TREND_WINDOWS as string[]).includes(requested) ? (requested as TrendWindow) : "6h";
  try {
    const data = await fetchUpstreamTrends(window);
    return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=15" } });
  } catch (err) {
    console.error("[api/ace/trends]", err);
    return NextResponse.json({ error: "Unable to reach the ACE turbine API" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
