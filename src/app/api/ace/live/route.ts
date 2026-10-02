import { NextResponse } from "next/server";
import { fetchUpstreamLive } from "@/services/aceApi";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const snapshot = await fetchUpstreamLive();
    return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[api/ace/live]", err);
    return NextResponse.json(
      { error: "Unable to reach the ACE turbine API" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
