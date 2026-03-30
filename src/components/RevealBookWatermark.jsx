/* eslint-disable react/prop-types */
import { memo } from "react";
import { motion } from "framer-motion";

const coalesceEase = [0.22, 1, 0.36, 1];

/** Underlay for Act 3: coalesces with quote; discard sweep is driven by parent motion.div. */
function RevealBookWatermark({ title }) {
  return (
    <motion.div
      className="pointer-events-none absolute inset-0 z-0 flex items-center justify-center overflow-hidden px-4"
      aria-hidden
      initial={{ opacity: 0, y: 22, filter: "blur(14px)" }}
      animate={{
        opacity: 1,
        y: 0,
        filter: "blur(0px)",
        transition: {
          duration: 0.82,
          delay: 0.06,
          ease: coalesceEase,
        },
      }}
    >
      <span className="act3-book-watermark block max-w-[min(100%,72rem)]">{title}</span>
    </motion.div>
  );
}

export default memo(RevealBookWatermark);
