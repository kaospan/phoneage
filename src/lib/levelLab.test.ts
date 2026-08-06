import { describe, expect, it } from "vitest";
import { generateLevelLabCampaign, generateLevelLabCandidate, scoreLevelLabCandidate } from "./levelLab";

describe("level lab generator", () => {
  it("generates a playable candidate shape and solve result", async () => {
    const candidate = await generateLevelLabCandidate({
      seed: 12345,
      difficulty: "medium",
      mechanics: { keys: true, arrows: true, teleports: true },
    });

    expect(candidate.grid).toHaveLength(11);
    expect(candidate.grid[0]).toHaveLength(20);
    expect(candidate.grid[candidate.playerStart.y][candidate.playerStart.x]).toBe(18);
    expect(candidate.grid[candidate.cavePos.y][candidate.cavePos.x]).toBe(3);
    expect(candidate.reason).toEqual(expect.any(String));
    expect(candidate.nodesExpanded).toBeGreaterThanOrEqual(0);
  });

  it("scores unsolved candidates as zero", () => {
    expect(scoreLevelLabCandidate("hard", { keys: true, arrows: true, teleports: true }, null, 5000)).toBe(0);
  });

  it("selects solved campaign candidates for promoted level slots", async () => {
    const result = await generateLevelLabCampaign({
      seed: 98765,
      candidateCount: 24,
      levelsToPromote: 8,
    });

    expect(result.attempted).toBe(24);
    expect(result.promoted.length).toBeGreaterThan(0);
    expect(result.promoted.every((candidate) => candidate.solved)).toBe(true);
    expect(result.promoted[0]?.promotedLevelId).toBe(101);
  });
});
