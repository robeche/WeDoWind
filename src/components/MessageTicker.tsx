"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Info } from "lucide-react";
import { useEffect, useState } from "react";

export const COMMUNITY_MESSAGES = [
  "Did you know? This 4.2 MW turbine is community-owned by Lawrence Weston.",
  "Profits from this turbine help fund local warm spaces, energy advice, and community action through ALW.",
  "The blades on this screen turn at exactly the same speed as the real turbine — right now.",
  "At around 150 metres to the blade tip, this is one of the tallest onshore wind turbines in England.",
  "Each of the three blades is 56 metres long — longer than an Olympic swimming pool.",
  "Wind is free, local and clean. Every unit made here means less gas burned in power stations.",
];

export default function MessageTicker({ intervalMs = 12_000 }: { intervalMs?: number }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setIndex((i) => (i + 1) % COMMUNITY_MESSAGES.length), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);

  return (
    <div className="flex items-center gap-4 overflow-hidden rounded-2xl bg-emerald-500/15 px-6 py-[1.4vh] ring-1 ring-emerald-400/30">
      <Info className="size-[3.6vh] shrink-0 text-emerald-300" strokeWidth={2.4} />
      <div className="relative min-h-[4.2vh] flex-1">
        <AnimatePresence mode="wait">
          <motion.p
            key={index}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.6, ease: "easeOut" }}
            className="text-[clamp(1.1rem,2.9vh,2.3rem)] font-semibold leading-snug"
          >
            {COMMUNITY_MESSAGES[index]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  );
}
