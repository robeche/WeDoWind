"use client";

/** "Statistics" tab: the turbine's 10-minute statistics for the last 7, 30 or 90 days. */

import { useMemo, useState } from "react";
import { useStats } from "@/hooks/useTurbineData";
import BarChart from "@/components/charts/BarChart";
import ScatterChart from "@/components/charts/ScatterChart";
import TimeChart from "@/components/charts/TimeChart";
import { SERIES, formatDay, formatNumber, tooltipTime } from "@/components/charts/chartUtils";
import { AnalyticsFrame, RangePicker, StatTile } from "./AnalyticsShell";

type Days = 7 | 30 | 90;
const RANGES: Array<{ value: Days; label: string }> = [
  { value: 7, label: "7 days" },
  { value: 30, label: "30 days" },
  { value: 90, label: "90 days" },
];
const RATED_KW = 4200;
const BIN = 0.5; // m/s, power-curve bins

/** Median power per 0.5 m/s wind bin (bins with at least 5 points). */
function medianCurve(wind: Array<number | null>, power: Array<number | null>): Array<[number, number]> {
  const bins = new Map<number, number[]>();
  wind.forEach((w, i) => {
    const p = power[i];
    if (w === null || p === null) return;
    const b = Math.floor(w / BIN);
    if (!bins.has(b)) bins.set(b, []);
    bins.get(b)!.push(p);
  });
  return [...bins.entries()]
    .filter(([, v]) => v.length >= 5)
    .sort((a, b) => a[0] - b[0])
    .map(([b, v]) => {
      v.sort((x, y) => x - y);
      return [(b + 0.5) * BIN, v[Math.floor(v.length / 2)]] as [number, number];
    });
}

export default function StatsView({ active }: { active: boolean }) {
  const [days, setDays] = useState<Days>(30);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const q = useStats(days, active);
  const d = q.data;

  const derived = useMemo(() => {
    if (!d || !d.t.length) return null;
    const p = d.series.powerMean;
    const w = d.series.windMean;
    let n = 0;
    let gen = 0;
    let peak = 0;
    let sumW = 0;
    let nW = 0;
    p.forEach((v) => {
      if (v === null) return;
      n++;
      if (v > 10) gen++;
      peak = Math.max(peak, v);
    });
    w.forEach((v) => {
      if (v === null) return;
      sumW += v;
      nW++;
    });
    // Full days only for the totals (today is still running).
    const full = d.daily.filter((x) => !x.partial);
    const energyMwh = full.reduce((a, b) => a + b.mwh, 0);
    const hours = full.length * 24;
    return {
      energyMwh,
      capacityFactor: hours ? energyMwh / ((RATED_KW / 1000) * hours) : null,
      meanWind: nW ? sumW / nW : null,
      peak,
      genShare: n ? gen / n : null,
      firstDay: d.t.length ? d.t[0] : null,
      curve: medianCurve(w, p),
      fullDays: full.length,
      bars: d.daily.map((x) => ({
        key: x.day,
        label: x.partial ? "Today" : formatDay(x.day),
        value: x.mwh,
        note: x.partial ? "today so far" : `${Math.round(x.capacityFactor * 100)}% of the maximum possible`,
      })),
      power: [
        {
          name: "Power (10-min mean)",
          color: SERIES[0],
          values: p,
          band: { min: d.series.powerMin, max: d.series.powerMax },
        },
      ],
      wind: [
        {
          name: "Wind speed (10-min mean)",
          color: SERIES[0],
          values: w,
          band: { min: d.series.windMin, max: d.series.windMax },
        },
      ],
      temps: [
        { name: "Winding 1", color: SERIES[0], values: d.series.genWinding1 },
        { name: "Winding 2", color: SERIES[1], values: d.series.genWinding2 },
        { name: "Outside (hub)", color: SERIES[2], values: d.series.outsideTemp },
      ],
      blade: [{ name: "Blade angle", color: SERIES[0], values: d.series.bladeAngle }],
    };
  }, [d]);

  const status = !d ? (q.isError ? "error" : "loading") : q.isError ? "error" : q.isFetching ? "refreshing" : "ready";
  const common = { t: d?.t ?? [], resolutionSeconds: 600, hoverT, onHover: setHoverT };
  const span = d && d.t.length ? d.t[d.t.length - 1] - d.t[0] : 0;
  const coverageNote =
    derived?.firstDay && d && d.t.length && d.t[0] - Date.parse(d.from) > 86_400_000
      ? `10-minute records start on ${formatDay(new Date(derived.firstDay).toISOString().slice(0, 10))}`
      : undefined;

  return (
    <AnalyticsFrame
      status={status}
      controls={<RangePicker label="Period" options={RANGES} value={days} onChange={setDays} />}
      note={
        d ? (
          <>
            10-minute statistics · {d.t.length.toLocaleString("en-GB")} records
            {coverageNote && <> · {coverageNote}</>}
          </>
        ) : undefined
      }
      tiles={
        <>
          <StatTile label="Energy produced" value={formatNumber(derived?.energyMwh ?? null, 0)} unit="MWh" sub={`over ${derived?.fullDays ?? 0} full days`} />
          <StatTile
            label="Capacity factor"
            value={formatNumber(derived?.capacityFactor != null ? derived.capacityFactor * 100 : null)}
            unit="%"
            sub="of a 4.2 MW turbine running flat out"
          />
          <StatTile label="Average wind" value={formatNumber(derived?.meanWind ?? null, 1)} unit="m/s" />
          <StatTile label="Peak 10-min power" value={formatNumber(derived?.peak ?? null)} unit="kW" />
          <StatTile
            label="Generating"
            value={formatNumber(derived?.genShare != null ? derived.genShare * 100 : null)}
            unit="%"
            sub="of 10-minute periods"
          />
        </>
      }
    >
      {derived && d && (
        <div className="grid min-h-0 flex-1 grid-cols-1 gap-[1.2vh] md:grid-cols-3 md:grid-rows-2 [&>*]:min-h-[240px] md:[&>*]:min-h-0">
          <ScatterChart
            title="Power curve"
            xLabel="Wind speed (m/s)"
            yLabel="Power (kW)"
            x={d.series.windMean}
            y={d.series.powerMean}
            color={SERIES[0]}
            reference={derived.curve}
            referenceName="Median"
            describe={(i) => tooltipTime(d.t[i], span, 600)}
          />
          <BarChart title="Energy per day" unit="MWh" bars={derived.bars} color={SERIES[0]} />
          <TimeChart title="Generator temperatures" unit="°C" series={derived.temps} {...common} />
          <TimeChart title="Power, with 10-min min–max" unit="kW" zeroBased series={derived.power} {...common} />
          <TimeChart title="Wind speed, with 10-min min–max" unit="m/s" digits={1} zeroBased series={derived.wind} {...common} />
          <TimeChart title="Blade pitch angle" unit="°" digits={1} series={derived.blade} {...common} />
        </div>
      )}
    </AnalyticsFrame>
  );
}
