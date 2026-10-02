import { NextResponse, type NextRequest } from "next/server";
import { fetchUpstreamHistory } from "@/services/aceApi";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const requested = Number.parseInt(req.nextUrl.searchParams.get("hours") ?? "24", 10);
  const hours = Number.isFinite(requested) ? Math.min(Math.max(requested, 1), 48) : 24;

  try {
    const history = await fetchUpstreamHistory(hours);
    return NextResponse.json(history, { headers: { "Cache-Control": "public, max-age=60" } });
  } catch (err) {
    console.error("[api/ace/history]", err);
    return NextResponse.json(
      { error: "Unable to reach the ACE turbine API" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
