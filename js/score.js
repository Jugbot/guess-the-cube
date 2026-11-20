// Scores a freehand sketch against the true cube edges using a symmetric chamfer distance.

import { distPointSeg, dist2D } from './math.js';

const SPACING = 3; // px between samples
// The score reaches 0 when the mean error equals the error of a sketch that adds nothing to the
// given face ("null guess"), but never less than this fraction of the given face's edge length.
// This keeps scores comparable between strongly foreshortened cubes and deep ones.
export const MIN_ZERO_SCORE_FRACTION = 0.15;
// Drawn points this close (as a fraction of edge length) to a given-face edge count as retracing it.
const RETRACE_FRACTION = 0.04;

/** Resample a polyline at roughly even spacing (keeps first and last points). */
export function resample(pts, spacing = SPACING) {
  if (pts.length <= 1) return pts.slice();
  const out = [pts[0]];
  let acc = 0; // distance travelled since the last emitted point
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    const segLen = dist2D(a, b);
    if (segLen === 0) continue;
    let t = spacing - acc;
    while (t <= segLen) {
      const u = t / segLen;
      out.push([a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u]);
      t += spacing;
    }
    acc = segLen - (t - spacing);
  }
  const last = pts[pts.length - 1];
  if (dist2D(out[out.length - 1], last) > 0) out.push(last);
  return out;
}

const mean = (xs) => xs.reduce((s, x) => s + x, 0) / xs.length;

/**
 * strokes: array of polylines ([[x, y], ...]) in the same coordinates as round.verts.
 * options.scoreHidden: when false, only edges visible from the camera must be drawn. Lines drawn
 *   on hidden edges are still allowed and only cost points by how far off they are.
 * Returns { score (0-100), precision, recall } where precision/recall are mean pixel errors.
 */
export function scoreSketch(strokes, round, { scoreHidden = true } = {}) {
  const drawn = strokes.filter((s) => s.length > 0).map((s) => resample(s));
  if (drawn.length === 0) return { score: 0, precision: Infinity, recall: Infinity };

  // Each edge is a projected polyline: two points for a straight edge, many for a fisheye curve.
  const segsOf = (e) => e.pts.slice(1).map((p, i) => [e.pts[i], p]);
  const givenSegs = round.edges.filter((e) => e.given).flatMap(segsOf);
  const otherEdges = round.edges.filter((e) => !e.given);
  let targetEdges = scoreHidden ? otherEdges : otherEdges.filter((e) => e.visible);
  if (targetEdges.length === 0) targetEdges = otherEdges;
  const otherSegs = otherEdges.flatMap(segsOf);
  const minDist = (p, segs) => {
    let m = Infinity;
    for (const [a, b] of segs) {
      const d = distPointSeg(p, a, b);
      if (d < m) m = d;
    }
    return m;
  };

  // Precision: how far each drawn point is from the nearest cube edge. Points that just retrace
  // the given face are ignored, so they neither help nor hurt.
  const retraceTol = Math.max(4, round.edgeLength * RETRACE_FRACTION);
  const precisionDists = [];
  for (const p of drawn.flat()) {
    const dOther = minDist(p, otherSegs);
    const dGiven = minDist(p, givenSegs);
    if (dGiven < retraceTol && dGiven <= dOther) continue;
    precisionDists.push(Math.min(dOther, dGiven));
  }

  // Recall: how far each point on the edges to be guessed is from the sketch.
  const strokeSegs = drawn.flatMap((s) => (s.length === 1 ? [[s[0], s[0]]] : s.slice(1).map((p, i) => [s[i], p])));
  const targetSamples = targetEdges.flatMap((e) => resample(e.pts));
  const recall = mean(
    targetSamples.map((p) => {
      let m = Infinity;
      for (const [a, b] of strokeSegs) {
        const d = distPointSeg(p, a, b);
        if (d < m) m = d;
      }
      return m;
    })
  );

  // If everything drawn was a retrace of the given face, score on recall alone.
  const precision = precisionDists.length ? mean(precisionDists) : recall;
  const d = (precision + recall) / 2;
  const nullError = mean(targetSamples.map((p) => minDist(p, givenSegs)));
  const zeroAt = Math.max(nullError, MIN_ZERO_SCORE_FRACTION * round.edgeLength);
  const score = Math.round(100 * Math.max(0, Math.min(1, 1 - d / zeroAt)));
  return { score, precision, recall };
}
