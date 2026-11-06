// Ready-made rooms. Units are meters; helpers take inches where that's how
// the room was measured.
import { orientInward } from './geometry.js';

const IN = 0.0254;
const P = (x, y) => ({ x: x * IN, y: y * IN });

/** Rectangle W x L meters with a door and a window. */
export function rectRoom(W, L) {
  return {
    name: `${W} × ${L} m room`,
    points: orientInward([{ x: 0, y: 0 }, { x: W, y: 0 }, { x: W, y: L }, { x: 0, y: L }]),
    openings: [
      { id: 'd1', type: 'door', wall: 3, t: Math.min(0.8, L / 3), width: 0.85, hinge: 'left' },
      { id: 'w1', type: 'window', wall: 1, t: L / 2, width: Math.min(1.5, L * 0.4), sill: 0.9, height: 1.2 },
    ],
    height: 2.5,
  };
}

export function lRoom() {
  return {
    name: 'L-shaped room',
    points: orientInward([{ x: 0, y: 0 }, { x: 5.2, y: 0 }, { x: 5.2, y: 3.0 }, { x: 3.2, y: 3.0 }, { x: 3.2, y: 4.8 }, { x: 0, y: 4.8 }]),
    openings: [
      { id: 'd1', type: 'door', wall: 4, t: 0.7, width: 0.9, hinge: 'left' },
      { id: 'w1', type: 'window', wall: 0, t: 2.6, width: 1.6, sill: 0.8, height: 1.3 },
      { id: 'w2', type: 'window', wall: 5, t: 2.4, width: 1.2, sill: 0.9, height: 1.2 },
    ],
    height: 2.5,
  };
}

/**
 * Naeem's bedroom from the Oct 2026 hand-span measurements (1 span ≈ 9").
 * Walls (index: name): 0 projector wall (from desk corner), 1 poster wall
 * (from door corner), 2 window section, 3 closet bump side, 4 closet face,
 * 5 desk wall (from closet end toward projector corner).
 */
export function naeemBedroom() {
  const wallItem = (type, wall, tIn, wIn, hIn, zIn, extra = {}) => ({ type, wall, t: tIn * IN, width: wIn * IN, height: hIn * IN, z: zIn * IN, fixed: true, ...extra });
  // Desk wall runs along x = 0 with the room to its right (+x); t runs from y = 144" toward y = 0.
  const deskWallItem = (type, tIn, wIn, dIn, hIn, extra = {}) => ({
    type, x: (dIn / 2 + 0.5) * IN, y: (144 - tIn) * IN, w: wIn * IN, d: dIn * IN, h: hIn * IN,
    theta: -Math.PI / 2, fixed: true, ...extra,
  });
  const frames = [
    // [t center, width, height, bottom z]  (inches)
    [10.5, 12, 16, 75.1], [10.5, 12, 16, 56.1],
    [31.5, 24, 18, 74.1], [31.5, 24, 18, 54.1],
    [58.5, 24, 36, 55.1], [85.5, 24, 36, 55.1],
    [112.5, 24, 18, 74.1], [112.5, 24, 18, 54.1],
    [133.5, 12, 16, 75.1], [133.5, 12, 16, 56.1],
  ];
  const art = ['#b5482f', '#d9893d', '#2f2f2c', '#c9b38f', '#6e8b5f'];
  return {
    name: "Example furnished bedroom (hand-span estimate)",
    measuredNote: '1 hand span ≈ 9" (not yet checked against a ruler). Rescale after tape-measuring the desk and projector walls.',
    points: [P(0, 0), P(144, 0), P(144, 162), P(70, 162), P(70, 144), P(0, 144)],
    height: 96 * IN,
    floor: { type: 'carpet', color: '#b5a893' },
    wallColor: '#ece6d6',
    openings: [
      { id: 'door', type: 'door', wall: 0, t: 122.5 * IN, width: 32 * IN, hinge: 'right' },
      { id: 'window', type: 'window', wall: 2, t: 37 * IN, width: 66 * IN, sill: 34 * IN, height: 47 * IN },
      { id: 'closet', type: 'door', wall: 4, t: 34 * IN, width: 32 * IN, swing: 'none', label: 'Closet' },
    ],
    // Frame inventory (inches, as hung): 2 × 24×36 portrait, 4 × 18×24 landscape, 4 × 12×16 portrait.
    wallNames: ['projector wall', 'poster wall', 'window wall', 'closet-bump side', 'closet wall', 'desk wall'],
    frameInventory: [{ w: 24, h: 36, count: 2 }, { w: 24, h: 18, count: 4 }, { w: 12, h: 16, count: 4 }],
    tips: [
      'Walkway: the 18" gap between the bed and the poster wall sits under the bike — tight but usable (16" minimum).',
      'Option: replace the lamp on the corner lamp table with a wall sconce to let the projection grow from ~87" toward ~95".',
      'Before rebuilding: patch the old bike-rack holes and use matte white paint for a cleaner projection surface.',
    ],
    fixed: [
      deskWallItem('dresser', 24, 48, 24, 40, { name: 'Dresser 48"' }),
      deskWallItem('pcTable', 59, 22, 24, 28, { name: 'PC table 22"' }),
      deskWallItem('desk', 96, 52, 24, 30, { name: 'Desk 52"' }),
      deskWallItem('lampTable', 133, 22, 24, 28, { name: 'Lamp table 22"' }),
      // Double bed 54 x 75, headboard on the window section, 18" off the poster wall.
      { type: 'bed', x: (144 - 18 - 27) * IN, y: (162 - 37.5) * IN, w: 54 * IN, d: 75 * IN, h: 0.55, theta: Math.PI, fixed: true, name: 'Double bed 54×75"' },
    ],
    fixedTop: [
      { type: 'pcTower', parentIndex: 1, offset: { x: 0, y: -0.05 } },
      { type: 'monitor', parentIndex: 2, offset: { x: 0, y: -0.15 } },
      { type: 'tableLamp', parentIndex: 3, offset: { x: 0, y: 0 } },
      { type: 'projector', ceiling: true, x: 72 * IN, y: 81 * IN },
    ],
    fixedWall: [
      ...frames.map(([t, w, h, z], i) => wallItem('frame', 5, t, w, h, z, { art: art[i % art.length], artSeed: 100 + i, group: 'Desk-wall gallery' })),
      wallItem('projection', 0, 58, 76, 43, 36, { name: 'Projection ~87" (76 × 43")' }),
      wallItem('bike', 1, 75, 78, 40, 48, { depth: 0.36, name: 'Bike, hung horizontally' }),
      wallItem('sign', 4, 34, 36, 5.5, 87, { name: '"Moby Arena" sign', depth: 0.01 }),
    ],
  };
}

const FT = 0.3048;

/** Rectangle from feet, with a door, a window and (optionally) a closet doorway. */
export function rectRoomFt(wFt, lFt, { closet = false, name } = {}) {
  const W = +(wFt * FT).toFixed(4), L = +(lFt * FT).toFixed(4);
  const r = rectRoom(W, L);
  r.name = name || `${wFt}' × ${lFt}' room`;
  r.height = 2.44; // 8' ceiling
  if (closet) r.openings.push({ id: 'c1', type: 'door', swing: 'none', label: 'Closet', wall: 0, t: W - 0.6, width: 0.75 });
  return r;
}

const P_ = (group, label, roomType, wFt, lFt, opts = {}) => ({ group, label, roomType, make: () => rectRoomFt(wFt, lFt, { ...opts, name: label }) });

// Common US room sizes (feet).
export const PRESETS = {
  bed_small: P_('Bedrooms', "Small bedroom · 10' × 10'", 'bedroom', 10, 10),
  bed_std: P_('Bedrooms', "Standard bedroom · 11' × 12' with closet", 'bedroom', 11, 12, { closet: true }),
  bed_kid: P_('Bedrooms', "Kid's / guest room · 10' × 11'", 'bedroom', 10, 11),
  bed_primary: P_('Bedrooms', "Primary bedroom · 14' × 16' with closet", 'bedroom', 14, 16, { closet: true }),
  bed_dorm: P_('Bedrooms', "Dorm room · 12' × 15' (no closet)", 'bedroom', 12, 15),
  liv_small: P_('Living rooms', "Small living room · 12' × 14'", 'living', 12, 14),
  liv_std: P_('Living rooms', "Living room · 14' × 18'", 'living', 14, 18),
  liv_large: P_('Living rooms', "Large living room · 16' × 20'", 'living', 16, 20),
  office_small: P_('Home offices', "Home office · 9' × 11'", 'office', 9, 11),
  office_std: P_('Home offices', "Home office · 10' × 12'", 'office', 10, 12),
  dining_std: P_('Dining rooms', "Dining room · 12' × 14'", 'dining', 12, 14),
  dining_large: P_('Dining rooms', "Dining room · 14' × 16'", 'dining', 14, 16),
  lshape: { group: 'Other shapes', label: 'L-shaped room', roomType: 'living', make: lRoom },
  example: { group: 'Examples', label: "Example: furnished 12' × 13'6\" bedroom (keeps its furniture)", make: naeemBedroom, roomType: 'bedroom', keep: true },
};

export const DEFAULT_PRESET = 'bed_std';
