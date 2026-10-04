"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import { STALE_AFTER_MS, getHistory, getLive, type HistorySeries, type LiveSnapshot } from "@/services/aceApi";

export const LIVE_POLL_MS = 5_000;
const HISTORY_POLL_MS = 5 * 60_000;
const RECONNECT_AFTER_MS = 20_000;
const LIVE_KEY = ["ace", "live"] as const;
const STORAGE_KEY = "ace-kiosk:last-live";

interface StoredSnapshot {
  savedAt: number;
  data: LiveSnapshot;
}

function readStored(): StoredSnapshot | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredSnapshot;
    return typeof parsed?.savedAt === "number" && typeof parsed?.data?.activePowerKw === "number" ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Live turbine snapshot, polled every 5 s. On failure the last good value is kept,
 * and it is also persisted so a page reload during an outage still shows data.
 */
export function useLiveTurbine(now: number) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: LIVE_KEY,
    queryFn: ({ signal }) => getLive(signal),
    refetchInterval: LIVE_POLL_MS,
    refetchIntervalInBackground: true,
    retry: 1,
    retryDelay: 1_000,
  });

  useEffect(() => {
    if (queryClient.getQueryData(LIVE_KEY)) return;
    const stored = readStored();
    if (stored) queryClient.setQueryData(LIVE_KEY, stored.data, { updatedAt: stored.savedAt });
  }, [queryClient]);

  useEffect(() => {
    if (!query.data || !query.dataUpdatedAt) return;
    try {
      const payload: StoredSnapshot = { savedAt: query.dataUpdatedAt, data: query.data };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Storage full or disabled — non-critical.
    }
  }, [query.data, query.dataUpdatedAt]);

  const lastUpdated = query.dataUpdatedAt || null;
  const reconnecting = query.isError || (lastUpdated !== null && now - lastUpdated > RECONNECT_AFTER_MS);

  // Re-evaluate staleness against the current clock: a snapshot restored from storage (or
  // kept through an outage) carries the flag computed when it was fetched, which goes out of date.
  const staleBucket = query.data && now ? Math.floor((now - Date.parse(query.data.observedAt)) / STALE_AFTER_MS) : 0;
  const data = useMemo(
    () => (query.data ? { ...query.data, scadaStale: query.data.scadaStale || staleBucket >= 1 } : null),
    [query.data, staleBucket],
  );

  return {
    data,
    lastUpdated,
    reconnecting,
    connecting: !query.data && query.isPending,
  };
}

export function useTurbineHistory(hours = 24) {
  const query = useQuery<HistorySeries>({
    queryKey: ["ace", "history", hours],
    queryFn: ({ signal }) => getHistory(hours, signal),
    refetchInterval: HISTORY_POLL_MS,
    refetchIntervalInBackground: true,
    staleTime: HISTORY_POLL_MS - 30_000,
    retry: 2,
    retryDelay: 5_000,
  });
  return query.data ?? null;
}
