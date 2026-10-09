"use client";

/** "Last hours" tab: instantaneous turbine data for the last 1 h (1 s values), 6 h or 24 h (1 min). */

import { useMemo, useState } from "react";
import { useTrends } from "@/hooks/useTurbineData";
import TimeChart from "@/components/charts/TimeChart";
import { SERIES, formatNumber } from "@/components/charts/chartUtils";
import { AnalyticsFrame, RangePicker, StatTile } from "./AnalyticsShell";

type Win = "1h" | "6h" | "24h";
const WINDOWS: Array<{ value: Win; label: string }> = [
  { value: "1h", label: "Last hour" },
  { value: "6h", label: "6 hours" },
  { value: "24h", label: "24 hours" },
];

const COMPASS_TICKS = [0, 90, 180, 270, 360];
const compassLabel = (v: number) => ["N", "E", "S", "W", "N"][Math.round(v / 90)] ?? String(v);

/** Break a compass trace where it wraps through north, so it never draws a line across the chart. */
function unwrapGaps(values: Array<number | null>): Array<number | null> {
  return values.map((v, i) => {
    const prev = values[i - 1];
    return v !== null && prev !== null && prev !== undefined && Math.abs(v - prev) > 180 ? null : v;
  });
}

export default function TrendsView({ active }: { active: boolean }) {
  const [win, setWin] = useState<Win>("6h");
  const [hoverT, setHoverT] = useState<number | null>(null);
  const q = useTrends(win, active);
  const d = q.data;

  const stats = useMemo(() => {
    if (!d || d.t.length < 2) return null;
    const p = d.series.power;
    let energyKwh = 0;
    let peak = 0;
    let sumP = 0;
    let nP = 0;
    let generating = 0;
    for (let i = 0; i < d.t.length; i++) {
      const v = p[i];
      if (v === null) continue;
      sumP += v;
      nP++;
      peak = Math.max(peak, v);
      if (v > 10) generating++;
      // Integrate up to the next sample, capped at 2× the nominal step so gaps don't count.
      const dt = i + 1 < d.t.length ? Math.min(d.t[i + 1] - d.t[i], 2 * d.resolutionSeconds * 1000) : d.resolutionSeconds * 1000;
      energyKwh += (v * dt) / 3_600_000;
    }
    const wind = d.series.wind.filter((v): v is number => v !== null);
    const meanWind = wind.length ? wind.reduce((a, b) => a + b, 0) / wind.length : null;
    return { energyKwh, peak, meanP: nP ? sumP / nP : null, meanWind, genShare: nP ? generating / nP : null };
  }, [d]);

  const charts = useMemo(() => {
    if (!d) return null;
    return {
      power: [{ name: "Power", color: SERIES[0], values: d.series.power }],
      wind: [{ name: "Wind speed", color: SERIES[0], values: d.series.wind }],
      rotor: [{ name: "Rotor speed", color: SERIES[0], values: d.series.rotor }],
      direction: [
        { name: "Nacelle heading", color: SERIES[0], values: unwrapGaps(d.series.nacelle) },
        { name: "Wind from", color: SERIES[1], values: unwrapGaps(d.series.windFrom) },
      ],
      reactive: [{ name: "Reactive power", color: SERIES[0], values: d.series.reactive }],
      frequency: [{ name: "Grid frequency", color: SERIES[0], values: d.series.frequency }],
    };
  }, [d]);

  const status = !d ? (q.isError ? "error" : "loading") : q.isError ? "error" : q.isFetching ? "refreshing" : "ready";
  const res = d?.resolutionSeconds ?? 60;
  const common = { t: d?.t ?? [], resolutionSeconds: res, hoverT, onHover: setHoverT };

  return (
    <AnalyticsFrame
      status={status}
      controls={<RangePicker label="Time window" options={WINDOWS} value={win} onChange={setWin} />}
      note={d ? `${res === 1 ? "Every second" : "Every minute"} · ${d.t.length.toLocaleString("en-GB")} readings` : undefined}
      tiles={
        <>
          <StatTile label="Energy produced" value={formatNumber(stats ? stats.energyKwh / 1000 : null, 2)} unit="MWh" />
          <StatTile label="Average power" value={formatNumber(stats?.meanP ?? null)} unit="kW" />
          <StatTile label="Peak power" value={formatNumber(stats?.peak ?? null)} unit="kW" />
          <StatTile label="Average wind" value={formatNumber(stats?.meanWind ?? null, 1)} unit="m/s" />
          <StatTile
            label="Generating"
            value={formatNumber(stats?.genShare != null ? stats.genShare * 100 : null)}
            unit="%"
            sub="of the time"
          />
        </>
      }
    >
      {charts && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-[1.2vh] md:grid-cols-3 md:grid-rows-2 [&>*]:min-h-[240px] md:[&>*]:min-h-0">
          <TimeChart title="Power" unit="kW" zeroBased series={charts.power} {...common} />
          <TimeChart title="Wind speed" unit="m/s" digits={1} zeroBased series={charts.wind} {...common} />
          <TimeChart title="Rotor speed" unit="rpm" digits={1} zeroBased series={charts.rotor} {...common} />
          <TimeChart
            title="Direction"
            unit="° from north"
            yDomain={[0, 360]}
            yTicks={COMPASS_TICKS}
            yTickLabel={compassLabel}
            series={charts.direction}
            {...common}
          />
          <TimeChart title="Reactive power" unit="kvar" series={charts.reactive} {...common} />
          <TimeChart title="Grid frequency" unit="Hz" digits={2} series={charts.frequency} {...common} />
        </div>
      )}
    </AnalyticsFrame>
  );
}
