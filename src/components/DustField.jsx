/* eslint-disable react/prop-types */
import { memo, useMemo } from "react";
import { motion } from "framer-motion";
import { integrateWindPath } from "../utils/windField";

function mulberry32(seed) {
  return function next() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function buildOpacityKeyframes(len, mode) {
  return Array.from({ length: len }, (_, i) => {
    const u = len <= 1 ? 1 : i / (len - 1);
    if (mode === "right") {
      if (u < 0.08) return (u / 0.08) * 0.35;
      if (u > 0.88) return ((1 - u) / 0.12) * 0.28;
      return 0.32 + 0.22 * Math.sin((u - 0.08) / 0.8 * Math.PI);
    }
    if (u < 0.12) return (u / 0.12) * 0.42;
    if (u > 0.78) return ((1 - u) / 0.22) * 0.2;
    return 0.28 + 0.22 * Math.sin((u - 0.12) / 0.66 * Math.PI);
  });
}

function buildScaleKeyframes(len) {
  return Array.from({ length: len }, (_, i) => {
    const u = len <= 1 ? 0 : i / (len - 1);
    if (u < 0.15) return 0.35 + u * 2.5;
    if (u > 0.88) return 0.25 + (1 - u) * 2;
    return 0.78 + 0.18 * Math.sin(u * Math.PI * 1.6);
  });
}

function DustField({ phase = "up" }) {
  const mode = phase === "right" ? "right" : "up";

  const particles = useMemo(() => {
    const rand = mulberry32(mode === "right" ? 0x9e3779b9 : 0xdeadbeef);
    const count = mode === "right" ? 58 : 52;
    return Array.from({ length: count }, (_, i) => {
      const nx = rand();
      const ny = rand();
      const { xs, ys } = integrateWindPath(nx, ny, mode, {
        steps: mode === "right" ? 7 : 6,
        stepScale: mode === "right" ? 46 : 36,
      });
      const len = xs.length;
      const times = xs.map((_, idx) => (len <= 1 ? 0 : idx / (len - 1)));
      const w = 0.55 + rand() * 2.5;
      const streak = mode === "right" && rand() > 0.42;
      const height = streak ? w * (0.25 + rand() * 1.1) : w;
      const rounded = !streak && rand() > 0.28;
      const gray = 0.2 + rand() * 0.22;
      return {
        id: `${mode}-${i}`,
        leftPct: nx * 100,
        topPct: ny * 100,
        xs,
        ys,
        opacityKeyframes: buildOpacityKeyframes(len, mode),
        scaleKeyframes: buildScaleKeyframes(len),
        times,
        width: w,
        height: rounded ? w : height,
        rounded,
        delay: rand() * (mode === "right" ? 0.1 : 0.2),
        duration: mode === "right" ? 0.68 + rand() * 0.38 : 0.92 + rand() * 0.48,
        gray,
      };
    });
  }, [mode]);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-visible">
      {particles.map((p) => (
        <motion.span
          key={p.id}
          className="absolute will-change-transform"
          style={{
            left: `${p.leftPct}%`,
            top: `${p.topPct}%`,
            width: p.width,
            height: p.height,
            borderRadius: p.rounded ? "9999px" : "0.5px",
            backgroundColor: `rgba(${Math.round(p.gray * 255)}, ${Math.round(p.gray * 255)}, ${Math.round(p.gray * 255)}, ${0.22 + p.gray * 0.4})`,
            boxShadow: "0 0 1px rgba(17,17,17,0.05)",
          }}
          initial={{ opacity: 0, x: 0, y: 0, scale: 0.3 }}
          animate={{
            x: p.xs,
            y: p.ys,
            opacity: p.opacityKeyframes,
            scale: p.scaleKeyframes,
          }}
          transition={{
            duration: p.duration,
            delay: p.delay,
            times: p.times,
            ease: [0.2, 0.65, 0.35, 1],
          }}
        />
      ))}
    </div>
  );
}

export default memo(DustField);
