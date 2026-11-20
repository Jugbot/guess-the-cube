// Freehand stroke capture and canvas rendering.

const COLORS = {
  bg: '#14161b',
  givenFill: 'rgba(90, 160, 255, 0.18)',
  givenStroke: '#5aa0ff',
  sketch: '#f5c542',
  truth: '#4ade80',
  faceFill: 'rgba(255, 255, 255, 0.045)',
};

/** Captures pointer strokes (mouse, touch, pen) on a canvas, in CSS pixels. */
export class Sketch {
  constructor(canvas, onChange) {
    this.canvas = canvas;
    this.onChange = onChange;
    this.strokes = [];
    this.enabled = true;
    this.pointerId = null;
    this.current = null;

    canvas.addEventListener('pointerdown', (e) => this.down(e));
    canvas.addEventListener('pointermove', (e) => this.move(e));
    canvas.addEventListener('pointerup', (e) => this.up(e));
    canvas.addEventListener('pointercancel', (e) => this.up(e));
  }

  point(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  down(e) {
    if (!this.enabled || this.pointerId !== null) return;
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    try {
      this.canvas.setPointerCapture(e.pointerId);
    } catch {
      /* capture is a nicety; drawing still works without it */
    }
    this.pointerId = e.pointerId;
    this.current = [this.point(e)];
    this.strokes.push(this.current);
    this.onChange();
  }

  move(e) {
    if (e.pointerId !== this.pointerId) return;
    e.preventDefault();
    const events = (e.getCoalescedEvents && e.getCoalescedEvents()) || [];
    for (const ev of events.length ? events : [e]) {
      const p = this.point(ev);
      const last = this.current[this.current.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) >= 0.75) this.current.push(p);
    }
    this.onChange();
  }

  up(e) {
    if (e.pointerId !== this.pointerId) return;
    this.pointerId = null;
    this.current = null;
    this.onChange();
  }

  undo() {
    if (this.pointerId !== null) return;
    this.strokes.pop();
    this.onChange();
  }

  clear() {
    this.pointerId = null;
    this.current = null;
    this.strokes = [];
    this.onChange();
  }
}

function polygon(ctx, pts) {
  ctx.beginPath();
  pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
  ctx.closePath();
}

function line(ctx, a, b) {
  ctx.beginPath();
  ctx.moveTo(a[0], a[1]);
  ctx.lineTo(b[0], b[1]);
  ctx.stroke();
}

function drawStrokes(ctx, strokes) {
  ctx.strokeStyle = COLORS.sketch;
  ctx.fillStyle = COLORS.sketch;
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const s of strokes) {
    if (s.length === 1) {
      ctx.beginPath();
      ctx.arc(s[0][0], s[0][1], 1.5, 0, Math.PI * 2);
      ctx.fill();
      continue;
    }
    ctx.beginPath();
    s.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.stroke();
  }
}

/** Render the current state. phase is 'drawing' or 'revealed'. */
export function render(ctx, width, height, round, strokes, phase) {
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, width, height);
  if (!round) return;

  const v = round.verts;
  const given = round.faces[round.givenFace].verts.map((i) => v[i]);

  if (phase === 'revealed') {
    // Faint fills on the front-facing faces (they never overlap for a convex solid).
    ctx.fillStyle = COLORS.faceFill;
    round.faces
      .filter((f) => f.front)
      .forEach((f) => {
        polygon(ctx, f.verts.map((i) => v[i]));
        ctx.fill();
      });
  }

  // The given face.
  polygon(ctx, given);
  ctx.fillStyle = COLORS.givenFill;
  ctx.fill();

  if (phase === 'revealed') {
    ctx.strokeStyle = COLORS.truth;
    ctx.lineCap = 'round';
    for (const e of round.edges) {
      if (e.given) continue;
      ctx.lineWidth = e.visible ? 2.5 : 1.75;
      ctx.setLineDash(e.visible ? [] : [7, 6]);
      ctx.globalAlpha = e.visible ? 1 : 0.85;
      line(ctx, v[e.a], v[e.b]);
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
  }

  ctx.strokeStyle = COLORS.givenStroke;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  polygon(ctx, given);
  ctx.stroke();
  ctx.fillStyle = COLORS.givenStroke;
  for (const [x, y] of given) {
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  drawStrokes(ctx, strokes);
}
