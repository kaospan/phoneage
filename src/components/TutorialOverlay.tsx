import { useEffect, useMemo, useRef, useState } from "react";
import { RotateCcw } from "lucide-react";
import dinotoonUrl from "@/assets/dinotoon.png";
import type { TutorialDefinition, TutorialSound } from "@/lib/tutorials/tutorialTypes";
import { Button } from "@/components/ui/button";

const CELL_PX = 64;

// ─── Synthesized sound effects (no audio assets needed) ───────────────────────

let audioCtx: AudioContext | null = null;
const getAudioCtx = (): AudioContext | null => {
  if (typeof window === "undefined") return null;
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!audioCtx) audioCtx = new Ctor();
  return audioCtx;
};

const playTone = (freqStart: number, freqEnd: number, durationSec: number, type: OscillatorType = "sine", gainPeak = 0.08) => {
  const ctx = getAudioCtx();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqStart, ctx.currentTime);
  osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), ctx.currentTime + durationSec);
  gain.gain.setValueAtTime(0.0001, ctx.currentTime);
  gain.gain.exponentialRampToValueAtTime(gainPeak, ctx.currentTime + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + durationSec);
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.start();
  osc.stop(ctx.currentTime + durationSec + 0.05);
};

const playTutorialSound = (sound: TutorialSound | undefined) => {
  if (!sound) return;
  try {
    switch (sound) {
      case "tap": playTone(520, 460, 0.08, "triangle", 0.06); break;
      case "glide": playTone(300, 900, 0.5, "sawtooth", 0.05); break;
      case "unlock": playTone(440, 880, 0.15, "square", 0.05); setTimeout(() => playTone(660, 1200, 0.18, "square", 0.05), 120); break;
      case "collect": playTone(700, 1100, 0.2, "sine", 0.07); break;
      case "teleport": playTone(200, 1600, 0.4, "sine", 0.06); break;
      case "break": playTone(180, 90, 0.25, "sawtooth", 0.08); break;
      case "chime": playTone(600, 1000, 0.3, "sine", 0.07); setTimeout(() => playTone(900, 1300, 0.3, "sine", 0.06), 150); break;
    }
  } catch {
    // Audio is best-effort; never let it break the tutorial.
  }
};

// ─── Mini-board tile rendering ─────────────────────────────────────────────────

const TileBg = ({ type }: { type: number }) => {
  switch (type) {
    case 0: // floor
      return <div className="h-full w-full" style={{ background: "linear-gradient(135deg,#d9a55a,#b8823a)" }} />;
    case 2: // stone
      return <div className="h-full w-full" style={{ background: "linear-gradient(135deg,#5b4d42,#332a22)" }} />;
    case 3: // cave/goal
      return (
        <div className="flex h-full w-full items-center justify-center" style={{ background: "#241a12" }}>
          <div className="h-3/5 w-3/5 rounded-t-full" style={{ background: "radial-gradient(circle at 50% 30%,#22c55e,#14532d)" }} />
        </div>
      );
    case 5: // void
      return <div className="h-full w-full" style={{ background: "#0a0a0c" }} />;
    case 6: // breakable rock
      return (
        <div className="relative h-full w-full" style={{ background: "linear-gradient(135deg,#8a6238,#5c3f1f)" }}>
          <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
            <path d="M50,50 L40,20 M50,50 L75,35 M50,50 L65,80 M50,50 L20,65" stroke="rgba(0,0,0,0.7)" strokeWidth="4" fill="none" />
          </svg>
        </div>
      );
    case 14: case 15: case 16: case 17: case 19: case 20:
      return <div className="h-full w-full" style={{ background: "linear-gradient(135deg,#c8a455,#8a6a2f)" }} />;
    default: // arrow tiles share a warm background
      return <div className="h-full w-full" style={{ background: "linear-gradient(135deg,#c8a455,#8a6a2f)" }} />;
  }
};

const TileIcon = ({ type }: { type: number }) => {
  const arrowRotation: Record<number, number> = { 7: 0, 8: 90, 9: 180, 10: 270 };
  if (type >= 7 && type <= 10) {
    return (
      <svg viewBox="0 0 32 32" className="h-2/3 w-2/3" style={{ transform: `rotate(${arrowRotation[type]}deg)` }}>
        <path d="M12 26 L12 14 L7 14 L16 5 L25 14 L20 14 L20 26 Z" fill="#f6c84f" stroke="rgba(0,0,0,0.7)" strokeWidth="2" />
      </svg>
    );
  }
  if (type === 11 || type === 12 || type === 13) {
    return (
      <svg viewBox="0 0 32 32" className="h-2/3 w-2/3" style={{ transform: type === 12 ? "rotate(90deg)" : undefined }}>
        <path
          d="M13 13 L13 8 L10 8 L16 2 L22 8 L19 8 L19 13 L24 13 L24 10 L30 16 L24 22 L24 19 L19 19 L19 24 L22 24 L16 30 L10 24 L13 24 L13 19 L8 19 L8 22 L2 16 L8 10 L8 13 Z"
          fill="#f6c84f"
          stroke="rgba(0,0,0,0.7)"
          strokeWidth="1.5"
        />
      </svg>
    );
  }
  if (type === 14 || type === 15) {
    return <div className="text-2xl">{type === 14 ? "🗝️" : "🔑"}</div>;
  }
  if (type === 16 || type === 17) {
    return <div className="text-2xl">🔒</div>;
  }
  if (type === 19) {
    return (
      <svg viewBox="0 0 32 32" className="h-2/3 w-2/3">
        <circle cx="16" cy="16" r="12" fill="none" stroke="#c084fc" strokeWidth="3" />
        <circle cx="16" cy="16" r="6" fill="#c084fc" opacity="0.7" />
      </svg>
    );
  }
  if (type === 20) {
    return <div className="text-2xl">⏳</div>;
  }
  return null;
};

const FingerCursor = () => (
  <svg viewBox="0 0 48 48" className="pointer-events-none h-10 w-10 drop-shadow-lg">
    <circle cx="24" cy="24" r="18" fill="rgba(255,255,255,0.18)" className="animate-ping" />
    <path
      d="M20 30 L20 14 a3 3 0 0 1 6 0 L26 24 M26 24 L26 12 a3 3 0 0 1 6 0 L32 24 M32 24 L32 16 a3 3 0 0 1 6 0 L38 28 a10 10 0 0 1 -10 10 L24 38 a8 8 0 0 1 -6 -3 L12 28 a3 3 0 0 1 4 -4 L20 28"
      fill="#ffe4b5"
      stroke="#4a2f14"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

// Mimics the real in-game Replay button so the callout reads as "this exact button", not a
// generic icon — paired with a pulsing ring and a bouncing finger so it can't be missed.
const UiCallout = ({ label }: { label: string }) => (
  <div className="flex h-full w-full flex-col items-center justify-center">
    <div className="relative">
      <div className="absolute -inset-3 rounded-2xl bg-amber-300/25 animate-ping" />
      <div className="relative flex items-center gap-2 rounded-2xl border border-white/20 bg-white/10 px-4 py-2.5 text-stone-50 shadow-xl">
        <RotateCcw className="h-5 w-5 text-amber-300" />
        <span className="text-sm font-black uppercase tracking-[0.08em]">{label}</span>
      </div>
      <div className="absolute left-1/2 top-full -translate-x-1/2 animate-bounce pt-1">
        <FingerCursor />
      </div>
    </div>
  </div>
);

// ─── Main overlay ───────────────────────────────────────────────────────────────

interface TutorialOverlayProps {
  queue: TutorialDefinition[];
  onDone: (shown: TutorialDefinition[]) => void;
}

// Steps auto-advance (that's the walkthrough animation), but the overlay itself must never
// disappear on its own — only an explicit click (Skip, Got it, or the ×) may close it. Slowed
// down from the original pacing so captions have time to actually be read.
const STEP_DURATION_MULTIPLIER = 1.5;

export function TutorialOverlay({ queue, onDone }: TutorialOverlayProps) {
  const [tutorialIndex, setTutorialIndex] = useState(0);
  const [stepIndex, setStepIndex] = useState(0);
  const [awaitingDismiss, setAwaitingDismiss] = useState(false);
  const shownRef = useRef<TutorialDefinition[]>([]);
  const timerRef = useRef<number | null>(null);

  const tutorial = queue[tutorialIndex] ?? null;
  const step = tutorial?.steps[stepIndex] ?? null;

  const finish = () => {
    if (timerRef.current != null) window.clearTimeout(timerRef.current);
    onDone(shownRef.current);
  };

  const advance = () => {
    if (!tutorial) return;
    if (stepIndex < tutorial.steps.length - 1) {
      setStepIndex((i) => i + 1);
      return;
    }
    if (!shownRef.current.includes(tutorial)) shownRef.current.push(tutorial);
    if (tutorialIndex < queue.length - 1) {
      setTutorialIndex((i) => i + 1);
      setStepIndex(0);
      return;
    }
    // Reached the end of the last queued tutorial — freeze here instead of auto-closing;
    // the player has to click Got it (or ×) to dismiss.
    setAwaitingDismiss(true);
  };

  const skip = () => {
    // Skipping still marks every queued tutorial as "shown" — the player has seen the prompt.
    shownRef.current = [...queue];
    finish();
  };

  useEffect(() => {
    if (!step || awaitingDismiss) return;
    playTutorialSound(step.sound);
    timerRef.current = window.setTimeout(advance, step.durationMs * STEP_DURATION_MULTIPLIER);
    return () => { if (timerRef.current != null) window.clearTimeout(timerRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tutorialIndex, stepIndex, awaitingDismiss]);

  const rows = tutorial?.miniGrid.length ?? 0;
  const cols = tutorial?.miniGrid[0]?.length ?? 0;

  const transform = useMemo(() => {
    if (!step?.cameraFocus) return "";
    const cx = (step.cameraFocus.x + 0.5) * CELL_PX;
    const cy = (step.cameraFocus.y + 0.5) * CELL_PX;
    return `translate(calc(50% - ${cx}px), calc(50% - ${cy}px)) scale(${step.cameraZoom ?? 1})`;
  }, [step]);

  const transitionMs = step?.slowMotion ? 900 : 320;

  if (!tutorial || !step) return null;

  return (
    <div className="absolute inset-0 z-[90] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm">
      <button
        onClick={skip}
        aria-label="Close tutorial"
        title="Hide tutorial"
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-white/5 text-lg text-stone-300 hover:bg-white/15 hover:text-stone-50"
      >
        ×
      </button>
      <div className="flex w-full max-w-xl flex-col items-center px-4">
        <div className="text-center">
          <div className="text-base font-black uppercase tracking-[0.22em] text-amber-300 sm:text-lg">{tutorial.title}</div>
          <div className="mt-2 text-lg font-medium leading-snug text-stone-50 sm:text-xl">{step.caption ?? tutorial.text}</div>
        </div>

        <div
          className="relative mt-4 w-full overflow-hidden rounded-2xl border border-white/15 bg-black shadow-2xl"
          style={{ height: 220 }}
        >
          {step.uiCallout ? (
            <UiCallout label={step.uiCallout.label} />
          ) : (
            <div
              className="absolute left-0 top-0"
              style={{
                width: cols * CELL_PX,
                height: rows * CELL_PX,
                transform,
                transformOrigin: "top left",
                transition: `transform ${transitionMs}ms ease-in-out`,
              }}
            >
              {tutorial.miniGrid.map((row, y) =>
                row.map((cellType, x) => {
                  const isHighlighted = step.highlightCells?.some((c) => c.x === x && c.y === y);
                  return (
                    <div
                      key={`${x}-${y}`}
                      className="absolute overflow-hidden"
                      style={{
                        left: x * CELL_PX,
                        top: y * CELL_PX,
                        width: CELL_PX,
                        height: CELL_PX,
                        boxShadow: isHighlighted ? "inset 0 0 0 3px #fde047, 0 0 18px 4px rgba(253,224,71,0.8)" : "inset 0 0 0 1px rgba(0,0,0,0.3)",
                        transition: "box-shadow 250ms ease-in-out",
                      }}
                    >
                      <TileBg type={cellType} />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <TileIcon type={cellType} />
                      </div>
                    </div>
                  );
                }),
              )}

              {/* Character */}
              {step.characterAt && (
                <div
                  className="absolute flex items-center justify-center"
                  style={{
                    left: step.characterAt.x * CELL_PX,
                    top: step.characterAt.y * CELL_PX,
                    width: CELL_PX,
                    height: CELL_PX,
                    transition: `left ${transitionMs}ms ease-in-out, top ${transitionMs}ms ease-in-out`,
                  }}
                >
                  <img src={dinotoonUrl} alt="" className="h-[85%] w-[85%] object-contain" style={{ imageRendering: "auto" }} />
                </div>
              )}

              {/* Animated finger cursor */}
              {step.fingerAt && (
                <div
                  className="absolute flex items-center justify-center"
                  style={{
                    left: step.fingerAt.x * CELL_PX,
                    top: step.fingerAt.y * CELL_PX,
                    width: CELL_PX,
                    height: CELL_PX,
                    transition: `left ${transitionMs}ms ease-in-out, top ${transitionMs}ms ease-in-out`,
                  }}
                >
                  <FingerCursor />
                </div>
              )}
            </div>
          )}
        </div>

        <div className="mt-3 flex items-center gap-2">
          {queue.map((t, i) => (
            <div
              key={t.id}
              className={[
                "h-1.5 w-6 rounded-full transition-colors",
                i < tutorialIndex ? "bg-amber-300" : i === tutorialIndex ? "bg-amber-300/60" : "bg-white/15",
              ].join(" ")}
            />
          ))}
        </div>

        {awaitingDismiss ? (
          <Button
            onClick={finish}
            size="lg"
            className="mt-5 bg-amber-400 px-8 text-base font-black text-stone-950 hover:bg-amber-300"
          >
            Got it!
          </Button>
        ) : (
          <Button
            onClick={skip}
            variant="ghost"
            size="sm"
            className="mt-4 text-sm text-stone-300 hover:bg-white/10 hover:text-stone-50"
          >
            Skip
          </Button>
        )}
      </div>
    </div>
  );
}
