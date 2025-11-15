# Stone Age Puzzle Game

An arrow-and-terrain traversal puzzle inspired by retro DOS logic games. You guide a green dino across hazardous terrain to reach the cave. Arrows glide over dangerous cells; you decide when to walk off them and when to ride.

## Features

* Arrow blocks with directional, bidirectional, and omnidirectional glide logic
* Distinct terrain types (floor, cave, void, water, lava/fire, stone, breakable rock)
* Remote arrow selection and movement
* Breakable rocks that crumble after you step off
* Modular, DRY game logic (model/controller separated from view) using React + TypeScript

## Legend (Cell Types)

| Code | Type                | Walkable | Arrow Glide Over | Notes |
|------|---------------------|----------|------------------|-------|
| 0    | Floor               | Yes      | Stops before     | Safe ground |
| 1    | Fire/Wall           | No       | Remote arrow can glide; player-glide stops before | Hazard |
| 2    | Stone (solid)       | No       | Stops before     | Impassable |
| 3    | Cave Entrance       | Yes      | Stops before     | Level goal |
| 4    | Water               | No       | Player & remote glide | Hazard |
| 5    | Void / Air          | No       | Player & remote glide | Unwalkable gap |
| 6    | Breakable Rock      | First time only | Stops before glide; becomes void after leaving | Crumbles |
| 7    | Arrow Up            | Treat as floor unless gliding | — | Glide only up |
| 8    | Arrow Right         | Treat as floor unless gliding | — | Glide only right |
| 9    | Arrow Down          | Treat as floor unless gliding | — | Glide only down |
| 10   | Arrow Left          | Treat as floor unless gliding | — | Glide only left |
| 11   | Arrow Up/Down       | Treat as floor unless gliding | — | Glide vertically |
| 12   | Arrow Left/Right    | Treat as floor unless gliding | — | Glide horizontally |
| 13   | Arrow Omnidirectional | Treat as floor unless gliding | — | Glide any cardinal direction |

## Core Mechanics

1. Standing on an arrow: You may walk to adjacent floor, cave, breakable rock (first time), or other arrow blocks freely. Movement in an allowed arrow direction initiates a glide.
2. Gliding: Arrow + player traverse a straight path over glidable hazard cells (water, void). Glide stops BEFORE an obstacle (stone, floor, cave, breakable rock, fire/wall, other arrow, map edge).
3. Remote arrow movement: Select an arrow (not occupied) and glide it over hazards leaving void behind. Stops under same rules.
4. Breakable rocks: First time stepping onto a breakable rock marks it. When you step off, it crumbles (replaced with void). You cannot step onto it again.
5. Void / water / fire: Never directly walkable. Only arrows glide across.

## Architecture (MVC-ish)

* Model: Pure state structures in `src/game/types.ts` plus level data in `src/data/levels.ts`.
* Controller Logic: Movement and glide computations in `src/game/movement.ts` & `src/game/glide.ts`; arrow helpers in `src/game/arrows.ts`.
* View: React components (`PuzzleGame`, `Game3D`, UI controls) render and animate state.

All movement functions return outcome objects (e.g. `attemptPlayerMove`, `attemptRemoteArrowMove`) so the view decides how to apply side effects and animations.

## File Structure (Key)

```
src/
	components/
		PuzzleGame.tsx       # Orchestrates gameplay, delegates logic to controllers
		Game3D.tsx           # 3D rendering layer
		TouchControls.tsx    # Mobile input
		Thumbstick.tsx       # Virtual joystick
	game/
		types.ts             # Core game type definitions
		arrows.ts            # Arrow identification & direction mapping
		glide.ts             # Pure glide path calculations
		movement.ts          # High-level move attempt logic (player & remote)
	data/
		levels.ts            # Level definitions
	hooks/                 # Reusable UI/game hooks
	lib/                   # Utilities (formatting, helpers)
```

## Development

Install deps:
```bash
npm install
```

Run dev server:
```bash
npm run dev
```

Typecheck only:
```bash
npx tsc --noEmit
```

Build production bundle:
```bash
npm run build
```

Preview production build:
```bash
npm run preview
```

## Movement & Glide Rules (Detailed)

### Player Standing on Arrow
* Walk priority overrides glide: if destination is floor, cave, breakable rock (first time), or another arrow, move without gliding.
* If direction matches arrow and next cell is glidable hazard (water/void), begin glide.
* Arrow leaves void at its starting cell while moving; previous cells restore underlying terrain from `baseGrid`.

### Remote Arrow
* Can glide over water, void, fire.
* Stops before any blocking terrain or other arrow.
* Leaves void behind at initial origin.

### Breakable Rock Lifecycle
1. Step on: mark state.
2. Step off: replaced with void (in normal movement path case), toast emitted.
3. Cannot re-enter after crumble attempt.

## Testing Checklist

Use this when adding new mechanics:
* Can step off arrow in arrow direction onto floor/cave.
* Glide stops one cell before obstacle.
* Remote glide leaves void at origin.
* Breakable rock crumbles only after leaving.
* Cannot select occupied arrow.
* Void/water/fire never walkable.

## Extensibility Ideas

* Pathfinding hint system.
* Undo / replay stack.
* Level editor with drag-and-drop tiles.
* Additional hazards (ice slides, teleport pads).
* Accessibility: keyboard-only level navigation and high contrast mode.

## Contributing

1. Fork & branch: `git checkout -b feature/my-change`.
2. Keep logic pure in `src/game/*` where possible.
3. Add tests (future: Jest or Vitest) for new movement rules.
4. Submit PR with clear description & before/after behavior.

## License

Currently proprietary – adjust this section if you choose an open-source license (MIT, Apache-2.0, etc.).

---
Happy puzzling! 🦕


