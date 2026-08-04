import { useEffect, useMemo, useRef } from "react";
import { Lock, MapPin, Star } from "lucide-react";
import { themes } from "@/data/levels";
import { cn } from "@/lib/utils";
import type { CampaignDialogLevel } from "./CampaignDialog";

const DOTS_PER_ROW = 4;
const ROW_HEIGHT = 108;
const DOT_SIZE = 56;
// Keeps dots away from the container edges (as a fraction of width) so they never get clipped.
const EDGE_INSET_FRAC = 0.14;

interface CampaignMapPathProps {
  levels: CampaignDialogLevel[];
  onSelectLevel: (levelId: number) => void;
  onAfterSelect?: () => void;
}

/** x position (0-1 fraction of width) of the i-th dot within its row, snaking left-right. */
const xFractionForCol = (col: number, row: number): number => {
  const t = DOTS_PER_ROW <= 1 ? 0.5 : col / (DOTS_PER_ROW - 1);
  const eased = EDGE_INSET_FRAC + t * (1 - EDGE_INSET_FRAC * 2);
  return row % 2 === 0 ? eased : 1 - eased;
};

export function CampaignMapPath({ levels, onSelectLevel, onAfterSelect }: CampaignMapPathProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const currentDotRef = useRef<HTMLButtonElement | null>(null);

  const rowCount = Math.max(1, Math.ceil(levels.length / DOTS_PER_ROW));
  const contentHeight = rowCount * ROW_HEIGHT + DOT_SIZE;

  const points = useMemo(
    () =>
      levels.map((level, i) => {
        const row = Math.floor(i / DOTS_PER_ROW);
        const col = i % DOTS_PER_ROW;
        const xFrac = xFractionForCol(col, row);
        return { level, row, col, xFrac, y: row * ROW_HEIGHT + DOT_SIZE / 2 };
      }),
    [levels],
  );

  // The SVG uses a 0-100 (percent-like) X coordinate space via viewBox + preserveAspectRatio
  //="none", so this can share the exact same xFrac used to position the HTML dot buttons.
  const pathD = useMemo(() => {
    if (points.length === 0) return "";
    return points.map((p, i) => `${i === 0 ? "M" : "L"} ${(p.xFrac * 100).toFixed(2)} ${p.y}`).join(" ");
  }, [points]);

  // Auto-scroll so the current (or next-up) level starts roughly a third of the way down the
  // viewport when the map first opens — new players land right where they left off.
  useEffect(() => {
    const node = containerRef.current;
    const dot = currentDotRef.current;
    if (!node || !dot) return;
    const target = Math.max(0, dot.offsetTop - node.clientHeight / 3);
    node.scrollTop = target;
  }, []);

  const frontierIndex = levels.findIndex((l) => l.isCurrent);

  return (
    <div
      ref={containerRef}
      className="relative min-h-0 flex-1 overflow-y-auto overflow-x-hidden"
      style={{
        backgroundImage:
          "radial-gradient(circle at 15% 8%, rgba(245,158,11,0.10), transparent 32%), radial-gradient(circle at 85% 92%, rgba(56,189,248,0.08), transparent 34%), linear-gradient(180deg, #1c1512 0%, #120d0a 100%)",
      }}
    >
      <div className="relative mx-auto w-full max-w-md" style={{ height: contentHeight }}>
        <svg
          className="absolute inset-0 h-full w-full overflow-visible"
          viewBox={`0 0 100 ${contentHeight}`}
          preserveAspectRatio="none"
          aria-hidden
        >
          <path
            d={pathD}
            fill="none"
            stroke="rgba(120,90,55,0.9)"
            strokeWidth={10}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={pathD}
            fill="none"
            stroke="rgba(252,211,77,0.55)"
            strokeWidth={3}
            strokeDasharray="2 14"
            strokeLinecap="round"
            className="animate-map-trail-flow"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {points.map(({ level, xFrac, y }, i) => {
          const accentColor = themes[level.theme ?? "default"]?.arrow ?? "#d4a574";
          const isNextUp = i === frontierIndex;
          return (
            <button
              key={level.id}
              ref={isNextUp ? currentDotRef : undefined}
              type="button"
              disabled={!level.isUnlocked}
              onClick={() => {
                if (!level.isUnlocked) return;
                onSelectLevel(level.id);
                onAfterSelect?.();
              }}
              className={cn(
                "group absolute flex flex-col items-center justify-center rounded-full border-2 text-sm font-black shadow-lg transition-transform animate-map-dot-pop",
                "disabled:cursor-not-allowed",
                level.isUnlocked ? "hover:scale-110" : "opacity-50",
              )}
              style={{
                left: `${xFrac * 100}%`,
                top: y,
                width: DOT_SIZE,
                height: DOT_SIZE,
                transform: "translate(-50%, -50%)",
                animationDelay: `${Math.min(i, 40) * 30}ms`,
                background: level.isCompleted
                  ? `linear-gradient(135deg, ${accentColor}, #7a5618)`
                  : level.isUnlocked
                    ? "rgba(28,21,17,0.92)"
                    : "rgba(20,15,12,0.85)",
                borderColor: isNextUp ? "#fde047" : level.isUnlocked ? accentColor : "rgba(255,255,255,0.15)",
                boxShadow: isNextUp
                  ? "0 0 0 4px rgba(253,224,71,0.25), 0 0 22px rgba(253,224,71,0.55)"
                  : level.isCompleted
                    ? "0 2px 10px rgba(0,0,0,0.5)"
                    : undefined,
              }}
              title={`Level ${level.id}${level.isUnlocked ? "" : " (locked)"}`}
            >
              {level.isCompleted ? (
                <Star className="h-5 w-5 text-stone-950" fill="currentColor" />
              ) : level.isUnlocked ? (
                <span className="text-stone-50">{level.id}</span>
              ) : (
                <Lock className="h-4 w-4 text-stone-500" />
              )}
              {isNextUp && (
                <MapPin className="absolute -top-7 h-5 w-5 animate-bounce text-amber-300 drop-shadow" fill="currentColor" />
              )}
              <span
                className={cn(
                  "pointer-events-none absolute top-full mt-1 whitespace-nowrap text-[10px] font-bold uppercase tracking-wide opacity-0 transition-opacity",
                  level.isUnlocked && "group-hover:opacity-100",
                )}
                style={{ color: accentColor }}
              >
                L{level.id}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default CampaignMapPath;
