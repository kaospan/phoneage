import type { Position } from "@/game/types";

export function manhattanToGoal(pos: Position, goals: Position[]): number {
  let best = Infinity;
  for (const g of goals) {
    const d = Math.abs(pos.x - g.x) + Math.abs(pos.y - g.y);
    if (d < best) best = d;
  }
  return best;
}
