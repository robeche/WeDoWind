"use client";

import { motion, useSpring, useTransform } from "framer-motion";
import { useEffect, useMemo } from "react";

interface Props {
  value: number;
  decimals?: number;
  prefix?: string;
  suffix?: string;
  className?: string;
}

/** Number that springs smoothly between live values. */
export default function AnimatedNumber({ value, decimals = 0, prefix = "", suffix = "", className }: Props) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const spring = useSpring(safeValue, { stiffness: 45, damping: 18, mass: 1 });
  const formatter = useMemo(
    () => new Intl.NumberFormat("en-GB", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }),
    [decimals],
  );
  const text = useTransform(spring, (v) => `${prefix}${formatter.format(v)}${suffix}`);

  useEffect(() => {
    spring.set(safeValue);
  }, [spring, safeValue]);

  return <motion.span className={`tabular-nums ${className ?? ""}`}>{text}</motion.span>;
}
