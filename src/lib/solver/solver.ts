import { getAllLevels, isPlaceholderGrid } from "@/data/levels";
import { findGoalCaves } from "@/game/caves";
import type { CellType, KeyInventory, Position } from "@/game/types";
import { createEmptyTrace } from "./trace/trace";
import { generateSuccessors } from "./actions";
import type { Action, SolveState } from "./state";
import { cloneGrid, cloneInventory, cloneBreakables } from "./utils";
import { manhattanToGoal } from "./heuristics";
import { stateKey } from "./state";
import type { SolveOptions, LevelSolution } from "./types";
import type { SolverTrace, TraceActionRecord, TraceNode } from "./trace/trace";

function fmtAction(a: Action): string {
  if (a.t === "P") return `P:${a.d}`;
  if (a.t === "T") return `T`;
  return `A(${a.x},${a.y}):${a.d}`;
}

export async function solveLevel(
  levelId: number,
  start: SolveState,
  goalCaves: Position[],
  opts: Required<Pick<SolveOptions, "maxMsPerLevel" | "maxNodesPerLevel" | "maxDepth">> & Pick<SolveOptions, "onProgress" | "trace">
): Promise<LevelSolution> {
  const t0 = performance.now();
  const startKey = stateKey(start);
  const goalKeys = new Set(goalCaves.map((goal) => `${goal.x},${goal.y}`));

  const trace = opts.trace ?? createEmptyTrace();
  if (opts.trace) {
    trace.levelId = levelId;
    trace.startStateId = 0;
    trace.nodes.clear();
    trace.generationOrder = [];
    trace.expansionOrder = [];
    trace.furthestStateId = 0;
    trace.lastExpandedStateId = null;
    trace.startGrid = cloneGrid(start.grid);
    trace.startPlayerPos = { ...start.playerPos };
    trace.startInventory = cloneInventory(start.inventory);
    trace.goalCaves = goalCaves.map((g) => ({ ...g }));
    trace.options = {
      maxMsPerLevel: opts.maxMsPerLevel,
      maxNodesPerLevel: opts.maxNodesPerLevel,
      maxDepth: opts.maxDepth,
    };
    trace.endReason = "exhausted";
    trace.nodesExpanded = 0;
    trace.statesGenerated = 0;
    trace.ms = 0;
    trace.collisions = new Map();
    trace.nodes.set(0, {
      id: 0,
      parentId: null,
      action: "Start",
      stateKey: startKey,
      playerPos: { ...start.playerPos },
      inventory: cloneInventory(start.inventory),
      grid: cloneGrid(start.grid),
      baseGrid: cloneGrid(start.baseGrid),
      breakableRockStates: cloneBreakables(start.breakableRockStates),
      depth: 0,
      expansionOrder: undefined,
      attemptedActions: [],
      distanceToGoal: manhattanToGoal(start.playerPos, goalCaves),
    });
    trace.generationOrder.push(0);
  }

  const prev = new Map<string, { p: string; a: Action }>();
  const depth = new Map<string, number>();
  const q: Array<{ k: string; s: SolveState }> = [{ k: startKey, s: start }];
  depth.set(startKey, 0);

  let nodesExpanded = 0;
  let idx = 0;
  let nextId = opts.trace ? 1 : 0;
  const stateIdByKey = new Map<string, number>();
  if (opts.trace) stateIdByKey.set(startKey, 0);

  const isGoal = (s: SolveState) => goalKeys.has(`${s.playerPos.x},${s.playerPos.y}`);

  if (isGoal(start)) {
    if (opts.trace) trace.endReason = "solved";
    return {
      levelId,
      solved: true,
      moves: 0,
      actions: [],
      nodesExpanded: 0,
      ms: 0,
      trace: opts.trace,
    };
  }

  while (idx < q.length) {
    const now = performance.now();
    if (now - t0 > opts.maxMsPerLevel) {
      if (opts.trace) trace.endReason = "timeout";
      return {
        levelId,
        solved: false,
        moves: null,
        actions: [],
        reason: `Timed out after ${Math.round(now - t0)}ms (expanded ${nodesExpanded} nodes)`,
        nodesExpanded,
        ms: Math.round(now - t0),
        trace: opts.trace,
      };
    }
    if (nodesExpanded >= opts.maxNodesPerLevel) {
      if (opts.trace) trace.endReason = "node_limit";
      return {
        levelId,
        solved: false,
        moves: null,
        actions: [],
        reason: `Node limit reached (${opts.maxNodesPerLevel})`,
        nodesExpanded,
        ms: Math.round(now - t0),
        trace: opts.trace,
      };
    }

    const { k, s } = q[idx++];
    const d0 = depth.get(k) ?? 0;
    if (d0 >= opts.maxDepth) {
      if (opts.trace) trace.endReason = "depth_limit";
      continue;
    }

    nodesExpanded += 1;
    const expansionOrder = nodesExpanded;

    let currentNodeId: number | null = null;
    if (opts.trace) {
      trace.nodesExpanded = nodesExpanded;
      const existingId = stateIdByKey.get(k);
      if (existingId === undefined) {
        trace.lastExpandedStateId = null;
        continue;
      }
      currentNodeId = existingId;
      trace.lastExpandedStateId = currentNodeId;
      const node = trace.nodes.get(currentNodeId);
      if (node) {
        node.expansionOrder = expansionOrder;
        if (trace.furthestStateId === null || node.depth > (trace.nodes.get(trace.furthestStateId)?.depth ?? -1)) {
          trace.furthestStateId = currentNodeId;
        }
      }
      trace.expansionOrder.push(currentNodeId);
    }

    if (opts.onProgress && nodesExpanded % 2000 === 0) {
      opts.onProgress(`Level ${levelId}: expanded ${nodesExpanded} (queue ${q.length})`);
    }

    if (nodesExpanded % 1500 === 0) {
      await new Promise((r) => setTimeout(r, 0));
    }

    const attemptedActions: TraceActionRecord[] = [];
    let acceptedMoves = 0;

    for (const succ of generateSuccessors(s)) {
      const nk = stateKey(succ.state);
      if (depth.has(nk)) {
        attemptedActions.push({
          description: succ.description,
          actionString: succ.actionString,
          accepted: false,
          rejectionReason: "Already visited",
        });
        if (opts.trace) {
          const existingId = stateIdByKey.get(nk);
          if (existingId !== undefined) {
            trace.collisions.set(existingId, (trace.collisions.get(existingId) ?? 0) + 1);
          }
        }
        continue;
      }

      const nd = d0 + 1;
      depth.set(nk, nd);
      prev.set(nk, { p: k, a: succ.action });

      if (opts.trace) {
        opts.trace.statesGenerated += 1;
        const childNodeId = nextId;
        nextId += 1;
        stateIdByKey.set(nk, childNodeId);
        trace.generationOrder.push(childNodeId);
        trace.nodes.set(childNodeId, {
          id: childNodeId,
          parentId: currentNodeId ?? null,
          action: succ.actionString,
          stateKey: nk,
          playerPos: { ...succ.state.playerPos },
          inventory: cloneInventory(succ.state.inventory),
          grid: cloneGrid(succ.state.grid),
          baseGrid: cloneGrid(succ.state.baseGrid),
          breakableRockStates: cloneBreakables(succ.state.breakableRockStates),
          depth: nd,
          expansionOrder: undefined,
          attemptedActions: [],
          distanceToGoal: manhattanToGoal(succ.state.playerPos, goalCaves),
        });
        const parentNode = currentNodeId !== null ? trace.nodes.get(currentNodeId) : undefined;
        if (parentNode) {
          parentNode.attemptedActions = attemptedActions;
          parentNode.attemptedActions.push({
            description: succ.description,
            actionString: succ.actionString,
            accepted: true,
            resultStateId: childNodeId,
          });
        }
      }

      if (isGoal(succ.state)) {
        const actions: string[] = [];
        let cur = nk;
        while (cur !== startKey) {
          const link = prev.get(cur);
          if (!link) break;
          actions.push(fmtAction(link.a));
          cur = link.p;
        }
        actions.reverse();
        if (opts.trace) trace.endReason = "solved";
        return {
          levelId,
          solved: true,
          moves: actions.length,
          actions,
          nodesExpanded,
          ms: Math.round(performance.now() - t0),
          trace: opts.trace,
        };
      }
      q.push({ k: nk, s: succ.state });
      acceptedMoves += 1;
    }

    if (opts.trace && acceptedMoves === 0 && currentNodeId !== null) {
      const node = trace.nodes.get(currentNodeId);
      if (node && !node.attemptedActions.some((a) => a.accepted)) {
        // Dead end recorded implicitly by having no accepted children
      }
    }
  }

  if (opts.trace) trace.endReason = "exhausted";

  return {
    levelId,
    solved: false,
    moves: null,
    actions: [],
    reason: "No solution found (search exhausted)",
    nodesExpanded,
    ms: Math.round(performance.now() - t0),
    trace: opts.trace,
  };
}
