export type HourglassIconOptions = {
  /**
   * Triangle fill for the upper half.
   * Default chosen to match Tailwind amber-400.
   */
  topFill?: string;
  /**
   * Triangle fill for the lower half.
   * Default chosen to match Tailwind amber-500.
   */
  bottomFill?: string;
  /**
   * Outline stroke for both triangles.
   */
  stroke?: string;
  /**
   * Soft glow behind the icon (set to empty/transparent to disable).
   */
  glow?: string;
};

function getHourglassDefaults(opts?: HourglassIconOptions): Required<HourglassIconOptions> {
  return {
    topFill: opts?.topFill ?? "rgba(251,191,36,0.98)",
    bottomFill: opts?.bottomFill ?? "rgba(245,158,11,0.98)",
    stroke: opts?.stroke ?? "rgba(120,53,15,0.85)",
    glow: opts?.glow ?? "rgba(251,191,36,0.22)",
  };
}

/**
 * Draw a single animation frame for a top-down hourglass icon.
 * - `progress` is 0..1 where 0 = top full, 1 = bottom full.
 * - `streamPhase` is 0..1 used to animate a small falling-sand stream.
 */
export function drawHourglassTopDownFrame(
  ctx: CanvasRenderingContext2D,
  size: number,
  progress: number,
  streamPhase: number,
  opts?: HourglassIconOptions
) {
  const { topFill, bottomFill, stroke, glow } = getHourglassDefaults(opts);

  const p = Math.max(0, Math.min(1, progress));
  const phase = ((streamPhase % 1) + 1) % 1;

  ctx.clearRect(0, 0, size, size);

  const cx = size / 2;
  const cy = size / 2;
  const r = size * 0.46;

  // Subtle glow so the icon reads on varied backgrounds.
  if (glow && glow !== "transparent" && glow !== "rgba(0,0,0,0)" && glow !== "rgba(0,0,0,0.0)") {
    const grad = ctx.createRadialGradient(cx, cy, r * 0.12, cx, cy, r);
    grad.addColorStop(0, glow);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }

  const w = size * 0.25;
  const h = size * 0.30;
  const pad = size * 0.06;

  const topBaseY = cy - (h + pad);
  const botBaseY = cy + (h + pad);

  // Chamber outlines (glass).
  ctx.strokeStyle = stroke;
  ctx.lineWidth = Math.max(1, Math.round(size * 0.04));
  ctx.lineJoin = "round";
  ctx.globalAlpha = 1;
  // Top chamber.
  ctx.beginPath();
  ctx.moveTo(cx - w, topBaseY);
  ctx.lineTo(cx + w, topBaseY);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.stroke();
  // Bottom chamber.
  ctx.beginPath();
  ctx.moveTo(cx - w, botBaseY);
  ctx.lineTo(cx + w, botBaseY);
  ctx.lineTo(cx, cy);
  ctx.closePath();
  ctx.stroke();

  // Top sand (shrinks away from the tip as it drains).
  const topFull = 1 - p;
  if (topFull > 0.04) {
    const tipY = cy - (1 - topFull) * h;
    ctx.fillStyle = topFill;
    ctx.beginPath();
    ctx.moveTo(cx - w, topBaseY);
    ctx.lineTo(cx + w, topBaseY);
    ctx.lineTo(cx, tipY);
    ctx.closePath();
    ctx.fill();
  }

  // Bottom sand (grows down from the tip as it fills).
  const botFull = p;
  if (botFull > 0.04) {
    const fillBaseY = cy + pad + botFull * h;
    ctx.fillStyle = bottomFill;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx - w, fillBaseY);
    ctx.lineTo(cx + w, fillBaseY);
    ctx.closePath();
    ctx.fill();
  }

  // Falling sand stream (only while sand is actively moving).
  if (p < 0.985) {
    const streamY0 = cy - pad * 0.35;
    const streamY1 = cy + pad * 0.55;
    const dots = 3;
    for (let i = 0; i < dots; i += 1) {
      const t = (phase + i / dots) % 1;
      const y = streamY0 + (streamY1 - streamY0) * t;
      const a = 0.55 * (1 - Math.abs(0.5 - t) * 1.8);
      ctx.fillStyle = `rgba(255,247,210,${Math.max(0.12, a)})`;
      ctx.beginPath();
      ctx.arc(cx, y, Math.max(1.2, size * 0.028), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Small highlight pin at the meeting point.
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(1.2, size * 0.03), 0, Math.PI * 2);
  ctx.fill();
}

export function drawHourglassTopDown(
  ctx: CanvasRenderingContext2D,
  size: number,
  opts?: HourglassIconOptions
) {
  // Static icon defaults to mid-flow so it reads as an hourglass (not a filled diamond).
  drawHourglassTopDownFrame(ctx, size, 0.5, 0.25, opts);
}

export function createHourglassIconCanvas(size: number, opts?: HourglassIconOptions): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  drawHourglassTopDown(ctx, size, opts);
  return canvas;
}

export function createHourglassIconDataUrl(size: number, opts?: HourglassIconOptions): string | null {
  const canvas = createHourglassIconCanvas(size, opts);
  return canvas ? canvas.toDataURL("image/png") : null;
}

export type ClockIconOptions = {
  rim?: string;
  rimDark?: string;
  face?: string;
  tick?: string;
  hand?: string;
  outline?: string;
  glow?: string;
};

function getClockDefaults(opts?: ClockIconOptions): Required<ClockIconOptions> {
  return {
    rim: opts?.rim ?? "rgba(239,68,68,0.98)", // red-500
    rimDark: opts?.rimDark ?? "rgba(153,27,27,0.98)", // red-800
    face: opts?.face ?? "rgba(248,250,252,0.98)", // slate-50
    tick: opts?.tick ?? "rgba(100,116,139,0.9)", // slate-500
    hand: opts?.hand ?? "rgba(2,6,23,0.92)", // slate-950
    outline: opts?.outline ?? "rgba(15,23,42,0.55)", // slate-900
    glow: opts?.glow ?? "rgba(239,68,68,0.18)",
  };
}

/**
 * Draw a single top-down alarm clock frame (Bonus Time icon).
 * Intentionally simple/pixel-friendly: red rim, white face, tick marks and hands.
 */
export function drawClockTopDownFrame(
  ctx: CanvasRenderingContext2D,
  size: number,
  opts?: ClockIconOptions
) {
  const { rim, rimDark, face, tick, hand, outline, glow } = getClockDefaults(opts);

  ctx.clearRect(0, 0, size, size);

  // Put the clock slightly lower so the bells fit inside the square.
  const cx = size / 2;
  const cy = size * 0.56;
  const r = size * 0.38;

  // Glow behind the icon so it reads over busy backgrounds.
  if (glow && glow !== "transparent" && glow !== "rgba(0,0,0,0)" && glow !== "rgba(0,0,0,0.0)") {
    const grad = ctx.createRadialGradient(cx, cy, r * 0.08, cx, cy, r * 1.25);
    grad.addColorStop(0, glow);
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, r * 1.15, 0, Math.PI * 2);
    ctx.fill();
  }

  // Bells (two small domes).
  const bellY = cy - r * 1.08;
  const bellX = r * 0.62;
  const bellR = r * 0.36;
  ctx.fillStyle = rim;
  for (const s of [-1, 1] as const) {
    ctx.beginPath();
    ctx.ellipse(cx + s * bellX, bellY, bellR * 0.9, bellR * 0.75, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = outline;
    ctx.lineWidth = Math.max(1, size * 0.03);
    ctx.stroke();
    // Tiny highlight.
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.beginPath();
    ctx.ellipse(cx + s * bellX - bellR * 0.18, bellY - bellR * 0.12, bellR * 0.25, bellR * 0.18, -0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = rim;
  }

  // Feet.
  const footY = cy + r * 0.92;
  const footX = r * 0.58;
  ctx.fillStyle = "rgba(30,41,59,0.85)"; // slate-800
  for (const s of [-1, 1] as const) {
    ctx.beginPath();
    ctx.moveTo(cx + s * (footX - r * 0.12), footY);
    ctx.lineTo(cx + s * (footX + r * 0.12), footY);
    ctx.lineTo(cx + s * footX, footY + r * 0.22);
    ctx.closePath();
    ctx.fill();
  }

  // Rim.
  const rimGrad = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
  rimGrad.addColorStop(0, rim);
  rimGrad.addColorStop(1, rimDark);
  ctx.fillStyle = rimGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = outline;
  ctx.lineWidth = Math.max(1, size * 0.045);
  ctx.stroke();

  // Face.
  const faceR = r * 0.78;
  const faceGrad = ctx.createRadialGradient(cx - faceR * 0.35, cy - faceR * 0.35, faceR * 0.1, cx, cy, faceR);
  faceGrad.addColorStop(0, "rgba(255,255,255,0.98)");
  faceGrad.addColorStop(1, face);
  ctx.fillStyle = faceGrad;
  ctx.beginPath();
  ctx.arc(cx, cy, faceR, 0, Math.PI * 2);
  ctx.fill();

  // Tick marks.
  ctx.save();
  ctx.strokeStyle = tick;
  ctx.lineCap = "round";
  for (let i = 0; i < 12; i += 1) {
    const ang = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const major = i % 3 === 0;
    const len = major ? faceR * 0.2 : faceR * 0.12;
    ctx.lineWidth = major ? Math.max(1, size * 0.035) : Math.max(1, size * 0.02);
    const x0 = cx + Math.cos(ang) * (faceR - len);
    const y0 = cy + Math.sin(ang) * (faceR - len);
    const x1 = cx + Math.cos(ang) * faceR;
    const y1 = cy + Math.sin(ang) * faceR;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.stroke();
  }
  ctx.restore();

  // Hands: match the reference image (minute up, hour left).
  ctx.save();
  ctx.strokeStyle = hand;
  ctx.lineCap = "round";
  // Minute hand (up).
  ctx.lineWidth = Math.max(1, size * 0.045);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx, cy - faceR * 0.58);
  ctx.stroke();
  // Hour hand (left).
  ctx.lineWidth = Math.max(1, size * 0.055);
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx - faceR * 0.42, cy);
  ctx.stroke();
  ctx.restore();

  // Center knob.
  ctx.fillStyle = hand;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.max(1.2, size * 0.04), 0, Math.PI * 2);
  ctx.fill();

  // Glass highlight arc.
  ctx.strokeStyle = "rgba(255,255,255,0.22)";
  ctx.lineWidth = Math.max(1, size * 0.03);
  ctx.beginPath();
  ctx.arc(cx, cy, faceR * 0.92, -Math.PI * 0.15, Math.PI * 0.4);
  ctx.stroke();
}

export function drawClockTopDown(ctx: CanvasRenderingContext2D, size: number, opts?: ClockIconOptions) {
  drawClockTopDownFrame(ctx, size, opts);
}

export function createClockIconCanvas(size: number, opts?: ClockIconOptions): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  drawClockTopDown(ctx, size, opts);
  return canvas;
}

export function createClockIconDataUrl(size: number, opts?: ClockIconOptions): string | null {
  const canvas = createClockIconCanvas(size, opts);
  return canvas ? canvas.toDataURL("image/png") : null;
}
