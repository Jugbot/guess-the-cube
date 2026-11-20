// Cube geometry, random placement and perspective projection.
//
// Camera: pinhole at the origin looking down +z, with screen y pointing down.
// A point (x, y, z) projects to (cx + f*x/z, cy + f*y/z).

import { add, scale, dot, len, rand, randomRotation, applyMat, dist2D } from './math.js';

const FOV = (50 * Math.PI) / 180; // field of view across the shorter canvas dimension
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

/**
 * Generate a random round that fits inside a width x height canvas (CSS pixels).
 * Returns:
 *   verts:     8 projected [x, y] points
 *   faces:     [{ verts, front, depth }]
 *   edges:     [{ a, b, visible, given }]   (12 edges; 4 given, 8 to guess)
 *   givenFace: index into faces
 *   edgeLength: mean on-screen length of the given face's edges (scale for scoring)
 */
export function generateRound(width, height) {
  const minDim = Math.min(width, height);
  const f = minDim / 2 / Math.tan(FOV / 2);
  const cx = width / 2, cy = height / 2;
  const margin = Math.max(16, minDim * 0.06);

  let best = null;
  for (let attempt = 0; attempt < 2000; attempt++) {
    const R = randomRotation();
    const z = rand(2.8, 4.5);
    const center = [
      rand(-1, 1) * 0.35 * z * (width / 2) / f,
      rand(-1, 1) * 0.35 * z * (height / 2) / f,
      z,
    ];
    const verts3 = LOCAL_VERTS.map((v) => add(applyMat(R, v), center));
    const verts = verts3.map(([x, y, vz]) => [cx + (f * x) / vz, cy + (f * y) / vz]);

    const fits = verts.every(([x, y]) => x >= margin && x <= width - margin && y >= margin && y <= height - margin);
    if (!fits) continue;

    const faces = FACES.map((face) => {
      const c = scale(face.verts.reduce((acc, vi) => add(acc, verts3[vi]), [0, 0, 0]), 0.25);
      const n = applyMat(R, face.normal);
      const toCam = scale(c, -1);
      const cos = dot(n, toCam) / len(toCam);
      return { verts: face.verts, front: cos > 0, cos, depth: c[2] };
    });

    const candidates = faces
      .map((face, i) => ({ face, i }))
      .filter(({ face }) => face.cos > COS_MIN && face.cos < COS_MAX);
    if (candidates.length === 0) continue;

    const { i: givenFace } = candidates[Math.floor(Math.random() * candidates.length)];
    const gv = faces[givenFace].verts;
    const edgeLength = gv.reduce((s, vi, k) => s + dist2D(verts[vi], verts[gv[(k + 1) % 4]]), 0) / 4;
    if (edgeLength < minDim * 0.12) continue;

    best = {
      verts,
      faces: faces.map(({ verts: fv, front, depth }) => ({ verts: fv, front, depth })),
      edges: EDGES.map(({ a, b, faces: ef }) => ({
        a,
        b,
        visible: ef.some((fi) => faces[fi].front),
        given: gv.includes(a) && gv.includes(b),
      })),
      givenFace,
      edgeLength,
    };
    break;
  }
  if (!best) throw new Error('Could not generate a cube for this canvas size');
  return best;
}
