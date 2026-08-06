import { describe, expect, it } from "vitest";
import { getAllLevels } from "@/data/levels";
import { solveGrid } from "./api";
import type { CellType } from "@/game/types";

describe("level 8 solver regression", () => {
  const level8RecordedRun = {
    levelId: 8,
    moves: 12,
    recordedAt: "2026-08-06T00:00:00.000Z",
    actions: [
      { type: "move", dx: 1, dy: 0 },
      { type: "move", dx: 0, dy: 1 },
      { type: "move", dx: 1, dy: 0 },
      { type: "select", x: 8, y: 3 },
      { type: "move", dx: 0, dy: 1 },
      { type: "select", x: 9, y: 4 },
      { type: "move", dx: -1, dy: 0 },
      { type: "move", dx: 0, dy: -1 },
      { type: "move", dx: 1, dy: 0 },
      { type: "move", dx: 0, dy: 1 },
      { type: "move", dx: 1, dy: 0 },
      { type: "move", dx: 1, dy: 0 },
      { type: "move", dx: 1, dy: 0 },
      { type: "move", dx: 1, dy: 0 },
    ],
  };

  it("solves the path toward the exit cave", async () => {
    const level = getAllLevels().find((candidate) => candidate.id === 8);
    expect(level).toBeTruthy();

    const result = await solveGrid(
      level!.grid as CellType[][],
      level!.playerStart,
      level!.cavePos,
      { maxMsPerLevel: 1500, maxNodesPerLevel: 15_000, maxDepth: 120 },
      level!.id,
    );

    expect(result.solved, result.reason).toBe(true);
  }, 35000);

  it("falls back to a valid recorded clear when bounded search fails", async () => {
    const level = getAllLevels().find((candidate) => candidate.id === 8);
    expect(level).toBeTruthy();

    window.localStorage.setItem("stone-age-recorded-run-8", JSON.stringify(level8RecordedRun));
    try {
      const result = await solveGrid(
        level!.grid as CellType[][],
        level!.playerStart,
        level!.cavePos,
        { maxMsPerLevel: 1500, maxNodesPerLevel: 0, maxDepth: 120 },
        level!.id,
      );

      expect(result.solved, result.reason).toBe(true);
      expect(result.reason).toBe("Learned from recorded run after bounded search failed");
      expect(result.actions).toEqual([
        "P:R",
        "P:D",
        "P:R",
        "A(8,3):D",
        "A(9,4):L",
        "P:U",
        "P:R",
        "P:D",
        "P:R",
        "P:R",
        "P:R",
        "P:R",
      ]);
    } finally {
      window.localStorage.removeItem("stone-age-recorded-run-8");
    }
  }, 35000);
});
