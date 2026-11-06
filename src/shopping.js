// Shopping helpers: what to buy, rough prices new vs secondhand, and search links.
// Prices are rough US ranges (USD) to help budget, not quotes.

const IN = 0.0254;
const inch = (m) => Math.round(m / IN);

// verdict: 'thrift' = usually better secondhand, 'either', 'new' = buy new
export const SHOP = {
  sofa: { q: 'sofa', new: [450, 1500], used: [100, 450], verdict: 'either', tip: 'Sit on it, check the frame doesn\'t flex and sniff for smoke/pets. Removable covers can be washed.' },
  loveseat: { q: 'loveseat', new: [350, 1100], used: [80, 350], verdict: 'either', tip: 'Same checks as a sofa; measure your doorway first.' },
  armchair: { q: 'accent armchair', new: [180, 700], used: [40, 200], verdict: 'thrift', tip: 'Vintage armchairs are everywhere secondhand; reupholstered or slipcovered they look custom.' },
  coffeeTable: { q: 'coffee table', new: [80, 400], used: [20, 120], verdict: 'thrift', tip: 'Solid wood tables are easy to sand and oil. Wobbly legs usually just need tightening.' },
  sideTable: { q: 'side table', new: [40, 200], used: [10, 60], verdict: 'thrift', tip: 'Small tables are cheap and plentiful at flea markets.' },
  mediaUnit: { q: 'low media console', new: [150, 600], used: [40, 200], verdict: 'thrift', tip: 'Mid-century credenzas and dressers make great TV consoles.' },
  bookshelf: { q: 'bookshelf', new: [60, 350], used: [20, 120], verdict: 'thrift', tip: 'Anchor tall shelves to the wall with an anti-tip strap.' },
  bed: { q: 'bed frame full size', new: [200, 900], used: [60, 300], verdict: 'either', tip: 'A used frame is fine; always buy the mattress new.' },
  singleBed: { q: 'twin bed frame', new: [120, 500], used: [40, 200], verdict: 'either', tip: 'Used frame fine; mattress new.' },
  nightstand: { q: 'nightstand', new: [50, 250], used: [15, 80], verdict: 'thrift', tip: 'Mismatched vintage nightstands in the same height look intentional.' },
  dresser: { q: 'dresser', new: [200, 900], used: [50, 250], verdict: 'thrift', tip: 'Look for dovetail drawers and solid wood; paint or new knobs transform it.' },
  wardrobe: { q: 'wardrobe closet', new: [200, 900], used: [60, 300], verdict: 'either', tip: 'Check it comes apart to get through doors and up stairs.' },
  desk: { q: 'desk', new: [100, 500], used: [30, 180], verdict: 'thrift', tip: 'Office-clearance and campus sales are full of solid desks.' },
  deskChair: { q: 'ergonomic office chair', new: [150, 600], used: [60, 250], verdict: 'either', tip: 'Refurbished office chairs (Steelcase, Herman Miller) are a bargain; check the gas lift.' },
  diningTable: { q: 'dining table', new: [250, 1200], used: [60, 350], verdict: 'thrift', tip: 'Solid wood tables refinish beautifully.' },
  roundTable: { q: 'round dining table', new: [200, 800], used: [50, 250], verdict: 'thrift', tip: 'Pedestal bases give more knee room.' },
  chair: { q: 'dining chair', new: [60, 250], used: [10, 60], verdict: 'thrift', tip: 'Mismatched thrifted chairs painted one colour look great.' },
  sideboard: { q: 'sideboard buffet', new: [250, 1000], used: [60, 300], verdict: 'thrift', tip: 'Vintage sideboards are often better built than new flat-pack.' },
  bench: { q: 'end of bed bench', new: [70, 300], used: [20, 90], verdict: 'thrift', tip: 'A bench or blanket chest at the foot of the bed is also a feng shui fix.' },
  rug: { q: 'area rug', new: [60, 400], used: [20, 150], verdict: 'either', tip: 'Secondhand wool rugs clean up well; skip anything musty. Add a non-slip pad.' },
  floorLamp: { q: 'floor lamp', new: [40, 200], used: [10, 60], verdict: 'thrift', tip: 'Test it before you buy; rewiring kits are cheap. Use a warm 2700K bulb.' },
  arcLamp: { q: 'arc floor lamp', new: [80, 300], used: [25, 100], verdict: 'thrift', tip: 'Check the base is heavy enough to stay stable.' },
  tableLamp: { q: 'table lamp', new: [25, 120], used: [5, 30], verdict: 'thrift', tip: 'Thrift-store lamp bases + a new linen shade = designer look.' },
  deskLamp: { q: 'desk lamp', new: [20, 90], used: [5, 25], verdict: 'either', tip: 'Pick one with an adjustable arm.' },
  sconce: { q: 'plug in wall sconce', new: [25, 120], used: [10, 40], verdict: 'new', tip: 'Plug-in sconces need no electrician — great for renters.' },
  pendant: { q: 'pendant light', new: [30, 200], used: [10, 60], verdict: 'either', tip: 'Swag kits let you hang a pendant from a ceiling hook and plug it in.' },
  plantLarge: { q: 'large indoor plant', new: [40, 120], used: [10, 40], verdict: 'thrift', tip: 'Plant swaps, garden centres and Marketplace cuttings are cheapest. Pots are great thrift finds.' },
  plantMedium: { q: 'indoor plant', new: [15, 50], used: [5, 20], verdict: 'thrift', tip: 'Snake plant, pothos and ZZ plant tolerate low light.' },
  plantSmall: { q: 'small potted plant', new: [6, 20], used: [2, 8], verdict: 'thrift', tip: 'Propagate cuttings from a friend\'s pothos for free.' },
  plantHanging: { q: 'hanging planter macrame', new: [15, 45], used: [3, 15], verdict: 'thrift', tip: 'Use a ceiling hook rated for the weight of a wet pot.' },
  frame: { q: 'picture frame', new: [10, 60], used: [2, 12], verdict: 'thrift', tip: 'Thrift frames are ~90% cheaper than retail: keep the frame, swap the art, or spray-paint mismatched ones the same finish.' },
  shelf: { q: 'floating shelf', new: [15, 60], used: [5, 20], verdict: 'either', tip: 'Use wall anchors or studs; leave room for a trailing plant.' },
  mirror: { q: 'wall mirror', new: [30, 200], used: [8, 50], verdict: 'thrift', tip: 'Ornate thrift mirrors look expensive; check the silvering isn\'t flaking.' },
  screen: { q: 'pull down projector screen', new: [60, 250], used: [20, 90], verdict: 'either', tip: 'Matte white or grey screens beat a painted wall; check the case length fits your wall.' },
  projector: { q: '1080p projector', new: [150, 800], used: [70, 400], verdict: 'either', tip: 'Check the throw ratio for your distance and get a ceiling mount; refurbished units from the maker are good value.' },
  floorMirror: { q: 'full length mirror', new: [30, 150], used: [10, 40], verdict: 'thrift', tip: 'Mount it with mirror clips or a cleat rather than leaning it in a walkway.' },
};

/** Build a style-and-size-aware search query. */
export function searchQuery(item, styleName) {
  const s = SHOP[item.type];
  if (!s) return item.name;
  const style = (styleName || '').replace(/\s*\(.*\)/, '').toLowerCase();
  if (item.type === 'frame' && item.width) return `${inch(item.width)}x${inch(item.height)} picture frame ${item.finishName || ''}`.trim();
  if (item.type === 'shelf' && item.width) return item.ledge ? `${inch(item.width)} inch picture ledge shelf` : `${inch(item.width)} inch floating shelf`;
  if (item.type === 'mirror' && item.round) return `${inch(item.width)} inch round mirror`;
  if (item.type === 'screen' && item.diag) return `${item.diag} inch pull down projector screen 16:9`;
  if (item.type === 'floorMirror' && item.width) return `${inch(item.width)}x${inch(item.height)} full length wall mirror`;
  if (item.type === 'rug' && item.w) return `${Math.round(item.w / 0.3048)}x${Math.round(item.d / 0.3048)} ${style} rug`.trim();
  return `${style} ${s.q}`.trim();
}

export const STORES = [
  { key: 'amazon', name: 'Amazon', kind: 'new', url: (q) => `https://www.amazon.com/s?k=${encodeURIComponent(q)}` },
  { key: 'ikea', name: 'IKEA', kind: 'new', url: (q) => `https://www.ikea.com/us/en/search/?q=${encodeURIComponent(q)}` },
  { key: 'etsy', name: 'Etsy', kind: 'vintage', url: (q) => `https://www.etsy.com/search?q=${encodeURIComponent(q)}` },
  { key: 'marketplace', name: 'FB Marketplace', kind: 'used', url: (q) => `https://www.facebook.com/marketplace/search/?query=${encodeURIComponent(q)}` },
  { key: 'offerup', name: 'OfferUp', kind: 'used', url: (q) => `https://offerup.com/search?q=${encodeURIComponent(q)}` },
  { key: 'ebay', name: 'eBay', kind: 'used', url: (q) => `https://www.ebay.com/sch/i.html?_nkw=${encodeURIComponent(q)}` },
];

export const LOCAL_LINKS = [
  { name: 'Flea markets near me', url: 'https://www.google.com/maps/search/flea+market+near+me' },
  { name: 'Thrift stores near me', url: 'https://www.google.com/maps/search/thrift+store+near+me' },
  { name: 'Habitat ReStore', url: 'https://www.habitat.org/restores' },
];

export const FLEA_TIPS = [
  'Go early for the best pieces, late for the best prices. Bring cash and a tape measure.',
  'Bring this list with sizes — the app\'s dimensions are what fit your room.',
  'Turn frames over: solid wood or metal with real glass is worth it; swap the art.',
  'Plug lamps in before paying (most thrift stores have a test outlet).',
  'Solid wood with dovetail drawers beats new flat-pack and is easy to refinish.',
  'Haggle politely, especially for bundles ("$30 for both?").',
  'Buy new: mattresses, pillows and anything upholstered that smells musty.',
];

/** Group design items into a shopping list. */
export function shoppingList(design, { styleName, finishNames = {} } = {}) {
  const rows = new Map();
  const push = (src, type, name, size, extra = {}) => {
    const shop = SHOP[type];
    if (!shop) return;
    const item = { type, name, ...extra };
    const q = searchQuery({ ...src, ...item, type }, styleName);
    const key = `${type}|${q}`;
    const r = rows.get(key) || { key, type, name, size, qty: 0, query: q, shop, fixed: !!src.fixed };
    r.qty++;
    rows.set(key, r);
  };
  for (const it of design.items) {
    if (it.fixed || it.parent && it.type === 'deskChair' && it.fixed) continue;
    const size = it.flat ? `${inch(it.w)}×${inch(it.d)}"` : `${inch(it.w)}"W × ${inch(it.d)}"D${it.h ? ` × ${inch(it.h)}"H` : ''}`;
    push(it, it.type, it.name, size);
  }
  for (const w of design.wallItems) {
    if (w.fixed || w.owned) continue;
    const t = w.type === 'shelf' && w.ledge ? 'shelf' : w.type;
    const name = w.type === 'frame' ? `Frame ${inch(w.width)}×${inch(w.height)}" (${w.finishName || 'any'})` : w.ledge ? `Picture ledge ${inch(w.width)}"` : w.name;
    const size = w.type === 'shelf' ? `${inch(w.width)}" wide` : w.round ? `${inch(w.width)}" across` : `${inch(w.width)}×${inch(w.height)}"`;
    push({ ...w, finishName: w.finishName }, t, name, size);
  }
  for (const t of design.topItems) {
    if (t.fixed) continue;
    push(t, t.type, t.name, '');
  }
  void finishNames;
  return [...rows.values()];
}

export function totals(rows, have = new Set()) {
  let newLo = 0, newHi = 0, mixLo = 0, mixHi = 0;
  for (const r of rows) {
    if (have.has(r.key)) continue;
    const n = r.shop.new, u = r.shop.used;
    newLo += n[0] * r.qty; newHi += n[1] * r.qty;
    const p = r.shop.verdict === 'new' ? n : u;
    mixLo += p[0] * r.qty; mixHi += p[1] * r.qty;
  }
  return { newLo, newHi, mixLo, mixHi };
}
