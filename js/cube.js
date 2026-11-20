// Cube geometry, random placement and projection.
//
// Camera at the origin looking down +z, with screen y pointing down. Two lenses:
//   perspective (pinhole): (x, y, z) -> (cx + f*x/z, cy + f*y/z)
//   fisheye (equidistant): distance from the centre is f * theta, where theta is the angle off the
//                          view axis, so straight edges project to curves.
// Edges are returned as projected polylines so both lenses share the drawing and scoring code.

import { add, scale, dot, len, rand, randomRotation, applyMat, dist2D } from './math.js';

const LENSES = {
  perspective: {
    fov: (50 * Math.PI) / 180, // across the shorter canvas dimension
    samples: 1, // straight edges need only their endpoints
  },
  fisheye: {
    // fov is chosen by the player (see FISHEYE_FOV); the image circle spans (nearly) the shorter canvas dimension
    samples: 32, // points per edge, enough for a smooth curve
  },
};

/** The fisheye field-of-view range offered in Settings, in degrees. */
export const FISHEYE_FOV = { min: 90, max: 180, step: 5, default: 150 };

export const clampFisheyeFov = (deg) => {
  const n = Number(deg);
  if (!Number.isFinite(n)) return FISHEYE_FOV.default;
  return Math.min(FISHEYE_FOV.max, Math.max(FISHEYE_FOV.min, Math.round(n / FISHEYE_FOV.step) * FISHEYE_FOV.step));
};

const MIN_ANGLE = (15 * Math.PI) / 180; // given face must not be seen flat-on...
const MAX_ANGLE = (70 * Math.PI) / 180; // ...or nearly edge-on
const COS_MIN = Math.cos(MAX_ANGLE);
const COS_MAX = Math.cos(MIN_ANGLE);

// Vertex i has coordinates from its bits: bit0 = x, bit1 = y, bit2 = z.
const LOCAL_VERTS = Array.from({ length: 8 }, (_, i) => [
  (i & 1 ? 0.5 : -0.5),
  (i & 2 ? 0.5 : -0.5),
  (i & 4 ? 0.5 : -0.5),
]);

// Faces with vertices in cyclic order, plus outward normals.
const FACES = [
  { verts: [0, 2, 6, 4], normal: [-1, 0, 0] },
  { verts: [1, 3, 7, 5], normal: [1, 0, 0] },
  { verts: [0, 1, 5, 4], normal: [0, -1, 0] },
  { verts: [2, 3, 7, 6], normal: [0, 1, 0] },
  { verts: [0, 1, 3, 2], normal: [0, 0, -1] },
  { verts: [4, 5, 7, 6], normal: [0, 0, 1] },
];

// The 12 edges: vertex pairs differing in exactly one bit, with their two adjacent faces.
const EDGES = [];
for (let i = 0; i < 8; i++) {
  for (const bit of [1, 2, 4]) {
    if (i & bit) continue;
    const a = i, b = i | bit;
    const faces = FACES.map((f, fi) => (f.verts.includes(a) && f.verts.includes(b) ? fi : -1)).filter((fi) => fi >= 0);
    EDGES.push({ a, b, faces });
  }
}

const lerp3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

const polylineLength = (pts) => pts.slice(1).reduce((s, p, i) => s + dist2D(pts[i], p), 0);

/** Projection function and helpers for a lens on a width x height canvas. */
function makeCamera(lensName, width, height, fisheyeFovDeg) {
  const lens = LENSES[lensName];
  const minDim = Math.min(width, height);
  const cx = width / 2, cy = height / 2;
  if (lensName === 'fisheye') {
    // The image circle sits inside the canvas with a little breathing room.
    const radius = minDim / 2 - Math.max(12, minDim * 0.04);
    const halfFov = (clampFisheyeFov(fisheyeFovDeg) * Math.PI) / 360;
    const f = radius / halfFov;
    return {
      lens,
      project: ([x, y, z]) => {
        const r = Math.hypot(x, y);
        if (r === 0) return [cx, cy];
        const k = (f * Math.atan2(r, z)) / r;
        return [cx + k * x, cy + k * y];
      },
      // Off-axis and close to the lens, where it bends lines the most. Both scale with the field of
      // view, so the cube takes up a similar share of the image circle at any angle: it spans roughly
      // 45-65% of the half-angle and sits 27-80% of the way out.
      placeCenter: () => {
        const theta = rand(0.27, 0.8) * halfFov;
        const phi = Math.random() * 2 * Math.PI;
        const span = rand(0.44, 0.65) * halfFov;
        const d = 0.5 / Math.tan(span / 2);
        return [d * Math.sin(theta) * Math.cos(phi), d * Math.sin(theta) * Math.sin(phi), d * Math.cos(theta)];
      },
      circle: { c: [cx, cy], r: radius },
    };
  }
  const f = minDim / 2 / Math.tan(lens.fov / 2);
  return {
    lens,
    project: ([x, y, z]) => [cx + (f * x) / z, cy + (f * y) / z],
    placeCenter: () => {
      const z = rand(2.8, 4.5);
      return [rand(-1, 1) * 0.35 * z * (width / 2) / f, rand(-1, 1) * 0.35 * z * (height / 2) / f, z];
    },
    circle: null,
  };
}

/**
 * Generate a random round that fits inside a width x height canvas (CSS pixels).
 * options.fisheye: view the cube through a fisheye lens instead of a pinhole camera.
 * options.fisheyeFov: the fisheye's field of view in degrees (see FISHEYE_FOV).
 * Returns:
 *   verts:     8 projected [x, y] points
 *   faces:     [{ verts, front, depth }]
 *   edges:     [{ a, b, pts, visible, given }]   (12 edges; 4 given, 8 to guess; pts is the projected polyline)
 *   givenFace: index into faces
 *   edgeLength: mean on-screen length of the given face's edges (scale for scoring)
 *   fisheye:   whether the fisheye lens was used
 *   lensCircle: { c: [x, y], r } edge of the fisheye image circle, or null
 */
export function generateRound(width, height, { fisheye = false, fisheyeFov = FISHEYE_FOV.default } = {}) {
  const cam = makeCamera(fisheye ? 'fisheye' : 'perspective', width, height, fisheyeFov);
  const minDim = Math.min(width, height);
  const margin = Math.max(16, minDim * 0.06);
  const inside = ([x, y]) =>
    x >= margin && x <= width - margin && y >= margin && y <= height - margin &&
    (!cam.circle || dist2D([x, y], cam.circle.c) <= cam.circle.r - margin);

  for (let attempt = 0; attempt < 4000; attempt++) {
    const R = randomRotation();
    const center = cam.placeCenter();
    const verts3 = LOCAL_VERTS.map((v) => add(applyMat(R, v), center));
    // A pinhole needs everything in front of it. A fisheye can see up to 90 degrees sideways; the
    // image-circle check below keeps the cube inside its field of view.
    if (!fisheye && verts3.some((v) => v[2] <= 0.2)) continue;

    const n = cam.lens.samples;
    const edgePts = EDGES.map(({ a, b }) =>
      Array.from({ length: n + 1 }, (_, i) => cam.project(lerp3(verts3[a], verts3[b], i / n))));
    if (!edgePts.every((pts) => pts.every(inside))) continue;
    const verts = verts3.map(cam.project);

    const faces = FACES.map((face) => {
      const c = scale(face.verts.reduce((acc, vi) => add(acc, verts3[vi]), [0, 0, 0]), 0.25);
      const nrm = applyMat(R, face.normal);
      const toCam = scale(c, -1);
      const cos = dot(nrm, toCam) / len(toCam);
      return { verts: face.verts, front: cos > 0, cos, depth: c[2] };
    });

    // Up close, a cube can hide entirely behind one face, leaving no visible edges to guess.
    if (fisheye && faces.filter((face) => face.front).length < 2) continue;

    const candidates = faces
      .map((face, i) => ({ face, i }))
      .filter(({ face }) => face.cos > COS_MIN && face.cos < COS_MAX);
    if (candidates.length === 0) continue;

    const { i: givenFace } = candidates[Math.floor(Math.random() * candidates.length)];
    const gv = faces[givenFace].verts;
    const isGiven = ({ a, b }) => gv.includes(a) && gv.includes(b);
    const givenLengths = EDGES.map((e, i) => (isGiven(e) ? polylineLength(edgePts[i]) : null)).filter((l) => l !== null);
    const edgeLength = givenLengths.reduce((s, l) => s + l, 0) / givenLengths.length;
    if (edgeLength < minDim * 0.12) continue;

    return {
      verts,
      faces: faces.map(({ verts: fv, front, depth }) => ({ verts: fv, front, depth })),
      edges: EDGES.map((e, i) => ({
        a: e.a,
        b: e.b,
        pts: edgePts[i],
        visible: e.faces.some((fi) => faces[fi].front),
        given: isGiven(e),
      })),
      givenFace,
      edgeLength,
      fisheye,
      lensCircle: cam.circle && { c: [...cam.circle.c], r: cam.circle.r },
    };
  }
  throw new Error('Could not generate a cube for this canvas size');
}

/** A face's outline as a closed polyline, following its (possibly curved) edges. */
export function faceOutline(round, faceIndex) {
  const fv = round.faces[faceIndex].verts;
  const out = [];
  for (let k = 0; k < 4; k++) {
    const a = fv[k], b = fv[(k + 1) % 4];
    const e = round.edges.find((ed) => (ed.a === a && ed.b === b) || (ed.a === b && ed.b === a));
    const pts = e.a === a ? e.pts : [...e.pts].reverse();
    out.push(...pts.slice(0, -1));
  }
  return out;
}
