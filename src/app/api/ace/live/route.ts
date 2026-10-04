import { NextResponse } from "next/server";
import { fetchUpstreamLive, type LiveSnapshot } from "@/services/aceApi";

export const dynamic = "force-dynamic";

/**
 * Tiny in-memory cache shared by every screen polling this server, so N kiosks
 * cost one upstream request every couple of seconds instead of N.
 */
const CACHE_MS = 2_500;
let cached: { at: number; promise: Promise<LiveSnapshot> } | null = null;

function getSnapshot(): Promise<LiveSnapshot> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.promise;
  const promise = fetchUpstreamLive();
  cached = { at: now, promise };
  // Never keep serving a failed request from the cache.
  promise.catch(() => {
    if (cached?.promise === promise) cached = null;
  });
  return promise;
}

export async function GET() {
  try {
    const snapshot = await getSnapshot();
    return NextResponse.json(snapshot, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[api/ace/live]", err);
    return NextResponse.json(
      { error: "Unable to reach the ACE turbine API" },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}
