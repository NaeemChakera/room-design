// Geometry helpers. All units are meters. Plan coordinates use x → right, y → down
// (same as canvas), so a room polygon is a list of {x, y} points.

export const v = (x, y) => ({ x, y });
export const add = (a, b) => v(a.x + b.x, a.y + b.y);
export const sub = (a, b) => v(a.x - b.x, a.y - b.y);
export const mul = (a, s) => v(a.x * s, a.y * s);
export const dot = (a, b) => a.x * b.x + a.y * b.y;
export const cross = (a, b) => a.x * b.y - a.y * b.x;
export const len = (a) => Math.hypot(a.x, a.y);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
export const norm = (a) => {
  const l = len(a) || 1;
  return v(a.x / l, a.y / l);
};
export const lerp = (a, b, t) => v(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

export function signedArea(poly) {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

export const area = (poly) => Math.abs(signedArea(poly));

export function centroid(poly) {
  let cx = 0, cy = 0, a = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const f = p.x * q.y - q.x * p.y;
    cx += (p.x + q.x) * f;
    cy += (p.y + q.y) * f;
    a += f;
  }
  if (Math.abs(a) < 1e-9) {
    const n = poly.length || 1;
    return v(poly.reduce((s, p) => s + p.x, 0) / n, poly.reduce((s, p) => s + p.y, 0) / n);
  }
  return v(cx / (3 * a), cy / (3 * a));
}

export function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if ((a.y > p.y) !== (b.y > p.y) && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Orient the polygon so that for every wall a→b, the left perpendicular
 * (-d.y, d.x) points into the room. Returns a new array.
 */
export function orientInward(poly) {
  if (poly.length < 3) return poly.slice();
  // With y-down coordinates, positive signed area means clockwise on screen,
  // for which the left perpendicular (-dy, dx) points inward.
  return signedArea(poly) > 0 ? poly.slice() : poly.slice().reverse();
}

export function walls(poly) {
  const out = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const d = norm(sub(b, a));
    out.push({ i, a, b, dir: d, n: v(-d.y, d.x), length: dist(a, b) });
  }
  return out;
}

export function closestPointOnSegment(p, a, b) {
  const ab = sub(b, a);
  const l2 = dot(ab, ab) || 1e-9;
  const t = clamp(dot(sub(p, a), ab) / l2, 0, 1);
  return { point: add(a, mul(ab, t)), t };
}

export function segmentIntersect(p1, p2, p3, p4) {
  const d1 = sub(p2, p1), d2 = sub(p4, p3);
  const den = cross(d1, d2);
  if (Math.abs(den) < 1e-12) return null;
  const t = cross(sub(p3, p1), d2) / den;
  const u = cross(sub(p3, p1), d1) / den;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return { t, u, point: add(p1, mul(d1, t)) };
  return null;
}

/** Cast a ray from origin along dir, return nearest wall hit {wall, t, point, distance}. */
export function raycastWalls(origin, dir, wallList) {
  let best = null;
  const far = add(origin, mul(dir, 1000));
  for (const w of wallList) {
    const hit = segmentIntersect(origin, far, w.a, w.b);
    if (hit) {
      const d = hit.t * 1000;
      if (d > 1e-4 && (!best || d < best.distance)) {
        best = { wall: w, t: hit.u * w.length, point: hit.point, distance: d };
      }
    }
  }
  return best;
}

// ---------- Oriented boxes ----------
// A box: {x, y, w, d, theta}. Local x axis (width) = (cos θ, sin θ),
// local y axis (depth, "front") = (-sin θ, cos θ).

export function boxAxes(b) {
  const c = Math.cos(b.theta), s = Math.sin(b.theta);
  return { ux: v(c, s), uy: v(-s, c) };
}

export function boxCorners(b, pad = 0) {
  const { ux, uy } = boxAxes(b);
  const hw = b.w / 2 + pad, hd = b.d / 2 + pad;
  const c = v(b.x, b.y);
  return [
    add(c, add(mul(ux, -hw), mul(uy, -hd))),
    add(c, add(mul(ux, hw), mul(uy, -hd))),
    add(c, add(mul(ux, hw), mul(uy, hd))),
    add(c, add(mul(ux, -hw), mul(uy, hd))),
  ];
}

function projectPoly(pts, axis) {
  let min = Infinity, max = -Infinity;
  for (const p of pts) {
    const d = dot(p, axis);
    if (d < min) min = d;
    if (d > max) max = d;
  }
  return [min, max];
}

/** Separating-axis test for two convex polygons. */
export function convexOverlap(A, B) {
  for (const poly of [A, B]) {
    for (let i = 0; i < poly.length; i++) {
      const e = sub(poly[(i + 1) % poly.length], poly[i]);
      const axis = norm(v(-e.y, e.x));
      const [a0, a1] = projectPoly(A, axis);
      const [b0, b1] = projectPoly(B, axis);
      if (a1 <= b0 + 1e-6 || b1 <= a0 + 1e-6) return false;
    }
  }
  return true;
}

export function boxesOverlap(a, b, pad = 0) {
  return convexOverlap(boxCorners(a, pad), boxCorners(b, 0));
}

export function pointInBox(p, b) {
  const { ux, uy } = boxAxes(b);
  const r = sub(p, v(b.x, b.y));
  return Math.abs(dot(r, ux)) < b.w / 2 - 1e-6 && Math.abs(dot(r, uy)) < b.d / 2 - 1e-6;
}

/** True if box (shrunk by `tol`) lies fully inside the simple polygon. */
export function boxInsidePolygon(b, poly, tol = 0.005) {
  const shrunk = { ...b, w: Math.max(0.01, b.w - 2 * tol), d: Math.max(0.01, b.d - 2 * tol) };
  for (const c of boxCorners(shrunk)) if (!pointInPolygon(c, poly)) return false;
  for (const p of poly) if (pointInBox(p, shrunk)) return false;
  return true;
}

/** Distance from point to polygon boundary. */
export function distToBoundary(p, poly) {
  let best = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const { point } = closestPointOnSegment(p, poly[i], poly[(i + 1) % poly.length]);
    best = Math.min(best, dist(p, point));
  }
  return best;
}

/** Interior angle (radians) at vertex i of an inward-oriented polygon. */
export function interiorAngle(poly, i) {
  const n = poly.length;
  const prev = poly[(i - 1 + n) % n], cur = poly[i], next = poly[(i + 1) % n];
  const a = norm(sub(prev, cur)), b = norm(sub(next, cur));
  let ang = Math.atan2(cross(b, a), dot(a, b));
  // For our orientation (left normal inward) convex corners give positive angles.
  if (ang < 0) ang += Math.PI * 2;
  return ang;
}

export function polygonBounds(poly) {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const p of poly) {
    minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
  }
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

/** Subtract a list of [s, e] intervals from [0, L]; return free intervals. */
export function freeIntervals(L, blocked) {
  const sorted = blocked
    .map(([s, e]) => [clamp(s, 0, L), clamp(e, 0, L)])
    .filter(([s, e]) => e > s)
    .sort((p, q) => p[0] - q[0]);
  const out = [];
  let cur = 0;
  for (const [s, e] of sorted) {
    if (s > cur) out.push([cur, s]);
    cur = Math.max(cur, e);
  }
  if (cur < L) out.push([cur, L]);
  return out;
}

export function selfIntersects(poly) {
  const n = poly.length;
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      if (Math.abs(i - j) <= 1 || (i === 0 && j === n - 1)) continue;
      const a = poly[i], b = poly[(i + 1) % n], c = poly[j], d = poly[(j + 1) % n];
      const hit = segmentIntersect(a, b, c, d);
      if (hit && hit.t > 1e-6 && hit.t < 1 - 1e-6) return true;
    }
  }
  return false;
}

// Seeded PRNG so designs are reproducible from a seed.
export function rng(seed) {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13; s >>>= 0;
    s ^= s >>> 17;
    s ^= s << 5; s >>>= 0;
    return s / 4294967296;
  };
}
