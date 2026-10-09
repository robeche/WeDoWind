"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Hand, X } from "lucide-react";
import type { LiveSnapshot } from "@/services/aceApi";
import {
  EXTERIOR_PARTS,
  OPEN_CHILDREN,
  PART_INFO,
  TOWER_LEVELS,
  type Focus,
  type OpenableId,
  type PartId,
} from "./parts";
import { signalTiles } from "./signals";

interface Props {
  /** Phone layout: the panel becomes a bottom sheet. */
  compact?: boolean;
  selectedId: PartId | null;
  openPart: OpenableId | null;
  onSelect: (id: PartId) => void;
  onGoTo: (focus: Focus) => void;
  onClose: () => void;
  /** Latest live data, for the signal tiles shown while a part is open. */
  snapshot?: LiveSnapshot | null;
}

const CARD_BASE = "pointer-events-auto absolute overflow-y-auto bg-slate-950/80 text-white shadow-2xl ring-1 ring-white/15 backdrop-blur";
const CARD_SIDE = `${CARD_BASE} right-[2vh] top-[8.5vh] w-[min(25rem,42%)] max-h-[calc(100%-11vh)] rounded-3xl p-[2.2vh]`;
const CARD_SHEET = `${CARD_BASE} inset-x-2 bottom-[max(0.5rem,env(safe-area-inset-bottom))] max-h-[46%] rounded-3xl p-4`;
const SMALL_SIDE = "text-[clamp(0.85rem,1.8vh,1.35rem)]";
const SMALL_SHEET = "text-sm";

const OPEN_TITLE: Record<OpenableId, string> = {
  tower: "89 m of steel",
  nacelle: "The machine room",
  generator: "Direct-drive ring generator",
  hub: "The pitch system",
  blades: "Inside a 56 m blade",
};

/** HTML overlay describing the selected component; becomes a navigator while a part is open. */
/** Live SCADA tiles for the opened part; the selected component's own signals are highlighted. */
function SignalGrid({
  openPart,
  selectedId,
  snapshot,
  compact,
  small,
}: {
  openPart: OpenableId;
  selectedId: PartId | null;
  snapshot: LiveSnapshot | null;
  compact: boolean;
  small: string;
}) {
  const tiles = signalTiles(openPart, selectedId, snapshot);
  const stale = !snapshot || snapshot.scadaStale;
  return (
    <section className="mt-[1.6vh]" aria-label="Live signals">
      <div className={`${small} flex items-center gap-2 font-semibold text-white/60`}>
        <span className={`size-2 rounded-full ${stale ? "bg-amber-400" : "animate-pulse bg-emerald-400"}`} />
        {stale ? "Latest data" : "Live data"}
      </div>
      <div className={`mt-[0.6vh] grid gap-[0.7vh] ${compact ? "grid-cols-2" : "grid-cols-3"}`}>
        {tiles.map((t) => (
          <div
            key={t.id}
            className={`rounded-xl px-2.5 py-[0.7vh] ring-1 transition-colors ${
              t.highlight ? "bg-emerald-400/15 ring-emerald-300/70" : "bg-white/[0.06] ring-white/10"
            }`}
          >
            <div className={`truncate text-white/60 ${compact ? "text-[0.7rem]" : "text-[clamp(0.65rem,1.35vh,1rem)]"}`}>{t.label}</div>
            <div className={`font-bold tabular-nums leading-tight ${compact ? "text-base" : "text-[clamp(0.95rem,2vh,1.5rem)]"}`}>
              {t.value}
              {t.unit && <span className="ml-1 text-[0.7em] font-semibold text-white/60">{t.unit}</span>}
            </div>
          </div>
        ))}
      </div>
      <p className={`mt-[0.6vh] text-white/40 ${compact ? "text-[0.65rem]" : "text-[clamp(0.6rem,1.2vh,0.9rem)]"}`}>
        Turbine SCADA via ACE open data (CC-BY-4.0). Temperatures are 1-minute means; missing sensors are hidden.
      </p>
    </section>
  );
}

export default function InfoPanel({ compact = false, selectedId, openPart, onSelect, onGoTo, onClose, snapshot = null }: Props) {
  const info = selectedId ? PART_INFO[selectedId] : null;
  const card = compact ? CARD_SHEET : CARD_SIDE;
  const small = compact ? SMALL_SHEET : SMALL_SIDE;
  const slide = compact ? { initial: { opacity: 0, y: 40 }, exit: { opacity: 0, y: 40 } } : { initial: { opacity: 0, x: 30 }, exit: { opacity: 0, x: 30 } };

  if (openPart) {
    const parentInfo = PART_INFO[openPart];
    const item = info && info.parent === openPart ? info : null;
    return (
      <AnimatePresence mode="wait">
        <motion.aside
          key={openPart}
          className={card}
          initial={slide.initial}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={slide.exit}
          transition={{ duration: 0.35 }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`${small} font-semibold uppercase tracking-wide text-emerald-300`}>
                Inside the {parentInfo.name.toLowerCase()}
              </p>
              <h3 className={compact ? "text-xl font-bold leading-tight" : "text-[clamp(1.3rem,3.2vh,2.4rem)] font-bold leading-tight"}>
                {item ? item.name : OPEN_TITLE[openPart]}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={`Close the ${parentInfo.name.toLowerCase()}`}
              className={`grid shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15 hover:bg-white/20 ${compact ? "size-10" : "size-[5vh]"}`}
            >
              <X className={compact ? "size-5" : "size-[2.8vh]"} />
            </button>
          </div>

          <p className={`${small} mt-[1vh] leading-snug text-white/80`}>{item ? item.description : parentInfo.intro}</p>

          <SignalGrid openPart={openPart} selectedId={selectedId} snapshot={snapshot} compact={compact} small={small} />

          <div className="mt-[1.6vh] grid grid-cols-2 gap-[0.8vh]">
            {OPEN_CHILDREN[openPart].map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => onSelect(id)}
                className={`${small} rounded-xl px-3 py-[0.9vh] text-left font-semibold ring-1 transition-colors ${
                  selectedId === id
                    ? "bg-emerald-400 text-slate-950 ring-emerald-300"
                    : "bg-white/[0.07] text-white ring-white/10 hover:bg-white/15"
                }`}
              >
                {PART_INFO[id].name}
              </button>
            ))}
          </div>

          {openPart === "tower" && (
            <>
              <p className={`${small} mt-[1.8vh] font-semibold text-white/60`}>Go to</p>
              <div className="mt-[0.6vh] flex flex-wrap gap-[0.8vh]">
                {TOWER_LEVELS.map((level) => (
                  <button
                    key={level.label}
                    type="button"
                    onClick={() => onGoTo(level.focus)}
                    className={`${small} rounded-full bg-sky-500/20 px-3 py-[0.6vh] font-semibold ring-1 ring-sky-300/40 hover:bg-sky-500/35`}
                  >
                    {level.label}
                  </button>
                ))}
              </div>
            </>
          )}
          {item && (
            <button
              type="button"
              onClick={() => onSelect(openPart)}
              className={`${small} mt-[1.4vh] font-semibold text-sky-200 underline-offset-4 hover:underline`}
            >
              ← Back to overview
            </button>
          )}
        </motion.aside>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence mode="wait">
      {info ? (
        <motion.aside
          key={info.id}
          className={card}
          initial={slide.initial}
          animate={{ opacity: 1, x: 0, y: 0 }}
          exit={slide.exit}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className={compact ? "text-xl font-bold leading-tight" : "text-[clamp(1.3rem,3.2vh,2.4rem)] font-bold leading-tight"}>{info.name}</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className={`grid shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15 hover:bg-white/20 ${compact ? "size-10" : "size-[5vh]"}`}
            >
              <X className={compact ? "size-5" : "size-[2.8vh]"} />
            </button>
          </div>
          <p className={`${small} mt-[1vh] leading-snug text-white/80`}>{info.description}</p>
          {info.id in EXTERIOR_PARTS && info.opens && (
            <button
              type="button"
              onClick={() => onSelect(info.id)}
              className={`${small} mt-[1.4vh] rounded-xl bg-emerald-400 px-4 py-[0.9vh] font-bold text-slate-950`}
            >
              Look inside
            </button>
          )}
        </motion.aside>
      ) : (
        <motion.div
          key="hint"
          className={`pointer-events-none absolute flex items-center gap-2 rounded-2xl bg-slate-950/60 ring-1 ring-white/10 backdrop-blur ${small} ${
            compact ? "bottom-[12%] left-1/2 -translate-x-1/2 whitespace-nowrap px-3 py-1.5" : "right-[2vh] top-[8.5vh] px-[2vh] py-[1vh]"
          }`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <Hand className="size-[2.4vh] text-sky-300" />
          Tap the turbine to explore
        </motion.div>
      )}
    </AnimatePresence>
  );
}
