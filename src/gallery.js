// Gallery-wall composer.
//
// Rules distilled from gallery-wall guides (Mixtiles, Frameology, Rossetti, Sunset):
//  * 1–3 larger "anchor" pieces, the rest small/medium; mix portrait and landscape.
//  * 2–3" gaps, kept consistent (1.5–2" for very small frames).
//  * Group width ≈ 60–75% of the furniture below; never wall-to-wall.
//  * Bottom of the group 8–10" above furniture, or the group centred ~57–60" up.
//  * Repeat 2–3 frame finishes so a mixed group still reads as one piece.
//  * Negative space is part of the design: cap how much of a wall the art covers.
//  * Bedrooms: relaxed, layered arrangements; mix in a mirror, a ledge or a shelf
//    with a plant so it isn't only rectangles.

const IN = 0.0254;

export const FINISHES = {
  black: { name: 'black', color: '#232323' },
  walnut: { name: 'walnut', color: '#6e4a2f' },
  oak: { name: 'natural oak', color: '#c9a477' },
  white: { name: 'white', color: '#f2efe9' },
  brass: { name: 'brass', color: '#b8964f' },
};

const STYLE_FINISHES = {
  scandinavian: ['oak', 'white', 'black'],
  japandi: ['black', 'oak'],
  boho: ['walnut', 'brass', 'oak'],
  midcentury: ['walnut', 'brass'],
  industrial: ['black', 'walnut'],
  modern: ['black', 'white'],
  afrohemian: ['walnut', 'black', 'brass'],
  neodeco: ['brass', 'black'],
  throwback: ['walnut', 'brass', 'oak'],
};

const ART_KINDS = ['abstract', 'botanical', 'photo', 'line', 'textile'];

// Element helpers (inches in, meters out). dx = centre offset, dz = bottom offset.
const F = (w, h, dx, dz, extra = {}) => ({ type: 'frame', w: w * IN, h: h * IN, dx: dx * IN, dz: dz * IN, ...extra });

/** Each template returns elements laid out around x = 0, z = 0 (bottom of group). */
const TEMPLATES = {
  statement: {
    label: 'one statement piece',
    min: 24,
    build: (maxW) => {
      const opts = [[40, 30], [36, 24], [30, 24], [24, 18], [20, 16], [16, 12]];
      const [w, h] = opts.find(([w]) => w <= maxW * 0.95) || opts[opts.length - 1];
      return [F(w, h, 0, 0, { mat: true, anchor: true })];
    },
  },
  pair: {
    label: 'a matched pair',
    min: 26,
    build: (maxW) => {
      const opts = [[18, 24], [16, 20], [12, 16], [11, 14]];
      const [w, h] = opts.find(([w]) => 2 * w + 3 <= maxW) || opts[opts.length - 1];
      return [F(w, h, -(w / 2 + 1.5), 0, { mat: true }), F(w, h, w / 2 + 1.5, 0, { mat: true })];
    },
  },
  anchorStack: {
    label: 'an anchor with a stacked pair beside it',
    min: 32,
    build: (maxW, r) => {
      const big = maxW >= 42 ? [18, 24] : [16, 20];
      const small = maxW >= 42 ? [11, 14] : [8, 10];
      const side = r() < 0.5 ? -1 : 1;
      const W = big[0] + 2.5 + small[0];
      const ax = -side * (W / 2 - big[0] / 2);
      const sx = side * (W / 2 - small[0] / 2);
      const stackH = small[1] * 2 + 2;
      const sz = (big[1] - stackH) / 2;
      return [
        F(big[0], big[1], ax, 0, { mat: true, anchor: true }),
        F(small[0], small[1], sx, sz),
        F(small[0], small[1], sx, sz + small[1] + 2),
      ];
    },
  },
  cozyCluster: {
    label: 'a relaxed cluster with a round mirror',
    min: 44,
    build: () => [
      F(16, 20, 0, 0, { mat: true, anchor: true }),
      F(11, 14, -16, 0),
      F(8, 10, -16, 16),
      { type: 'mirror', round: true, w: 12 * IN, h: 12 * IN, dx: 16.5 * IN, dz: 9 * IN },
      F(10, 8, 16.5, -2),
    ],
  },
  ledge: {
    label: 'a picture ledge with leaning frames (easy to swap)',
    min: 30,
    build: (maxW) => {
      const L = Math.min(48, Math.max(30, Math.round(maxW * 0.9 / 6) * 6));
      return [
        { type: 'shelf', ledge: true, w: L * IN, h: 0.04, dx: 0, dz: 0, depth: 0.09 },
        F(16, 20, -L / 2 + 10, 1.5, { lean: true, mat: true, anchor: true }),
        F(11, 14, -L / 2 + 22, 1.5, { lean: true }),
        F(8, 10, -L / 2 + 31, 1.5, { lean: true }),
        { type: 'plantSmall', w: 6 * IN, h: 8 * IN, dx: (L / 2 - 5) * IN, dz: 1.5 * IN },
      ];
    },
  },
  frameShelf: {
    label: 'a frame paired with a floating shelf',
    min: 40,
    build: (maxW, r) => {
      const side = r() < 0.5 ? -1 : 1;
      const fw = maxW >= 50 ? 18 : 16, fh = maxW >= 50 ? 24 : 20;
      const sw = 24;
      const W = fw + 4 + sw;
      return [
        F(fw, fh, -side * (W / 2 - fw / 2), 0, { mat: true, anchor: true }),
        { type: 'shelf', w: sw * IN, h: 0.04, dx: side * (W / 2 - sw / 2) * IN, dz: (fh * 0.35) * IN, depth: 0.2 },
      ];
    },
  },
  grid: {
    label: 'a tidy 2 × 2 grid',
    min: 28,
    build: (maxW) => {
      const [w, h] = maxW >= 34 ? [14, 11] : [10, 8];
      const g = 2;
      return [
        F(w, h, -(w / 2 + g / 2), 0), F(w, h, w / 2 + g / 2, 0),
        F(w, h, -(w / 2 + g / 2), h + g), F(w, h, w / 2 + g / 2, h + g),
      ];
    },
  },
  triptych: {
    label: 'a row of three',
    min: 42,
    build: (maxW) => {
      const [w, h] = maxW >= 46 ? [12, 16] : [11, 14];
      const g = 2.5;
      return [F(w, h, -(w + g), 0), F(w, h, 0, 0), F(w, h, w + g, 0)];
    },
  },
};

const WEIGHTS = {
  bedroom: { cozyCluster: 4, anchorStack: 3, ledge: 3, pair: 3, statement: 2, frameShelf: 2, grid: 1, triptych: 1 },
  living: { statement: 3, triptych: 3, cozyCluster: 3, anchorStack: 2, grid: 2, pair: 2, ledge: 2, frameShelf: 1 },
  office: { frameShelf: 4, grid: 3, anchorStack: 2, statement: 2, ledge: 2, pair: 1, triptych: 1, cozyCluster: 1 },
  dining: { statement: 3, pair: 3, triptych: 2, grid: 2, ledge: 1, cozyCluster: 1, anchorStack: 1, frameShelf: 1 },
};

function bounds(els) {
  let x0 = Infinity, x1 = -Infinity, z1 = 0, z0 = Infinity;
  for (const e of els) {
    x0 = Math.min(x0, e.dx - e.w / 2); x1 = Math.max(x1, e.dx + e.w / 2);
    z0 = Math.min(z0, e.dz); z1 = Math.max(z1, e.dz + e.h);
  }
  return { x0, x1, z0, z1, W: x1 - x0, H: z1 - z0 };
}

function weightedOrder(weights, r) {
  const keys = Object.keys(weights);
  return keys.map((k) => ({ k, s: Math.pow(r(), 1 / weights[k]) })).sort((a, b) => b.s - a.s).map((x) => x.k);
}

/**
 * Compose a gallery. maxW = allowed width (m), maxH = allowed height (m).
 * Returns {kind, label, elements, W, H} with elements re-centred, or null.
 */
export function composeGallery({ maxW, maxH, roomType = 'bedroom', style = 'scandinavian', r, art, prefer }) {
  const maxWin = maxW / IN;
  const order = weightedOrder(WEIGHTS[roomType] || WEIGHTS.bedroom, r);
  if (prefer && TEMPLATES[prefer]) order.unshift(prefer);
  const finishes = STYLE_FINISHES[style] || STYLE_FINISHES.scandinavian;
  for (const kind of order) {
    const T = TEMPLATES[kind];
    if (maxWin < T.min) continue;
    const els = T.build(maxWin, r);
    const b = bounds(els);
    if (b.W > maxW + 1e-6 || b.H > maxH + 1e-6) continue;
    // re-centre, assign finishes/art. 2–3 finishes, anchor gets the first.
    let fi = 0, ai = Math.floor(r() * 5);
    for (const e of els) {
      e.dx -= (b.x0 + b.x1) / 2;
      e.dz -= b.z0;
      if (e.type === 'frame') {
        e.finish = e.anchor ? finishes[0] : finishes[(fi++ % finishes.length)];
        e.art = art[(ai++) % art.length];
        e.artKind = ART_KINDS[Math.floor(r() * ART_KINDS.length)];
        e.artSeed = Math.floor(r() * 1e6);
      }
    }
    return { kind, label: T.label, elements: els, W: b.W, H: b.H };
  }
  return null;
}

/** Human-readable size like 18×24". */
export const sizeLabel = (w, h) => `${Math.round(w / IN)}×${Math.round(h / IN)}"`;

/**
 * Spread a frame inventory across free wall zones with diversity rules.
 * zones: [{wall, t0, t1, z0, z1, over}] (meters). inventory: [{w, h, count}] (inches).
 * Returns {groups:[{zone, elements, W, H}], leftovers:[{w,h,count}]}.
 */
export function planInventory(zones, inventory, { r, art, style = 'scandinavian' }) {
  const pieces = [];
  for (const it of inventory) for (let k = 0; k < it.count; k++) pieces.push({ w: it.w * IN, h: it.h * IN, label: it.label || sizeLabel(it.w * IN, it.h * IN) });
  pieces.sort((a, b) => b.w * b.h - a.w * a.h);
  const finishes = STYLE_FINISHES[style] || STYLE_FINISHES.scandinavian;
  const used = new Set();
  const groups = [];
  const LARGE = 600 * IN * IN; // ≥ ~24×25" counts as a large anchor
  const gap = 2.5 * IN;
  const sorted = zones.slice().sort((a, b) => (b.t1 - b.t0) - (a.t1 - a.t0));
  for (const z of sorted) {
    const zoneW = z.t1 - z.t0;
    const zoneH = z.z1 - z.z0;
    const margin = Math.min(0.25, zoneW * 0.12);
    const capW = Math.min(zoneW - 2 * margin, zoneW > 1.5 ? zoneW * 0.6 : Infinity, z.over ? z.over * 0.75 : Infinity);
    const capArea = 0.3 * zoneW * Math.min(zoneH, 1.1); // leave ~70% negative space
    const free = pieces.filter((p) => !used.has(p));
    if (!free.length) break;
    // Anchor: the largest piece that fits; only one large piece per wall.
    const anchor = free.find((p) => p.w <= capW && p.h <= zoneH - 0.05);
    if (!anchor) continue;
    used.add(anchor);
    const cols = [{ items: [anchor], w: anchor.w, h: anchor.h }];
    let area = anchor.w * anchor.h;
    let width = anchor.w;
    let hasExtra = false;
    let side = r() < 0.5 ? 1 : -1;
    const order = [];
    for (let guard = 0; guard < 8; guard++) {
      const rest = pieces.filter((p) => !used.has(p) && p.w * p.h < LARGE && p.h <= anchor.h + 0.06);
      // Diversity: once there are 3+ frames, add one non-frame element (shelf with plant, or round mirror).
      const frames = cols.reduce((n, c) => n + c.items.filter((x) => !x.extra).length, 0);
      if (!hasExtra && frames >= 3 && width + gap + 0.5 <= capW) {
        const extra = zoneW > 1.6
          ? { extra: 'shelf', w: 0.5, h: 0.04, label: '20" floating shelf with a trailing plant' }
          : { extra: 'mirror', w: 0.3, h: 0.3, label: '12" round mirror' };
        cols.push({ items: [extra], w: extra.w, h: anchor.h, side });
        order.push(side);
        width += gap + extra.w; side = -side; hasExtra = true;
        continue;
      }
      if (!rest.length) break;
      const p = rest[0];
      // stack two of the same size if they fit in the anchor's height
      const twin = rest.find((q) => q !== p && Math.abs(q.w - p.w) < 0.01 && Math.abs(q.h - p.h) < 0.01);
      const stack = twin && p.h * 2 + 2 * IN <= anchor.h + 0.06 ? [p, twin] : [p];
      const colW = p.w;
      const colArea = stack.reduce((s, q) => s + q.w * q.h, 0);
      if (width + gap + colW > capW || area + colArea > capArea) {
        // try a smaller piece instead
        const smaller = rest.find((q) => q.w * q.h < p.w * p.h && width + gap + q.w <= capW && area + q.w * q.h <= capArea);
        if (!smaller) break;
        used.add(smaller);
        cols.push({ items: [smaller], w: smaller.w, h: smaller.h, side });
        order.push(side); width += gap + smaller.w; area += smaller.w * smaller.h; side = -side;
        continue;
      }
      stack.forEach((q) => used.add(q));
      cols.push({ items: stack, w: colW, h: stack.length * p.h + (stack.length - 1) * 2 * IN, side });
      order.push(side); width += gap + colW; area += colArea; side = -side;
    }
    // Lay columns out: anchor in the middle, others alternating sides.
    const left = cols.slice(1).filter((c) => c.side < 0), right = cols.slice(1).filter((c) => c.side > 0);
    const seq = [...left.reverse(), cols[0], ...right];
    const W = seq.reduce((s, c) => s + c.w, 0) + gap * (seq.length - 1);
    let x = -W / 2;
    const els = [];
    let fi = 1, ai = Math.floor(r() * 5);
    for (const c of seq) {
      const cx = x + c.w / 2;
      const colTop = anchor.h;
      if (c.items[0].extra === 'shelf') {
        els.push({ type: 'shelf', w: c.w, h: 0.04, dx: cx, dz: anchor.h * 0.4, depth: 0.2, label: c.items[0].label });
      } else if (c.items[0].extra === 'mirror') {
        els.push({ type: 'mirror', round: true, w: c.w, h: c.w, dx: cx, dz: (anchor.h - c.w) / 2, label: c.items[0].label });
      } else {
        const stackH = c.items.reduce((s, q) => s + q.h, 0) + (c.items.length - 1) * 2 * IN;
        let zz = (colTop - stackH) / 2;
        for (const q of c.items) {
          const isAnchor = q === anchor;
          els.push({ type: 'frame', w: q.w, h: q.h, dx: cx, dz: zz, mat: isAnchor || q.w * q.h > 300 * IN * IN, anchor: isAnchor, finish: isAnchor ? finishes[0] : finishes[fi++ % finishes.length], art: art[(ai++) % art.length], artKind: ART_KINDS[Math.floor(r() * ART_KINDS.length)], artSeed: Math.floor(r() * 1e6), label: q.label, owned: true });
          zz += q.h + 2 * IN;
        }
      }
      x += c.w + gap;
    }
    groups.push({ zone: z, elements: els, W, H: anchor.h, coverage: area / (zoneW * Math.min(zoneH, 1.1)) });
  }
  // Leftovers
  const left = new Map();
  for (const p of pieces) if (!used.has(p)) { const k = p.label; left.set(k, (left.get(k) || 0) + 1); }
  return { groups, leftovers: [...left].map(([label, count]) => ({ label, count })) };
}

export { TEMPLATES as GALLERY_TEMPLATES, STYLE_FINISHES };
