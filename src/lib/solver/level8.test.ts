import { describe, expect, it } from "vitest";
import { getAllLevels } from "@/data/levels";
import { solveGrid } from "./api";
import type { CellType } from "@/game/types";

describe("level 8 solver regression", () => {
  it("solves the path toward the exit cave", async () => {
    const level = getAllLevels().find((candidate) => candidate.id === 8);
    expect(level).toBeTruthy();

    const result = await solveGrid(
      level!.grid as CellType[][],
      level!.playerStart,
      level!.cavePos,
      { maxMsPerLevel: 700, maxNodesPerLevel: 15_000, maxDepth: 120 },
      level!.id,
    );

    expect(result.solved, result.reason).toBe(true);
  }, 35000);
});
