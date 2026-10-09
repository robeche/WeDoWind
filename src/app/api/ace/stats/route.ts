import { NextResponse, type NextRequest } from "next/server";
import { STATS_RANGES, fetchUpstreamStats, type StatsRange } from "@/services/aceSeries";

export const dynamic = "force-dynamic";

/** 10-minute statistics for the last 7, 30 or 90 days (cached 10 minutes on the server). */
export async function GET(req: NextRequest) {
  const requested = Number.parseInt(req.nextUrl.searchParams.get("days") ?? "30", 10);
  const days: StatsRange = (STATS_RANGES as number[]).includes(requested) ? (requested as StatsRange) : 30;
  try {
    const data = await fetchUpstreamStats(days);
    return NextResponse.json(data, { headers: { "Cache-Control": "public, max-age=300" } });
  } catch (err) {
    console.error("[api/ace/stats]", err);
    return NextResponse.json({ error: "Unable to reach the ACE turbine API" }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
