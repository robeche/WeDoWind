"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

interface Props {
  icon: LucideIcon;
  title: string;
  accent: string;
  children: ReactNode;
  caption?: ReactNode;
  className?: string;
}

export default function MetricCard({ icon: Icon, title, accent, children, caption, className = "" }: Props) {
  return (
    <div
      className={`relative flex min-h-0 flex-col justify-between overflow-hidden rounded-3xl border border-white/10 bg-white/[0.06] p-[2.2vh] backdrop-blur ${className}`}
    >
      <div className="flex items-center gap-3">
        <span className={`grid size-[5vh] shrink-0 place-items-center rounded-2xl ${accent}`}>
          <Icon className="size-[3vh]" strokeWidth={2.4} />
        </span>
        <h2 className="text-[clamp(1rem,2.4vh,1.9rem)] font-semibold leading-tight text-white/85">{title}</h2>
      </div>
      <div className="mt-[1vh] text-[clamp(2.2rem,6.4vh,5.5rem)] font-extrabold leading-none tracking-tight">{children}</div>
      {caption && <p className="mt-[0.8vh] text-[clamp(0.9rem,1.9vh,1.5rem)] leading-snug text-white/70">{caption}</p>}
    </div>
  );
}
