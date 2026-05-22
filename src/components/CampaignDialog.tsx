import { useMemo, useState } from "react";
import { Lock, Map, Play, TimerReset, Trophy } from "lucide-react";

import { themes, type ColorTheme } from "@/data/levels";
import { cn } from "@/lib/utils";
import { formatCampaignClock } from "@/lib/campaignProgress";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

export interface CampaignDialogLevel {
  id: number;
  theme?: ColorTheme;
  isCurrent: boolean;
  isCompleted: boolean;
  isUnlocked: boolean;
  bestMoves: number | null;
  bestTimeLeftSeconds: number | null;
}

interface CampaignDialogProps {
  compact?: boolean;
  disabled?: boolean;
  levels: CampaignDialogLevel[];
  completedCount: number;
  frontierLevelId: number | null;
  progressValue: number;
  totalLevels: number;
  onSelectLevel: (levelId: number) => void;
}

const statusLabel = (level: CampaignDialogLevel) => {
  if (level.isCurrent) return "Current";
  if (!level.isUnlocked) return "Locked";
  if (level.isCompleted) return "Cleared";
  return "Ready";
};

export const CampaignDialog = ({
  compact = false,
  disabled = false,
  levels,
  completedCount,
  frontierLevelId,
  progressValue,
  totalLevels,
  onSelectLevel,
}: CampaignDialogProps) => {
  const [open, setOpen] = useState(false);
  const lockedCount = useMemo(
    () => levels.reduce((count, level) => count + (level.isUnlocked ? 0 : 1), 0),
    [levels],
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          size={compact ? "sm" : "default"}
          disabled={disabled}
          className={compact ? "h-9 px-2" : "h-10 px-3"}
          title="Open campaign progress and level browser"
        >
          <Map className="h-4 w-4" />
          {!compact && <span>Campaign</span>}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl gap-0 overflow-hidden border-white/10 bg-stone-950/95 p-0 text-stone-100">
        <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_42%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.16),transparent_40%)] px-6 py-5">
          <DialogHeader className="gap-2 text-left">
            <DialogTitle className="flex items-center gap-2 text-xl font-black uppercase tracking-[0.14em] text-stone-50">
              <Map className="h-5 w-5 text-amber-300" />
              Campaign Map
            </DialogTitle>
            <DialogDescription className="text-stone-300">
              Track clears, revisit solved stages, and push the campaign frontier forward one puzzle at a time.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">Cleared</div>
              <div className="mt-2 text-3xl font-black text-stone-50">{completedCount}</div>
              <div className="mt-1 text-sm text-stone-300">of {totalLevels} total stages</div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">Frontier</div>
              <div className="mt-2 flex items-center gap-2 text-3xl font-black text-stone-50">
                <Play className="h-5 w-5 text-emerald-300" />
                <span>{frontierLevelId == null ? "--" : frontierLevelId}</span>
              </div>
              <div className="mt-1 text-sm text-stone-300">
                {lockedCount > 0 ? `${lockedCount} stages still locked` : "Every stage is unlocked"}
              </div>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">Completion</div>
              <div className="mt-2 text-3xl font-black text-stone-50">{Math.round(progressValue)}%</div>
              <div className="mt-3">
                <Progress value={progressValue} className="h-2.5 bg-white/10 [&>div]:bg-amber-400" />
              </div>
            </div>
          </div>
        </div>

        <div className="max-h-[65vh] overflow-y-auto px-6 py-5">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {levels.map((level) => {
              const accentColor = themes[level.theme ?? "default"]?.arrow ?? "#d4a574";
              const bestClock = formatCampaignClock(level.bestTimeLeftSeconds);

              return (
                <button
                  key={level.id}
                  type="button"
                  disabled={!level.isUnlocked}
                  onClick={() => {
                    if (!level.isUnlocked) return;
                    onSelectLevel(level.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "group rounded-2xl border px-4 py-4 text-left transition-all",
                    "disabled:cursor-not-allowed disabled:opacity-60",
                    level.isCurrent
                      ? "border-amber-300/80 bg-amber-500/15 shadow-[0_0_0_1px_rgba(252,211,77,0.25)]"
                      : level.isUnlocked
                        ? "border-white/10 bg-white/5 hover:border-amber-200/40 hover:bg-white/10"
                        : "border-white/10 bg-white/[0.03]",
                  )}
                >
                  <div className="mb-4 h-1.5 w-full rounded-full" style={{ backgroundColor: accentColor }} />
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">
                        Level {level.id}
                      </div>
                      <div className="mt-1 text-lg font-black text-stone-50">
                        {level.isCompleted ? "Solved Route" : level.isUnlocked ? "Open Challenge" : "Locked Route"}
                      </div>
                    </div>
                    <Badge
                      variant={level.isCurrent ? "default" : "outline"}
                      className={cn(
                        "shrink-0 border-white/15 bg-white/10 text-[11px] font-black uppercase tracking-[0.14em]",
                        level.isCurrent && "border-transparent bg-amber-300 text-stone-950",
                      )}
                    >
                      {statusLabel(level)}
                    </Badge>
                  </div>

                  <div className="mt-4 space-y-2 text-sm text-stone-300">
                    {level.bestMoves != null ? (
                      <div className="flex items-center gap-2">
                        <Trophy className="h-4 w-4 text-amber-300" />
                        <span>{level.bestMoves} best moves</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-stone-500">
                        {level.isUnlocked ? <Play className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
                        <span>{level.isUnlocked ? "No clear recorded yet" : "Complete earlier stages to unlock"}</span>
                      </div>
                    )}

                    {bestClock ? (
                      <div className="flex items-center gap-2">
                        <TimerReset className="h-4 w-4 text-sky-300" />
                        <span>{bestClock} left on the clock</span>
                      </div>
                    ) : (
                      <div className="h-5" />
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
