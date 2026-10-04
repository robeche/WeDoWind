"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Hand, X } from "lucide-react";
import {
  EXTERIOR_PARTS,
  PART_INFO,
  TOWER_LEVELS,
  TOWER_PARTS,
  isTowerPart,
  type Focus,
  type PartId,
  type TowerPartId,
} from "./parts";

const TOWER_ORDER: TowerPartId[] = [
  "converter",
  "transformer",
  "switchgear",
  "controlCabinet",
  "cables",
  "dataCables",
  "lift",
  "ladder",
  "platforms",
  "lights",
];

interface Props {
  selectedId: PartId | null;
  towerOpen: boolean;
  onSelect: (id: PartId) => void;
  onGoTo: (focus: Focus) => void;
  onClose: () => void;
}

const card =
  "pointer-events-auto absolute right-[2vh] top-[8.5vh] w-[min(25rem,42%)] max-h-[calc(100%-11vh)] overflow-y-auto rounded-3xl bg-slate-950/80 p-[2.2vh] text-white shadow-2xl ring-1 ring-white/15 backdrop-blur";
const small = "text-[clamp(0.85rem,1.8vh,1.35rem)]";

/** HTML overlay describing the selected component; becomes a navigator when the tower is open. */
export default function InfoPanel({ selectedId, towerOpen, onSelect, onGoTo, onClose }: Props) {
  const info = selectedId ? PART_INFO[selectedId] : null;
  const towerItem = isTowerPart(selectedId) ? TOWER_PARTS[selectedId] : null;

  return (
    <AnimatePresence mode="wait">
      {towerOpen ? (
        <motion.aside
          key="tower"
          className={card}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 30 }}
          transition={{ duration: 0.35 }}
        >
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className={`${small} font-semibold uppercase tracking-wide text-emerald-300`}>Inside the tower</p>
              <h3 className="text-[clamp(1.3rem,3.2vh,2.4rem)] font-bold leading-tight">
                {towerItem ? towerItem.name : "89 m of steel"}
              </h3>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close the tower"
              className="grid size-[5vh] shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15 hover:bg-white/20"
            >
              <X className="size-[2.8vh]" />
            </button>
          </div>

          <p className={`${small} mt-[1vh] leading-snug text-white/80`}>
            {towerItem
              ? towerItem.description
              : "Equipment at the base turns the generator's output into grid power; a ladder, lift and platforms lead all the way up to the nacelle."}
          </p>

          <div className="mt-[1.6vh] grid grid-cols-2 gap-[0.8vh]">
            {TOWER_ORDER.map((id) => (
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
                {TOWER_PARTS[id].name}
              </button>
            ))}
          </div>

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
        </motion.aside>
      ) : info ? (
        <motion.aside
          key={info.id}
          className={card}
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 30 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex items-start justify-between gap-3">
            <h3 className="text-[clamp(1.3rem,3.2vh,2.4rem)] font-bold leading-tight">{info.name}</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid size-[5vh] shrink-0 place-items-center rounded-2xl bg-white/10 ring-1 ring-white/15 hover:bg-white/20"
            >
              <X className="size-[2.8vh]" />
            </button>
          </div>
          <p className={`${small} mt-[1vh] leading-snug text-white/80`}>{info.description}</p>
          {info.id in EXTERIOR_PARTS && !info.opens && (
            <p className={`${small} mt-[1.2vh] text-sky-200/80`}>Inside view coming soon.</p>
          )}
          {info.opens && (
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
          className={`pointer-events-none absolute right-[2vh] top-[8.5vh] flex items-center gap-2 rounded-2xl bg-slate-950/60 px-[2vh] py-[1vh] ring-1 ring-white/10 backdrop-blur ${small}`}
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
