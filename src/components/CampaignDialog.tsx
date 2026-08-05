import { useMemo, useState } from "react";
import { Map, Play, RotateCcw } from "lucide-react";

import type { ColorTheme } from "@/data/levels";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Progress } from "@/components/ui/progress";
import { CampaignMapPath } from "./CampaignMapPath";

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
  onStartOver: () => void;
}

export const CampaignDialog = ({
  compact = false,
  disabled = false,
  levels,
  completedCount,
  frontierLevelId,
  progressValue,
  totalLevels,
  onSelectLevel,
  onStartOver,
}: CampaignDialogProps) => {
  const [open, setOpen] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
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
      <DialogContent className="max-h-[calc(100svh-1rem)] w-[calc(100vw-1rem)] max-w-4xl grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden border-white/10 bg-stone-950/95 p-0 text-stone-100">
        <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_42%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.16),transparent_40%)] px-4 py-4 sm:px-6 sm:py-5">
          {/* DialogContent already renders its own close (×) button in the top-right corner —
              this header just reserves space for it (pr-12) instead of adding a second one. */}
          <DialogHeader className="min-w-0 gap-2 pr-12 text-left">
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

          <div className="mt-3 flex justify-end">
            <Button
              type="button"
              onClick={() => setConfirmingReset(true)}
              variant="outline"
              size="sm"
              className="gap-1.5 border-red-400/30 bg-red-500/10 text-red-200 hover:bg-red-500/20 hover:text-red-100"
              title="Erase all campaign progress and start over from Level 1"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Start Over
            </Button>
          </div>
        </div>

        <CampaignMapPath
          levels={levels}
          onSelectLevel={onSelectLevel}
          onAfterSelect={() => setOpen(false)}
        />
      </DialogContent>

      <AlertDialog open={confirmingReset} onOpenChange={setConfirmingReset}>
        <AlertDialogContent className="border-white/10 bg-stone-950 text-stone-50">
          <AlertDialogHeader>
            <AlertDialogTitle>Start over?</AlertDialogTitle>
            <AlertDialogDescription className="text-stone-400">
              This permanently erases every level's progress — clears, best moves, best times,
              all of it — on this account, and unlocks only Level 1 again. It can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-white/10 text-stone-300 hover:text-stone-100">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                onStartOver();
                setOpen(false);
              }}
              className="bg-red-500 text-white hover:bg-red-400"
            >
              Erase everything
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Dialog>
  );
};
