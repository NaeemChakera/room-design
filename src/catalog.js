// Furniture & decor catalog, design styles and room templates.
// Dimensions in meters: w = width (along wall), d = depth, h = height.

export const ITEMS = {
  sofa:        { name: 'Sofa', w: 2.1, d: 0.9, h: 0.85, tall: false, clear: 0.5 },
  loveseat:    { name: 'Loveseat', w: 1.55, d: 0.85, h: 0.85, tall: false, clear: 0.5 },
  armchair:    { name: 'Armchair', w: 0.85, d: 0.85, h: 0.9, tall: false, clear: 0.3 },
  coffeeTable: { name: 'Coffee table', w: 1.1, d: 0.6, h: 0.42 },
  sideTable:   { name: 'Side table', w: 0.45, d: 0.45, h: 0.55 },
  mediaUnit:   { name: 'Media console', w: 1.6, d: 0.42, h: 0.5, clear: 0.3 },
  tv:          { name: 'TV', w: 1.25, d: 0.08, h: 0.72, mounted: true },
  bookshelf:   { name: 'Bookshelf', w: 0.9, d: 0.35, h: 1.9, tall: true, clear: 0.6 },
  bed:         { name: 'Double bed', w: 1.6, d: 2.1, h: 0.55, clear: 0.6 },
  singleBed:   { name: 'Single bed', w: 1.0, d: 2.05, h: 0.5, clear: 0.6 },
  nightstand:  { name: 'Nightstand', w: 0.48, d: 0.4, h: 0.55 },
  dresser:     { name: 'Dresser', w: 1.2, d: 0.48, h: 0.85, clear: 0.7 },
  wardrobe:    { name: 'Wardrobe', w: 1.5, d: 0.6, h: 2.1, tall: true, clear: 0.8 },
  desk:        { name: 'Desk', w: 1.3, d: 0.65, h: 0.75, clear: 0.0 },
  deskChair:   { name: 'Desk chair', w: 0.6, d: 0.6, h: 1.0 },
  diningTable: { name: 'Dining table', w: 1.6, d: 0.9, h: 0.75 },
  roundTable:  { name: 'Round table', w: 1.1, d: 1.1, h: 0.75 },
  chair:       { name: 'Dining chair', w: 0.46, d: 0.5, h: 0.85 },
  sideboard:   { name: 'Sideboard', w: 1.6, d: 0.45, h: 0.8, clear: 0.6 },
  bench:       { name: 'Bench', w: 1.2, d: 0.4, h: 0.45 },
  rug:         { name: 'Rug', w: 2.0, d: 1.4, h: 0.01, flat: true },
  floorLamp:   { name: 'Floor lamp', w: 0.4, d: 0.4, h: 1.6, light: true },
  arcLamp:     { name: 'Arc lamp', w: 0.45, d: 0.45, h: 1.9, light: true },
  plantLarge:  { name: 'Large plant', w: 0.55, d: 0.55, h: 1.5 },
  plantMedium: { name: 'Medium plant', w: 0.4, d: 0.4, h: 0.9 },
  pcTable:     { name: 'PC table', w: 0.56, d: 0.6, h: 0.71 },
  lampTable:   { name: 'Lamp table', w: 0.56, d: 0.6, h: 0.71 },
  // Wall-mounted & tabletop decor (positioned on walls / surfaces, not the floor)
  frame:       { name: 'Framed art', wall: true },
  shelf:       { name: 'Floating shelf', wall: true },
  mirror:      { name: 'Mirror', wall: true },
  tableLamp:   { name: 'Table lamp', top: true, light: true },
  deskLamp:    { name: 'Desk lamp', top: true, light: true },
  plantSmall:  { name: 'Small plant', top: true },
  pendant:     { name: 'Pendant light', ceiling: true, light: true },
  bike:        { name: 'Bike (wall-hung)', wall: true },
  projection:  { name: 'Projection area', wall: true },
  floorMirror: { name: 'Full-length mirror', wall: true },
  sign:        { name: 'Sign', wall: true },
  pcTower:     { name: 'PC tower', top: true },
  laptop:      { name: 'Laptop', top: true },
  custom:      { name: 'Custom piece', w: 0.6, d: 0.6, h: 0.75 },
  monitor:     { name: 'Monitor', top: true },
  projector:   { name: 'Ceiling projector', ceiling: true },
  sconce:      { name: 'Wall sconce', wall: true, light: true },
  plantHanging:{ name: 'Hanging plant', ceiling: true },
};

export const STYLES = {
  scandinavian: {
    name: 'Scandinavian',
    wall: '#f3f1ec', floor: '#e2cfae', floorLine: '#d3bd97',
    fabric: '#cfd3d4', fabric2: '#9fb0b8', wood: '#d8b98c', woodDark: '#a8865a',
    metal: '#2b2b2b', accent: '#e7b75f', rug: '#ecebe4', rugPattern: '#c9c4b5',
    bedding: '#ffffff', art: ['#e7b75f', '#9fb0b8', '#d97a5b', '#3f5864', '#efe6d6'],
    frame: '#d8b98c', plants: 1.0, frameStyle: 'thin',
  },
  japandi: {
    name: 'Japandi',
    wall: '#ece7de', floor: '#c9ad86', floorLine: '#b89c76',
    fabric: '#d9d0c1', fabric2: '#8c8273', wood: '#8f6e4d', woodDark: '#5d4532',
    metal: '#3a3a36', accent: '#6b7b5e', rug: '#ddd5c6', rugPattern: '#bfb39e',
    bedding: '#efe9df', art: ['#2f2f2c', '#c7b9a0', '#6b7b5e', '#a56d4c', '#e8e1d4'],
    frame: '#2f2f2c', plants: 0.8, frameStyle: 'thin',
  },
  boho: {
    name: 'Boho',
    wall: '#f4e9dc', floor: '#c49a6c', floorLine: '#b0875b',
    fabric: '#e6cfb2', fabric2: '#c56f4a', wood: '#b07d4f', woodDark: '#7a512f',
    metal: '#b08d57', accent: '#d9893d', rug: '#d8a577', rugPattern: '#9c4f32',
    bedding: '#f5ebdc', art: ['#c56f4a', '#e3b04b', '#6e8b5f', '#8c4a3d', '#f2d4b0'],
    frame: '#b08d57', plants: 1.6, frameStyle: 'mixed',
  },
  midcentury: {
    name: 'Mid-century',
    wall: '#f1ece2', floor: '#a9714a', floorLine: '#93603d',
    fabric: '#3f6f6a', fabric2: '#e09a3c', wood: '#9b5f34', woodDark: '#6e4021',
    metal: '#c9a050', accent: '#e09a3c', rug: '#e7d9bf', rugPattern: '#3f6f6a',
    bedding: '#f0e7d6', art: ['#e09a3c', '#3f6f6a', '#c4502f', '#2b3a4a', '#f0e2c4'],
    frame: '#6e4021', plants: 1.0, frameStyle: 'thick',
  },
  industrial: {
    name: 'Industrial',
    wall: '#e3e0dc', floor: '#8a7461', floorLine: '#78624f',
    fabric: '#5a4a3f', fabric2: '#7f8a8c', wood: '#7a5a3e', woodDark: '#4a3727',
    metal: '#1f1f1f', accent: '#b5562f', rug: '#a19a92', rugPattern: '#5f5953',
    bedding: '#d8d4cf', art: ['#1f1f1f', '#b5562f', '#c7c2bb', '#556066', '#e9e4dd'],
    frame: '#1f1f1f', plants: 0.9, frameStyle: 'thick',
  },
  modern: {
    name: 'Modern minimal',
    wall: '#f7f7f5', floor: '#d9d4cc', floorLine: '#c8c2b8',
    fabric: '#e9e7e3', fabric2: '#2d2d2d', wood: '#cbb79a', woodDark: '#2d2d2d',
    metal: '#c7c7c7', accent: '#2d6cdf', rug: '#efefec', rugPattern: '#d0d0cc',
    bedding: '#ffffff', art: ['#2d2d2d', '#2d6cdf', '#e9e7e3', '#c94f4f', '#9a9a9a'],
    frame: '#2d2d2d', plants: 0.7, frameStyle: 'thin',
  },
  // ---- Styles inspired by Pinterest Predicts 2026 trends ----
  afrohemian: {
    name: 'Afrohemian (Pinterest 2026)',
    wall: '#efe2cf', floor: '#9c6b43', floorLine: '#875a36',
    fabric: '#d9c3a3', fabric2: '#a3472b', wood: '#7b4a2a', woodDark: '#4e2c18',
    metal: '#a9824a', accent: '#d08a2e', rug: '#e8d6ba', rugPattern: '#2b2018',
    bedding: '#f3e7d4', art: ['#a3472b', '#d08a2e', '#2b2018', '#5d6b3a', '#e8d6ba'],
    frame: '#4e2c18', plants: 1.7, frameStyle: 'mixed', stripes: true,
  },
  neodeco: {
    name: 'Neo Deco (Pinterest 2026)',
    wall: '#e9e3d8', floor: '#5b3b2c', floorLine: '#4a2f23',
    fabric: '#2f5a4f', fabric2: '#b8863b', wood: '#5b3b2c', woodDark: '#2c1c15',
    metal: '#c8a24a', accent: '#b8863b', rug: '#d9cdb7', rugPattern: '#2f5a4f',
    bedding: '#efe9de', art: ['#2f5a4f', '#c8a24a', '#7a2e3a', '#1f2b33', '#e9e3d8'],
    frame: '#c8a24a', plants: 0.9, frameStyle: 'thick',
  },
  throwback: {
    name: 'Throwback 60s (Pinterest 2026)',
    wall: '#efe6d2', floor: '#8a5a33', floorLine: '#774c2a',
    fabric: '#5b6a2e', fabric2: '#6b3f22', wood: '#8a5a33', woodDark: '#4f3119',
    metal: '#d0a043', accent: '#c46a1b', rug: '#d8c39a', rugPattern: '#6b3f22',
    bedding: '#efe3cb', art: ['#c46a1b', '#5b6a2e', '#d0a043', '#6b3f22', '#efe3cb'],
    frame: '#4f3119', plants: 1.2, frameStyle: 'mixed',
  },
};

// Short design principles gathered from Pinterest-trend roundups; shown in the UI.
export const INSPIRATION = [
  'Stagger floating shelves at different heights and let trailing plants (pothos, string of pearls) spill over the edge.',
  'Gallery walls: mix portrait and landscape frames in one related colour family so the group reads as a single piece.',
  'Layer plants at several heights (floor, tabletop, shelf) so the room feels taller and fuller.',
  'Leave part of each nightstand clear; wall sconces free up space next to the bed.',
  'Layer the lighting: ceiling pendant, a floor lamp in the darkest corner, and table lamps at seat height.',
  'Pinterest Predicts 2026: Afrohemian textiles, Neo Deco brass and curves, and 60s browns and greens are the looks to watch.',
];

export const ROOM_TYPES = {
  living: { name: 'Living room' },
  bedroom: { name: 'Bedroom' },
  office: { name: 'Home office' },
  dining: { name: 'Dining room' },
};

export function itemSpec(type) {
  const s = ITEMS[type];
  if (!s) throw new Error(`Unknown item type ${type}`);
  return s;
}

// Existing floor finishes the user can choose. `color` is the default swatch.
export const FLOORS = {
  style: { name: 'Style default' },
  carpet: { name: 'Carpet', color: '#b9ad9a' },
  hardwood: { name: 'Hardwood', color: '#a9744a' },
  lightwood: { name: 'Light wood / laminate', color: '#dcc7a3' },
  tile: { name: 'Tile', color: '#d8d4cc' },
  concrete: { name: 'Concrete', color: '#b4b1ab' },
};

function shadeHex(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const f = (c) => Math.max(0, Math.min(255, Math.round(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt)));
  return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => f(c).toString(16).padStart(2, '0')).join('');
}

/** Style palette with the room's own floor and wall finishes applied. */
export function surfaces(S, room) {
  const fl = room?.floor;
  const out = { ...S, floorType: 'wood' };
  if (fl && fl.type && fl.type !== 'style') {
    out.floorType = fl.type;
    out.floor = fl.color || FLOORS[fl.type].color;
    out.floorLine = shadeHex(out.floor, fl.type === 'carpet' ? -0.06 : -0.12);
  }
  if (room?.wallColor) out.wall = room.wallColor;
  return out;
}

// "What to include" options. `rooms` = room types (plus 'keep' for keep-my-furniture) where it applies;
// `on` = room types where it is on by default.
export const INCLUDE_OPTIONS = [
  { key: 'desk', label: 'Desk', rooms: ['bedroom'], on: ['bedroom'] },
  { key: 'laptop', label: 'Laptop on the desk', rooms: ['bedroom', 'office', 'keep'], on: ['bedroom', 'office', 'keep'] },
  { key: 'dresser', label: 'Dresser', rooms: ['bedroom'], on: ['bedroom'] },
  { key: 'wardrobe', label: 'Wardrobe', hint: 'only if there is no closet', rooms: ['bedroom'], on: ['bedroom'] },
  { key: 'nightstands', label: 'Bedside cabinets', rooms: ['bedroom'], on: ['bedroom'] },
  { key: 'tv', label: 'TV & media console', rooms: ['living'], on: ['living'] },
  { key: 'frames', label: 'Frames & art', rooms: ['bedroom', 'living', 'office', 'dining', 'keep'], on: ['bedroom', 'living', 'office', 'dining', 'keep'] },
  { key: 'plants', label: 'Plants', rooms: ['bedroom', 'living', 'office', 'dining', 'keep'], on: ['bedroom', 'living', 'office', 'dining', 'keep'] },
  { key: 'lighting', label: 'Lamps & lighting', rooms: ['bedroom', 'living', 'office', 'dining', 'keep'], on: ['bedroom', 'living', 'office', 'dining', 'keep'] },
  { key: 'rug', label: 'Rug', rooms: ['bedroom', 'living', 'office', 'dining', 'keep'], on: ['bedroom', 'living', 'office', 'dining', 'keep'] },
  { key: 'shelves', label: 'Shelves', rooms: ['bedroom', 'living', 'office', 'dining', 'keep'], on: ['bedroom', 'living', 'office', 'dining', 'keep'] },
  { key: 'mirrors', label: 'Mirrors', rooms: ['bedroom', 'dining', 'keep'], on: ['bedroom', 'dining', 'keep'] },
  { key: 'readingChair', label: 'Reading chair', rooms: ['bedroom', 'living', 'office'], on: ['bedroom', 'living', 'office'] },
  { key: 'bookshelf', label: 'Bookshelf', rooms: ['bedroom', 'living', 'office'], on: ['living', 'office'] },
  { key: 'bench', label: 'Bench at the foot of the bed', rooms: ['bedroom', 'keep'], on: [] },
];

export function defaultInclude(roomKey) {
  return INCLUDE_OPTIONS.filter((o) => o.on.includes(roomKey)).map((o) => o.key);
}
