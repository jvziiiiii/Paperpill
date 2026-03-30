import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import DustField from "./components/DustField";
import RevealBookWatermark from "./components/RevealBookWatermark";
import { fetchPaperPillPrescription } from "./api/fetchPaperPillPrescription";
import { prescriptions } from "./data/prescriptions";
import { windVector } from "./utils/windField";

const PHASES = {
  INPUT: "input",
  EVAPORATING: "evaporating",
  VOID: "void",
  REVEAL: "reveal",
  DISCARDING: "discarding",
  ACCEPTED: "accepted",
};

const SERIAL = "Rx:001";
const DISCARD_MS = 920;
const EVAPORATE_MS = 900;
/** Minimum time on the distilling screen (Act 2) from first Enter, in ms */
const MIN_DISTILL_MS = 2500;

function createTimestamp() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}.${m}.${d} - ${SERIAL}`;
}

function splitQuoteWords(text) {
  return text.split(/(\s+)/).filter(Boolean);
}

function pickRandomMock() {
  return prescriptions[Math.floor(Math.random() * prescriptions.length)];
}

function sleep(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function App() {
  const [phase, setPhase] = useState(PHASES.INPUT);
  const [input, setInput] = useState("");
  const [hasTyped, setHasTyped] = useState(false);
  const [prescription, setPrescription] = useState(null);
  const [revealNonce, setRevealNonce] = useState(0);
  const [oracleError, setOracleError] = useState(null);
  const [timestamp, setTimestamp] = useState(createTimestamp());
  const [rejectedBooks, setRejectedBooks] = useState([]);
  const textareaRef = useRef(null);
  const inputRef = useRef("");
  const distillationTimersRef = useRef({ voidId: null });
  const oracleAbortRef = useRef(null);
  const touchStartXRef = useRef(null);

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  /**
   * Fetches one prescription; enforces MIN_DISTILL_MS from distillStartedAt (Act 2 clock).
   * Returns null if aborted.
   */
  const generatePrescription = useCallback(async (
    userConfession,
    signal,
    distillStartedAt,
    rejectedTitles = []
  ) => {
    const t0 = distillStartedAt;
    let next;
    try {
      next = await fetchPaperPillPrescription(userConfession, {
        signal,
        rejectedTitles,
      });
      setOracleError(null);
    } catch (err) {
      const msg = String(err?.message || err);
      console.warn("[Paper Pill] API failed — mock fallback:", msg);
      setOracleError(msg);
      next = pickRandomMock();
    }

    if (signal.aborted) return null;

    const elapsed = Date.now() - t0;
    const remaining = Math.max(0, MIN_DISTILL_MS - elapsed);
    if (remaining > 0) {
      await sleep(remaining);
    }

    if (signal.aborted) return null;
    return next;
  }, []);

  const beginDistillation = useCallback(() => {
    const { voidId } = distillationTimersRef.current;
    if (voidId != null) clearTimeout(voidId);
    distillationTimersRef.current = { voidId: null };

    oracleAbortRef.current?.abort();
    const ac = new AbortController();
    oracleAbortRef.current = ac;

    const userConfession = inputRef.current.trim();
    const t0 = Date.now();

    setOracleError(null);
    setPhase(PHASES.EVAPORATING);

    distillationTimersRef.current.voidId = setTimeout(() => {
      distillationTimersRef.current.voidId = null;
      setPhase(PHASES.VOID);
    }, EVAPORATE_MS);

    (async () => {
      const next = await generatePrescription(userConfession, ac.signal, t0, []);
      if (next == null || ac.signal.aborted) return;

      setPrescription(next);
      setRevealNonce((n) => n + 1);
      setPhase(PHASES.REVEAL);
    })();
  }, [generatePrescription]);

  const currentPrescription = prescription ?? prescriptions[0];
  const quoteParts = useMemo(
    () => splitQuoteWords(currentPrescription.quote),
    [currentPrescription.quote]
  );

  const quoteChars = useMemo(
    () =>
      input.split("").map((char, index) => {
        const len = Math.max(input.length, 1);
        const { vx, vy } = windVector((index + 0.5) / len, 0.5, "up", index * 0.045);
        return {
          id: `${char}-${index}`,
          char,
          dx: vx * 56,
          dy: -92 + vy * 52,
          rot: (vx - 0.18) * 9,
        };
      }),
    [input]
  );

  useEffect(() => {
    if (phase !== PHASES.INPUT || !textareaRef.current) return;
    textareaRef.current.focus();
  }, [phase]);

  useEffect(
    () => () => {
      const { voidId } = distillationTimersRef.current;
      if (voidId != null) clearTimeout(voidId);
      oracleAbortRef.current?.abort();
    },
    []
  );

  useEffect(() => {
    if (phase === PHASES.INPUT) {
      setRejectedBooks((prev) => (prev.length === 0 ? prev : []));
    }
  }, [phase]);

  useEffect(() => {
    if (phase !== PHASES.DISCARDING) return;

    const rejectedSnapshot = rejectedBooks;

    const timer = window.setTimeout(() => {
      const { voidId } = distillationTimersRef.current;
      if (voidId != null) clearTimeout(voidId);
      distillationTimersRef.current = { voidId: null };

      oracleAbortRef.current?.abort();
      const ac = new AbortController();
      oracleAbortRef.current = ac;

      const userConfession = inputRef.current.trim();
      const t0 = Date.now();

      setOracleError(null);
      setPhase(PHASES.VOID);

      void (async () => {
        const next = await generatePrescription(
          userConfession,
          ac.signal,
          t0,
          rejectedSnapshot
        );
        if (next == null || ac.signal.aborted) return;

        setPrescription(next);
        setRevealNonce((n) => n + 1);
        setPhase(PHASES.REVEAL);
      })();
    }, DISCARD_MS);

    return () => clearTimeout(timer);
  }, [phase, generatePrescription, rejectedBooks]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Enter") {
        if (phase === PHASES.INPUT && input.trim()) {
          event.preventDefault();
          beginDistillation();
        } else if (phase === PHASES.REVEAL) {
          event.preventDefault();
          setTimestamp(createTimestamp());
          setPhase(PHASES.ACCEPTED);
        }
      }

      if (event.code === "Space" && phase === PHASES.REVEAL) {
        event.preventDefault();
        setRejectedBooks((prev) => [...prev, currentPrescription.book]);
        setPhase(PHASES.DISCARDING);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [beginDistillation, currentPrescription.book, input, phase]);

  const revealTouchHandlers =
    phase === PHASES.REVEAL
      ? {
          onTouchStart: (e) => {
            if (!e.touches[0]) return;
            touchStartXRef.current = e.touches[0].clientX;
          },
          onTouchEnd: (e) => {
            if (touchStartXRef.current == null) return;
            const x = e.changedTouches[0]?.clientX;
            if (x != null && touchStartXRef.current - x > 72) {
              setRejectedBooks((prev) => [...prev, currentPrescription.book]);
              setPhase(PHASES.DISCARDING);
            }
            touchStartXRef.current = null;
          },
        }
      : {};

  const onInputChange = (event) => {
    const next = event.target.value;
    setInput(next);
    if (!hasTyped && next.length > 0) setHasTyped(true);

    event.target.style.height = "auto";
    event.target.style.height = `${Math.min(event.target.scrollHeight, 280)}px`;
  };

  const isDistilling = phase === PHASES.EVAPORATING || phase === PHASES.VOID;
  const isDiscarding = phase === PHASES.DISCARDING;
  const hideCornerLine =
    phase === PHASES.REVEAL ||
    phase === PHASES.DISCARDING ||
    phase === PHASES.ACCEPTED;

  return (
    <main className="relative flex min-h-screen w-full items-center justify-center overflow-x-hidden px-6 text-[#111111]">
      {oracleError && (
        <div
          className="fixed inset-x-0 top-0 z-[100] max-h-[45vh] overflow-y-auto border-b border-[#444] bg-[#1e1e1c]/96 px-4 py-3 text-center shadow-lg"
          role="alert"
        >
          <p className="font-mono text-[11px] font-semibold uppercase tracking-[0.12em] text-[#e8e8e0]">
            Oracle 未接通 · 已显示本地 mock
          </p>
          <p className="mt-2 whitespace-pre-wrap break-words font-mono text-xs leading-relaxed text-[#c8c8c0]">
            {oracleError}
          </p>
          <p className="mt-2 font-mono text-[10px] text-[#888]">
            请核对：Key 是否属于当前填写的服务商；DeepSeek / Moonshot / 通义 的 URL 与 model 不同，见
            .env 注释。
          </p>
          <button
            type="button"
            className="mt-3 font-mono text-xs text-[#aaa] underline decoration-[#666] underline-offset-4 hover:text-[#ddd]"
            onClick={() => setOracleError(null)}
          >
            关闭提示
          </button>
        </div>
      )}
      <div className="paper-noise pointer-events-none absolute inset-0" />

      <AnimatePresence mode="wait">
        {phase === PHASES.INPUT && (
          <motion.section
            key="input"
            className="flex w-full max-w-4xl items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.45 } }}
          >
            <textarea
              ref={textareaRef}
              value={input}
              onChange={onInputChange}
              onKeyDown={(event) => {
                if (event.key === "Enter" && input.trim()) {
                  event.preventDefault();
                  beginDistillation();
                }
              }}
              className="paper-input max-h-[280px] min-h-[68px] w-full resize-none text-center text-4xl md:text-5xl"
              placeholder="Unload your mind."
            />
          </motion.section>
        )}

        {phase === PHASES.EVAPORATING && (
          <motion.section
            key="evaporating"
            className="relative flex min-h-[260px] w-full max-w-5xl items-center justify-center overflow-visible px-4"
            initial={{ opacity: 1 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <DustField phase="up" />
            <p className="relative z-[1] flex flex-wrap justify-center text-center font-serif text-4xl font-semibold md:text-6xl">
              {quoteChars.map((item, index) => (
                <motion.span
                  key={item.id}
                  className="inline-block"
                  initial={{ y: 0, x: 0, opacity: 1, filter: "blur(0px)", rotate: 0 }}
                  animate={{
                    y: item.dy,
                    x: item.dx,
                    opacity: 0,
                    filter: "blur(4px)",
                    rotate: item.rot,
                  }}
                  transition={{
                    duration: 0.88,
                    ease: [0.18, 0.72, 0.22, 1],
                    delay: index * 0.011,
                  }}
                >
                  {item.char === " " ? "\u00A0" : item.char}
                </motion.span>
              ))}
            </p>
          </motion.section>
        )}

        {phase === PHASES.VOID && <section key="void" className="h-[280px] w-full" />}

        {(phase === PHASES.REVEAL ||
          phase === PHASES.DISCARDING ||
          phase === PHASES.ACCEPTED) && (
          <motion.section
            key={`reveal-${revealNonce}`}
            className="relative z-10 flex w-full max-w-5xl flex-col items-center justify-center touch-pan-y"
            {...revealTouchHandlers}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, transition: { duration: 0.35 } }}
            transition={{ duration: 0.5 }}
          >
            {phase === PHASES.DISCARDING && <DustField phase="right" />}

            <motion.div
              className="relative w-full px-2"
              animate={
                isDiscarding
                  ? {
                      x: "44vw",
                      opacity: 0,
                      filter: "blur(8px)",
                      skewX: -3,
                      transition: {
                        duration: DISCARD_MS / 1000,
                        ease: [0.45, 0, 0.15, 1],
                      },
                    }
                  : {
                      x: 0,
                      opacity: 1,
                      filter: "blur(0px)",
                      skewX: 0,
                      transition: { duration: 0.72, ease: [0.22, 1, 0.36, 1] },
                    }
              }
            >
              <motion.div
                className={`paper-rx-capture relative w-full text-center min-h-[min(48vh,26rem)] md:min-h-[min(52vh,30rem)] ${
                  phase === PHASES.ACCEPTED ? "receipt-frame py-8 md:py-10" : ""
                }`}
                initial={{ scale: 0.985, opacity: 1 }}
                animate={
                  phase === PHASES.ACCEPTED
                    ? {
                        scale: [0.994, 1],
                        opacity: [0.97, 1],
                        transition: {
                          duration: 0.72,
                          ease: [0.16, 1, 0.3, 1],
                          times: [0, 1],
                        },
                      }
                    : {
                        scale: 1,
                        opacity: 1,
                        transition: { duration: 0.85, ease: [0.16, 1, 0.3, 1] },
                      }
                }
              >
                {phase !== PHASES.ACCEPTED && (
                  <RevealBookWatermark title={currentPrescription.book.toUpperCase()} />
                )}

                <div className="relative z-[1]">
                  {phase === PHASES.ACCEPTED && (
                    <div className="mb-5 flex justify-end px-6 md:mb-6 md:px-10">
                      <p className="rx-stamp text-[11px] md:text-xs">{timestamp}</p>
                    </div>
                  )}

                  <div
                    className={
                      phase === PHASES.ACCEPTED ? "px-6 pb-2 md:px-10 md:pb-4" : undefined
                    }
                  >
                    {phase === PHASES.ACCEPTED ? (
                      <>
                        <blockquote className="relative z-[1] font-serif text-4xl font-black leading-tight md:text-6xl">
                          <span aria-hidden="true">&ldquo;</span>
                          {currentPrescription.quote}
                          <span aria-hidden="true">&rdquo;</span>
                        </blockquote>
                        <p className="mt-9 font-mono text-xs uppercase tracking-[0.22em] text-[#555] md:text-sm">
                          {currentPrescription.book} - {currentPrescription.author}
                        </p>
                        <p className="mx-auto mt-6 max-w-2xl font-mono text-sm leading-relaxed text-[#3f3f3f] md:text-base">
                          {currentPrescription.reason}
                        </p>
                      </>
                    ) : (
                      <>
                        <motion.blockquote
                          className="relative z-[1] font-serif text-4xl font-black leading-tight md:text-6xl"
                          initial="hidden"
                          animate="visible"
                          variants={{
                            visible: {
                              transition: {
                                staggerChildren: 0.055,
                                delayChildren: 0.06,
                              },
                            },
                            hidden: {},
                          }}
                        >
                          <motion.span
                            aria-hidden="true"
                            className="inline-block"
                            variants={{
                              hidden: { opacity: 0, y: 10, filter: "blur(8px)" },
                              visible: {
                                opacity: 1,
                                y: 0,
                                filter: "blur(0px)",
                                transition: { duration: 0.78, ease: [0.22, 1, 0.36, 1] },
                              },
                            }}
                          >
                            &ldquo;
                          </motion.span>
                          {quoteParts.map((part, i) => (
                            <motion.span
                              key={`${part}-${i}`}
                              className="inline-block whitespace-pre"
                              variants={{
                                hidden: { opacity: 0, y: 18, filter: "blur(12px)" },
                                visible: {
                                  opacity: 1,
                                  y: 0,
                                  filter: "blur(0px)",
                                  transition: { duration: 0.82, ease: [0.2, 1, 0.34, 1] },
                                },
                              }}
                            >
                              {part}
                            </motion.span>
                          ))}
                          <motion.span
                            aria-hidden="true"
                            className="inline-block"
                            variants={{
                              hidden: { opacity: 0, y: 10, filter: "blur(8px)" },
                              visible: {
                                opacity: 1,
                                y: 0,
                                filter: "blur(0px)",
                                transition: { duration: 0.78, ease: [0.22, 1, 0.36, 1] },
                              },
                            }}
                          >
                            &rdquo;
                          </motion.span>
                        </motion.blockquote>

                        <motion.p
                          className="mt-9 font-mono text-xs uppercase tracking-[0.22em] text-[#555] md:text-sm"
                          initial={{ opacity: 0, y: 8 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.35, duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
                        >
                          {currentPrescription.book} - {currentPrescription.author}
                        </motion.p>
                        <motion.p
                          className="mx-auto mt-6 max-w-2xl font-mono text-sm leading-relaxed text-[#3f3f3f] md:text-base"
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.48, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
                        >
                          {currentPrescription.reason}
                        </motion.p>
                      </>
                    )}
                  </div>
                </div>
              </motion.div>
            </motion.div>

            <AnimatePresence>
              {phase === PHASES.REVEAL && (
                <motion.div
                  key="discard-hint"
                  className="mt-12"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 0.85, transition: { delay: 0.65, duration: 0.5 } }}
                  exit={{ opacity: 0, transition: { duration: 0.42 } }}
                >
                  <div className="flex items-center justify-center gap-4 font-mono text-xs tracking-[0.2em] text-neutral-500 opacity-50 animate-pulse">
                    <span>Press [Enter] to print prescription.</span>
                    <span>·</span>
                    <span>Press [Space] to discard.</span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {phase === PHASES.ACCEPTED && (
              <>
                <motion.p
                  className="mt-10 font-mono text-xs tracking-[0.18em] text-[#4f4f4f] md:mt-12"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.12, duration: 0.55 }}
                >
                  The clinic is closed. Go read.
                </motion.p>
                <motion.div
                  className="mt-6 flex flex-wrap items-center justify-center font-mono text-base leading-snug text-neutral-500"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.32, duration: 0.5 }}
                >
                  <a
                    href={`https://www.goodreads.com/search?q=${encodeURIComponent(
                      `${currentPrescription.book} ${currentPrescription.author}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition-colors duration-300 hover:text-black"
                  >
                    Goodreads
                  </a>
                  <span className="mx-4 opacity-50">·</span>
                  <a
                    href={`https://www.worldcat.org/search?q=${encodeURIComponent(
                      `${currentPrescription.book} ${currentPrescription.author}`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="transition-colors duration-300 hover:text-black"
                  >
                    WorldCat
                  </a>
                </motion.div>
              </>
            )}
          </motion.section>
        )}
      </AnimatePresence>

      {phase === PHASES.INPUT && (
        <div className="absolute bottom-8 left-0 right-0 z-[5] px-6 text-center font-mono text-[10px] text-neutral-500 opacity-40 transition-opacity hover:opacity-100">
          built by juzi <span className="mx-2">·</span>{" "}
          <a
            href="mailto:paperpill@proton.me"
            className="transition-colors hover:text-black"
          >
            paperpill@proton.me
          </a>
        </div>
      )}

      <motion.p
        className="fixed bottom-6 right-6 max-w-[min(90vw,20rem)] text-right font-serif text-[1.75rem] leading-tight italic text-[#9a9a9a] md:bottom-8 md:right-10"
        animate={
          hideCornerLine
            ? { opacity: 0 }
            : isDistilling
              ? { opacity: [0.38, 0.82, 0.38] }
              : { opacity: hasTyped ? 1 : 0 }
        }
        transition={{
          duration: hideCornerLine ? 0.45 : isDistilling ? 2.1 : 0.85,
          repeat: isDistilling && !hideCornerLine ? Infinity : 0,
          ease: "easeInOut",
        }}
      >
        {isDistilling ? "- distilling." : "- I'm listening."}
      </motion.p>
    </main>
  );
}

export default App;
