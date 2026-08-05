import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, SkipBack, SkipForward, RotateCcw, Loader2 } from 'lucide-react';
import { useLevelMapper } from '@/components/level-mapper/useLevelMapper';
import { GameTop2D } from '@/components/GameTop2D';
import { LevelThumbnail } from './LevelThumbnail';
import { MapperPanelFrame, MapperMetricPill } from './MapperChrome';
import {
  runSolveLevel,
  replaySolutionActions,
  generateSolverTraceHTML,
  type LevelSolution,
  type SolutionFrame,
} from '@/lib/levelSolver';
import type { CellType } from '@/game/types';
import { cn } from '@/lib/utils';

// Levels 1-100 were captured from the original DOS game's screenshots; 101-200 are
// procedurally generated. The split matters here because it's the whole point of this view —
// letting the two ranges be compared side by side by move-count / structure.
const PROCEDURAL_LEVEL_START = 101;

type SolveStatus = 'unattempted' | 'solving' | 'solved' | 'unsolved' | 'error';
interface SolveEntry {
  status: SolveStatus;
  solution?: LevelSolution;
  error?: string;
}

type ScopeFilter = 'all' | 'original' | 'procedural';

const SINGLE_SOLVE_OPTS = { maxMsPerLevel: 6000, maxNodesPerLevel: 80_000, maxDepth: 220 };
const BATCH_SOLVE_OPTS = { maxMsPerLevel: 2000, maxNodesPerLevel: 20_000, maxDepth: 160 };
const PLAYBACK_INTERVAL_MS = 550;

const statusStyle: Record<SolveStatus, string> = {
  unattempted: 'border-white/10 bg-white/[0.04] text-stone-400',
  solving: 'border-sky-300/30 bg-sky-500/10 text-sky-100',
  solved: 'border-emerald-300/30 bg-emerald-500/10 text-emerald-100',
  unsolved: 'border-red-300/30 bg-red-500/10 text-red-100',
  error: 'border-amber-300/30 bg-amber-500/10 text-amber-100',
};

const statusLabel = (entry: SolveEntry | undefined): string => {
  if (!entry || entry.status === 'unattempted') return 'Not solved yet';
  if (entry.status === 'solving') return 'Solving…';
  if (entry.status === 'solved') return `${entry.solution?.moves ?? '?'} moves`;
  if (entry.status === 'error') return 'Solver error';
  return entry.solution?.reason ?? 'Unsolved';
};

export const LevelSolutionsBrowser: React.FC = () => {
  const { allLevels } = useLevelMapper();

  const [selectedId, setSelectedId] = useState<number | null>(allLevels[0]?.id ?? null);
  const [solveStatus, setSolveStatus] = useState<Record<number, SolveEntry>>({});
  const solveStatusRef = useRef(solveStatus);
  useEffect(() => {
    solveStatusRef.current = solveStatus;
  }, [solveStatus]);

  const [scope, setScope] = useState<ScopeFilter>('all');
  const [unsolvedOnly, setUnsolvedOnly] = useState(false);
  const [search, setSearch] = useState('');

  const [batchRunning, setBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState({ done: 0, total: 0 });
  const batchCancelRef = useRef(false);

  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);

  const solveOne = useCallback(async (id: number) => {
    setSolveStatus((prev) => ({ ...prev, [id]: { status: 'solving' } }));
    try {
      const result = await runSolveLevel(id, SINGLE_SOLVE_OPTS);
      setSolveStatus((prev) => ({
        ...prev,
        [id]: { status: result.solved ? 'solved' : 'unsolved', solution: result },
      }));
    } catch (err) {
      setSolveStatus((prev) => ({ ...prev, [id]: { status: 'error', error: (err as Error).message } }));
    }
  }, []);

  const filteredLevels = useMemo(() => {
    const q = search.trim();
    const qNum = q ? Number(q) : null;
    return allLevels.filter((lvl) => {
      if (scope === 'original' && lvl.id >= PROCEDURAL_LEVEL_START) return false;
      if (scope === 'procedural' && lvl.id < PROCEDURAL_LEVEL_START) return false;
      if (unsolvedOnly) {
        const entry = solveStatus[lvl.id];
        if (entry?.status === 'solved') return false;
      }
      if (q && Number.isFinite(qNum)) {
        if (!String(lvl.id).includes(q)) return false;
      }
      return true;
    });
  }, [allLevels, scope, unsolvedOnly, search, solveStatus]);

  const scopeStats = useMemo(() => {
    const moves: number[] = [];
    let solvedCount = 0;
    let attemptedCount = 0;
    for (const lvl of filteredLevels) {
      const entry = solveStatus[lvl.id];
      if (!entry || entry.status === 'unattempted') continue;
      attemptedCount += 1;
      if (entry.status === 'solved' && entry.solution?.moves != null) {
        solvedCount += 1;
        moves.push(entry.solution.moves);
      }
    }
    const avg = moves.length ? moves.reduce((a, b) => a + b, 0) / moves.length : null;
    return {
      attemptedCount,
      solvedCount,
      total: filteredLevels.length,
      min: moves.length ? Math.min(...moves) : null,
      max: moves.length ? Math.max(...moves) : null,
      avg,
    };
  }, [filteredLevels, solveStatus]);

  const runBatch = useCallback(
    async (ids: number[]) => {
      batchCancelRef.current = false;
      setBatchRunning(true);
      setBatchProgress({ done: 0, total: ids.length });
      let done = 0;
      for (const id of ids) {
        if (batchCancelRef.current) break;
        const existing = solveStatusRef.current[id]?.status;
        if (existing !== 'solved') {
          setSolveStatus((prev) => ({ ...prev, [id]: { status: 'solving' } }));
          try {
            const result = await runSolveLevel(id, BATCH_SOLVE_OPTS);
            setSolveStatus((prev) => ({
              ...prev,
              [id]: { status: result.solved ? 'solved' : 'unsolved', solution: result },
            }));
          } catch (err) {
            setSolveStatus((prev) => ({ ...prev, [id]: { status: 'error', error: (err as Error).message } }));
          }
        }
        done += 1;
        setBatchProgress({ done, total: ids.length });
        // Yield so the list/thumbnails can repaint between levels instead of freezing the tab.
        await new Promise(requestAnimationFrame);
      }
      setBatchRunning(false);
    },
    [],
  );

  const selectedLevel = useMemo(
    () => allLevels.find((lvl) => lvl.id === selectedId) ?? null,
    [allLevels, selectedId],
  );
  const selectedEntry = selectedId != null ? solveStatus[selectedId] : undefined;

  const frames: SolutionFrame[] = useMemo(() => {
    if (!selectedLevel || !selectedEntry?.solution?.solved) return [];
    return replaySolutionActions(
      selectedLevel.grid as CellType[][],
      selectedLevel.playerStart,
      selectedEntry.solution.actions,
    );
  }, [selectedLevel, selectedEntry]);

  useEffect(() => {
    setStepIndex(0);
    setPlaying(false);
  }, [selectedId, frames]);

  useEffect(() => {
    if (!playing || frames.length === 0) return;
    const id = window.setInterval(() => {
      setStepIndex((i) => {
        if (i >= frames.length - 1) {
          setPlaying(false);
          return i;
        }
        return i + 1;
      });
    }, PLAYBACK_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [playing, frames.length]);

  const currentFrame = frames[Math.min(stepIndex, Math.max(0, frames.length - 1))] ?? null;
  const displayGrid = currentFrame ? currentFrame.grid : selectedLevel?.grid ?? null;
  const displayPlayerPos = currentFrame ? currentFrame.playerPos : selectedLevel?.playerStart ?? null;

  return (
    <div className="flex h-full min-h-0 w-full gap-3">
      {/* Level list */}
      <MapperPanelFrame className="w-[320px] shrink-0">
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="border-b border-white/10 px-3 py-3">
            <div className="text-sm font-semibold text-stone-50">Level Solutions</div>
            <div className="mt-0.5 text-[11px] leading-snug text-stone-400">
              Top-view preview + solved playthrough for every level.
            </div>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {(['all', 'original', 'procedural'] as ScopeFilter[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setScope(s)}
                  className={cn(
                    'rounded-lg border px-2 py-1 text-[10px] font-black uppercase tracking-[0.12em] transition-colors',
                    scope === s
                      ? 'border-amber-300/40 bg-amber-500/15 text-amber-100'
                      : 'border-white/10 bg-white/[0.04] text-stone-400 hover:text-stone-100',
                  )}
                >
                  {s === 'all' ? 'All 1–200' : s === 'original' ? 'Original 1–100' : 'Procedural 101–200'}
                </button>
              ))}
            </div>

            <div className="mt-2 flex items-center gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Find level #"
                className="h-8 min-w-0 flex-1 rounded-xl border border-white/10 bg-stone-900/85 px-2.5 text-xs text-stone-100 [color-scheme:dark]"
              />
              <label className="flex shrink-0 items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-stone-400">
                <input
                  type="checkbox"
                  checked={unsolvedOnly}
                  onChange={(e) => setUnsolvedOnly(e.target.checked)}
                />
                Unsolved
              </label>
            </div>

            <div className="mt-3 grid grid-cols-3 gap-1.5">
              <MapperMetricPill
                label="Solved"
                value={`${scopeStats.solvedCount}/${scopeStats.attemptedCount || scopeStats.total}`}
                tone="success"
              />
              <MapperMetricPill
                label="Avg Moves"
                value={scopeStats.avg != null ? scopeStats.avg.toFixed(1) : '—'}
                tone="info"
              />
              <MapperMetricPill
                label="Range"
                value={scopeStats.min != null ? `${scopeStats.min}–${scopeStats.max}` : '—'}
              />
            </div>

            <div className="mt-3 flex items-center gap-2">
              <button
                type="button"
                disabled={batchRunning || filteredLevels.length === 0}
                onClick={() => {
                  const ids = filteredLevels.map((l) => l.id);
                  void runBatch(ids);
                }}
                className="inline-flex h-8 flex-1 items-center justify-center gap-1.5 rounded-xl border border-emerald-300/30 bg-emerald-500/15 px-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-emerald-100 transition-colors hover:bg-emerald-500/25 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {batchRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                Solve {scope === 'all' ? 'All' : scope === 'original' ? '1–100' : '101–200'}
              </button>
              {batchRunning && (
                <button
                  type="button"
                  onClick={() => {
                    batchCancelRef.current = true;
                  }}
                  className="h-8 shrink-0 rounded-xl border border-white/10 bg-white/[0.05] px-2.5 text-[11px] font-bold uppercase tracking-[0.08em] text-stone-200 hover:bg-white/[0.1]"
                >
                  Stop
                </button>
              )}
            </div>

            {batchRunning && (
              <div className="mt-2">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className="h-full rounded-full bg-emerald-400 transition-all"
                    style={{
                      width: `${batchProgress.total ? (batchProgress.done / batchProgress.total) * 100 : 0}%`,
                    }}
                  />
                </div>
                <div className="mt-1 text-[10px] text-stone-400">
                  {batchProgress.done}/{batchProgress.total} solved
                </div>
              </div>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {filteredLevels.map((lvl) => {
              const entry = solveStatus[lvl.id];
              const isSelected = lvl.id === selectedId;
              return (
                <button
                  key={lvl.id}
                  type="button"
                  onClick={() => setSelectedId(lvl.id)}
                  className={cn(
                    'mb-1.5 flex w-full items-center gap-2.5 rounded-xl border px-2 py-2 text-left transition-colors',
                    isSelected
                      ? 'border-amber-300/40 bg-amber-500/10'
                      : 'border-white/10 bg-white/[0.02] hover:bg-white/[0.05]',
                  )}
                >
                  <LevelThumbnail
                    grid={lvl.grid}
                    cavePos={lvl.cavePos}
                    playerStart={lvl.playerStart}
                    width={64}
                    height={40}
                    className="shrink-0 rounded-lg border border-white/10"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-semibold text-stone-100">
                      Level {lvl.id}
                      <span className="ml-1.5 text-[10px] font-normal text-stone-500">
                        {lvl.id < PROCEDURAL_LEVEL_START ? 'original' : 'procedural'}
                      </span>
                    </div>
                    <div
                      className={cn(
                        'mt-0.5 inline-flex items-center rounded-md border px-1.5 py-0.5 text-[10px] font-bold',
                        statusStyle[entry?.status ?? 'unattempted'],
                      )}
                    >
                      {entry?.status === 'solving' && <Loader2 className="mr-1 h-2.5 w-2.5 animate-spin" />}
                      {statusLabel(entry)}
                    </div>
                  </div>
                </button>
              );
            })}
            {filteredLevels.length === 0 && (
              <div className="px-2 py-6 text-center text-xs text-stone-500">No levels match this filter.</div>
            )}
          </div>
        </div>
      </MapperPanelFrame>

      {/* Detail / playback */}
      <MapperPanelFrame className="min-w-0 flex-1">
        {!selectedLevel ? (
          <div className="flex h-full items-center justify-center text-sm text-stone-500">
            Select a level to preview its solution.
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 px-4 py-3">
              <div>
                <div className="text-sm font-semibold text-stone-50">
                  Level {selectedLevel.id}
                  <span className="ml-2 text-xs font-normal text-stone-400">
                    {selectedLevel.id < PROCEDURAL_LEVEL_START
                      ? 'Original DOS level'
                      : 'Procedurally generated'}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] text-stone-500">
                  Board {selectedLevel.grid.length}×{selectedLevel.grid[0]?.length ?? 0}
                  {selectedLevel.theme ? ` · Theme ${selectedLevel.theme}` : ''}
                  {selectedLevel.timeLimitSeconds ? ` · ${selectedLevel.timeLimitSeconds}s timer` : ''}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div
                  className={cn(
                    'inline-flex items-center rounded-lg border px-2.5 py-1 text-[11px] font-bold',
                    statusStyle[selectedEntry?.status ?? 'unattempted'],
                  )}
                >
                  {statusLabel(selectedEntry)}
                </div>
                <button
                  type="button"
                  disabled={selectedEntry?.status === 'solving'}
                  onClick={() => void solveOne(selectedLevel.id)}
                  className="inline-flex h-8 items-center gap-1.5 rounded-xl border border-sky-300/30 bg-sky-500/15 px-3 text-[11px] font-bold uppercase tracking-[0.08em] text-sky-100 transition-colors hover:bg-sky-500/25 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {selectedEntry?.status === 'solving' && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                  {selectedEntry?.solution ? 'Re-solve' : 'Solve'}
                </button>
              </div>
            </div>

            <div className="relative min-h-0 flex-1 bg-black">
              {displayGrid ? (
                <GameTop2D
                  grid={displayGrid}
                  cavePos={selectedLevel.cavePos}
                  playerStart={selectedLevel.playerStart}
                  selectedArrow={currentFrame?.arrowTo ?? null}
                  players={
                    displayPlayerPos
                      ? [
                          {
                            id: 'solver',
                            pos: displayPlayerPos,
                            facing: 'down',
                            color: '#22c55e',
                            isLocal: true,
                          },
                        ]
                      : []
                  }
                  theme={selectedLevel.theme}
                />
              ) : null}
            </div>

            <div className="border-t border-white/10 px-4 py-3">
              {frames.length > 0 ? (
                <>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setPlaying(false);
                        setStepIndex(0);
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-stone-200 hover:bg-white/[0.1]"
                      title="Restart"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPlaying(false);
                        setStepIndex((i) => Math.max(0, i - 1));
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-stone-200 hover:bg-white/[0.1]"
                      title="Previous step"
                    >
                      <SkipBack className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlaying((p) => !p)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-amber-300/30 bg-amber-500/15 text-amber-100 hover:bg-amber-500/25"
                      title={playing ? 'Pause' : 'Play'}
                    >
                      {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPlaying(false);
                        setStepIndex((i) => Math.min(frames.length - 1, i + 1));
                      }}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-stone-200 hover:bg-white/[0.1]"
                      title="Next step"
                    >
                      <SkipForward className="h-3.5 w-3.5" />
                    </button>

                    <input
                      type="range"
                      min={0}
                      max={frames.length - 1}
                      value={stepIndex}
                      onChange={(e) => {
                        setPlaying(false);
                        setStepIndex(Number(e.target.value));
                      }}
                      className="mx-2 h-1.5 flex-1 accent-amber-400"
                    />

                    <div className="w-24 shrink-0 text-right text-[11px] text-stone-400">
                      Step {stepIndex}/{frames.length - 1}
                    </div>
                  </div>

                  <div className="mt-2 truncate text-xs font-medium text-stone-200">
                    {currentFrame?.label ?? 'Start'}
                  </div>
                </>
              ) : (
                <div className="text-xs text-stone-500">
                  {selectedEntry?.status === 'solving'
                    ? 'Solving…'
                    : selectedEntry?.status === 'unsolved' ? (
                      <>
                        No solution found — {selectedEntry.solution?.reason ?? 'unknown reason'}.
                        {selectedEntry.solution?.trace ? (() => {
                          const traceLabel = selectedEntry.solution?.reason?.includes('Node limit')
                            ? 'Inspect Search Frontier'
                            : 'View Solver Trace';
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                const html = generateSolverTraceHTML(selectedEntry.solution.trace!);
                                const blob = new Blob([html], { type: 'text/html' });
                                const url = URL.createObjectURL(blob);
                                window.open(url, '_blank');
                                setTimeout(() => URL.revokeObjectURL(url), 60_000);
                              }}
                              className="ml-2 rounded-lg border border-amber-300/30 bg-amber-500/15 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-amber-100 hover:bg-amber-500/25"
                            >
                              {traceLabel}
                            </button>
                          );
                        })() : null}
                      </>
                    ) : selectedEntry?.status === 'error'
                      ? `Solver error: ${selectedEntry.error ?? 'unknown'}.`
                      : 'Solve this level to see a step-by-step visual playthrough.'}
                </div>
              )}
            </div>
          </div>
        )}
      </MapperPanelFrame>
    </div>
  );
};

export default LevelSolutionsBrowser;
