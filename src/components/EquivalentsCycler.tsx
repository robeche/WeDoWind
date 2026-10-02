"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Car, Coffee, Lightbulb, Smartphone, type LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import type { Equivalent, EquivalentId } from "@/utils/metrics";
import AnimatedNumber from "./AnimatedNumber";

const ICONS: Record<EquivalentId, LucideIcon> = {
  kettles: Coffee,
  ev: Car,
  phones: Smartphone,
  bulbs: Lightbulb,
};

export default function EquivalentsCycler({
  equivalents,
  ready,
  intervalMs = 8000,
}: {
  equivalents: Equivalent[];
  ready: boolean;
  intervalMs?: number;
}) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % Math.max(1, equivalents.length)), intervalMs);
    return () => clearInterval(id);
  }, [equivalents.length, intervalMs]);

  const item = equivalents[index % equivalents.length];
  if (!item) return null;
  const Icon = ICONS[item.id];

  return (
    <div className="relative flex min-h-0 flex-col justify-between overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-violet-500/25 to-fuchsia-500/10 p-[2.2vh]">
      <h2 className="text-[clamp(1rem,2.4vh,1.9rem)] font-semibold text-white/85">That&apos;s enough power for…</h2>
      <AnimatePresence mode="wait">
        <motion.div
          key={item.id}
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -24 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className="flex items-center gap-[1.6vh]"
        >
          <Icon className="size-[7vh] shrink-0 text-violet-200" strokeWidth={2} />
          <div className="min-w-0">
            <div className="text-[clamp(2.2rem,6.4vh,5.5rem)] font-extrabold leading-none">
              {ready ? <AnimatedNumber value={item.value} /> : "—"}
            </div>
            <p className="text-[clamp(0.9rem,2vh,1.6rem)] leading-snug text-white/80">{item.label}</p>
          </div>
        </motion.div>
      </AnimatePresence>
      <div className="flex gap-2">
        {equivalents.map((e, i) => (
          <span
            key={e.id}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-500 ${i === index ? "bg-violet-200" : "bg-white/15"}`}
          />
        ))}
      </div>
    </div>
  );
}
