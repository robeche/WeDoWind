"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Hand } from "lucide-react";

/** Tells passers-by that the screen is running its tour and how to take over. */
export default function DemoBadge({ active, compact = false }: { active: boolean; compact?: boolean }) {
  return (
    <AnimatePresence>
      {active && (
        <motion.div
          role="status"
          initial={{ opacity: 0, y: -12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -12 }}
          transition={{ duration: 0.4 }}
          className={`pointer-events-none absolute left-1/2 z-20 flex -translate-x-1/2 items-center gap-2.5 whitespace-nowrap rounded-full bg-slate-950/75 font-semibold ring-1 ring-emerald-400/50 backdrop-blur ${
            compact ? "top-[calc(env(safe-area-inset-top)+7.5rem)] px-3 py-1.5 text-xs" : "top-[2vh] px-[2vh] py-[1vh] text-[clamp(0.9rem,2.1vh,1.6rem)]"
          }`}
        >
          <span className="relative flex size-2.5">
            <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-70" />
            <span className="relative inline-flex size-full rounded-full bg-emerald-400" />
          </span>
          <span className="text-emerald-300">Guided tour</span>
          <span className="text-white/80">· touch the screen to explore yourself</span>
          <Hand className={compact ? "size-3.5 text-white/70" : "size-[2.4vh] text-white/70"} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
