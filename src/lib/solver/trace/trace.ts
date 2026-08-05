import type { CellType, KeyInventory, Position } from "@/game/types";

export interface TraceActionRecord {
  description: string;
  actionString: string;
  accepted: boolean;
  rejectionReason?: string;
  resultStateId?: number;
}

export interface TraceNode {
  id: number;
  parentId: number | null;
  action: string;
  stateKey: string;
  playerPos: Position;
  inventory: KeyInventory;
  grid: CellType[][];
  baseGrid: CellType[][];
  breakableRockStates: Map<string, boolean>;
  depth: number;
  expansionOrder: number | undefined;
  attemptedActions: TraceActionRecord[];
  distanceToGoal: number;
}

export interface SolverTrace {
  levelId: number;
  startStateId: number;
  nodes: Map<number, TraceNode>;
  generationOrder: number[];
  expansionOrder: number[];
  furthestStateId: number | null;
  lastExpandedStateId: number | null;
  startGrid: CellType[][];
  startPlayerPos: Position;
  startInventory: KeyInventory;
  goalCaves: Position[];
  options: {
    maxMsPerLevel: number;
    maxNodesPerLevel: number;
    maxDepth: number;
  };
  endReason: "solved" | "timeout" | "node_limit" | "depth_limit" | "exhausted";
  nodesExpanded: number;
  statesGenerated: number;
  ms: number;
  collisions: Map<number, number>;
}

export function createEmptyTrace(): SolverTrace {
  return {
    levelId: 0,
    startStateId: 0,
    nodes: new Map(),
    generationOrder: [],
    expansionOrder: [],
    furthestStateId: null,
    lastExpandedStateId: null,
    startGrid: [],
    startPlayerPos: { x: 0, y: 0 },
    startInventory: { red: 0, green: 0 },
    goalCaves: [],
    options: { maxMsPerLevel: 0, maxNodesPerLevel: 0, maxDepth: 0 },
    endReason: "exhausted",
    nodesExpanded: 0,
    statesGenerated: 0,
    ms: 0,
    collisions: new Map(),
  };
}
