// 3D "dollhouse" view of a design using three.js.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { STYLES, surfaces } from './catalog.js';
import { walls as wallsOf, centroid, interiorAngle, polygonBounds, rng, add, mul } from './geometry.js';
import { openingZ } from './designer.js';

const WALL_T = 0.12;

const matCache = new Map();
function mat(color, opts = {}) {
  const key = color + JSON.stringify(opts);
  if (!matCache.has(key)) matCache.set(key, new THREE.MeshStandardMaterial({ color, roughness: 0.8, metalness: 0, ...opts }));
  return matCache.get(key);
}

function box(w, h, d, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function cyl(rt, rb, h, material, x = 0, y = 0, z = 0, seg = 20) {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, seg), material);
  m.position.set(x, y + h / 2, z);
  m.castShadow = true; m.receiveShadow = true;
  return m;
}
function sphere(r, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), material);
  m.position.set(x, y, z);
  m.castShadow = true;
  return m;
}

function legs(g, w, d, h, material, inset = 0.05, r = 0.02) {
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) g.add(cyl(r, r * 0.8, h, material, sx * (w / 2 - inset), 0, sz * (d / 2 - inset), 8));
}

function plant(g, scale, S, seed, potY = 0) {
  const r = rng(seed * 31 + 7);
  const potH = 0.35 * scale, potR = 0.17 * scale;
  g.add(cyl(potR, potR * 0.8, potH, mat(S.accent === '#2d6cdf' ? '#e9e7e3' : S.woodDark), 0, potY, 0));
  const greens = ['#4f7a45', '#5f8f4e', '#3f6a3a', '#76a35d'];
  const n = 7 + Math.floor(r() * 5);
  for (let i = 0; i < n; i++) {
    const a = r() * Math.PI * 2;
    const rad = (0.08 + r() * 0.14) * scale;
    const y = potY + potH + (0.15 + r() * 0.9) * scale;
    const s = sphere((0.13 + r() * 0.1) * scale, mat(greens[i % 4], { roughness: 0.9 }), Math.cos(a) * rad, y, Math.sin(a) * rad);
    s.scale.set(1, 0.7 + r() * 0.6, 1);
    g.add(s);
  }
  g.add(cyl(0.012 * scale, 0.015 * scale, 0.9 * scale, mat('#5b4632'), 0, potY + potH, 0, 6));
}

function lampShade(color) {
  return new THREE.MeshStandardMaterial({ color, emissive: '#ffd27a', emissiveIntensity: 0.6, roughness: 0.9, side: THREE.DoubleSide });
}

function artTexture(color, seed, S) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 160;
  const g = c.getContext('2d');
  const r = rng(seed + 1);
  g.fillStyle = '#f4efe6'; g.fillRect(0, 0, 128, 160);
  const pal = S.art;
  const kind = Math.floor(r() * 3);
  if (kind === 0) {
    // arches / suns
    g.fillStyle = color; g.beginPath(); g.arc(64, 110, 46, Math.PI, 0); g.fill();
    g.fillStyle = pal[Math.floor(r() * pal.length)]; g.beginPath(); g.arc(64, 110, 26, Math.PI, 0); g.fill();
    g.fillStyle = pal[Math.floor(r() * pal.length)]; g.beginPath(); g.arc(30 + r() * 60, 40, 14, 0, 7); g.fill();
  } else if (kind === 1) {
    for (let i = 0; i < 5; i++) {
      g.fillStyle = pal[Math.floor(r() * pal.length)];
      g.beginPath(); g.ellipse(20 + r() * 88, 20 + r() * 120, 10 + r() * 30, 10 + r() * 30, r() * 3, 0, 7); g.fill();
    }
  } else {
    g.strokeStyle = color; g.lineWidth = 5;
    g.beginPath(); g.moveTo(10, 120);
    for (let x = 10; x < 120; x += 10) g.lineTo(x, 60 + Math.sin(x / 14 + r() * 2) * 30);
    g.stroke();
    g.fillStyle = pal[Math.floor(r() * pal.length)]; g.fillRect(70, 20, 34, 34);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function floorTexture(S) {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = S.floor; g.fillRect(0, 0, 512, 512);
  const r = rng(11);
  const type = S.floorType || 'wood';
  let repeat = 0.45;
  if (type === 'carpet') {
    for (let i = 0; i < 26000; i++) {
      g.fillStyle = r() < 0.5 ? 'rgba(0,0,0,0.07)' : 'rgba(255,255,255,0.06)';
      g.fillRect(r() * 512, r() * 512, 2, 2);
    }
    repeat = 1.5;
  } else if (type === 'tile') {
    g.strokeStyle = S.floorLine; g.lineWidth = 4;
    for (let k = 0; k <= 512; k += 128) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 512); g.moveTo(0, k); g.lineTo(512, k); g.stroke(); }
    repeat = 0.42; // 4 tiles of 60 cm per texture
  } else if (type === 'concrete') {
    for (let i = 0; i < 60; i++) {
      g.fillStyle = `rgba(0,0,0,${0.02 + r() * 0.04})`;
      g.beginPath(); g.arc(r() * 512, r() * 512, 20 + r() * 80, 0, 7); g.fill();
    }
    repeat = 0.3;
  } else {
    for (let y = 0; y < 512; y += 46) {
      const off = Math.floor(r() * 300);
      for (let x = -off; x < 512; x += 300) {
        g.fillStyle = `rgba(0,0,0,${0.02 + r() * 0.05})`;
        g.fillRect(x, y, 300, 46);
        g.strokeStyle = S.floorLine; g.lineWidth = 2; g.strokeRect(x, y, 300, 46);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function buildItem(it, S, lights) {
  const g = new THREE.Group();
  const { w, d, h } = it;
  const wood = mat(S.wood), woodDark = mat(S.woodDark), fabric = mat(S.fabric, { roughness: 1 }), fabric2 = mat(S.fabric2, { roughness: 1 }), metal = mat(S.metal, { metalness: 0.6, roughness: 0.4 });
  const back = -d / 2;
  switch (it.type) {
    case 'sofa': case 'loveseat': {
      g.add(box(w, 0.25, d, fabric, 0, 0.12, 0));
      g.add(box(w, 0.45, 0.2, fabric, 0, 0.37, back + 0.1));
      g.add(box(0.18, 0.28, d, fabric, -w / 2 + 0.09, 0.37, 0));
      g.add(box(0.18, 0.28, d, fabric, w / 2 - 0.09, 0.37, 0));
      const n = it.type === 'sofa' ? 3 : 2, cw = (w - 0.36) / n;
      for (let i = 0; i < n; i++) g.add(box(cw - 0.02, 0.12, d - 0.25, mat(S.fabric, { roughness: 1, color: S.fabric }), -w / 2 + 0.18 + cw * (i + 0.5), 0.37, 0.08));
      g.add(box(0.4, 0.38, 0.12, mat(S.accent), -w / 2 + 0.45, 0.5, back + 0.28).rotateZ(0.1));
      g.add(box(0.4, 0.38, 0.12, fabric2, w / 2 - 0.45, 0.5, back + 0.28).rotateZ(-0.1));
      legs(g, w, d, 0.12, woodDark, 0.08, 0.02);
      break;
    }
    case 'armchair': {
      g.add(box(w, 0.25, d, fabric2, 0, 0.15, 0));
      g.add(box(w, 0.5, 0.16, fabric2, 0, 0.4, back + 0.08));
      g.add(box(0.13, 0.22, d, fabric2, -w / 2 + 0.065, 0.4, 0));
      g.add(box(0.13, 0.22, d, fabric2, w / 2 - 0.065, 0.4, 0));
      legs(g, w, d, 0.15, woodDark, 0.08);
      break;
    }
    case 'coffeeTable': case 'sideTable': case 'nightstand': case 'diningTable': case 'roundTable': case 'desk': {
      const top = it.type === 'nightstand' ? h - 0.03 : h - 0.04;
      const round = it.round || it.type === 'sideTable';
      if (round) g.add(cyl(w / 2, w / 2, 0.04, it.type === 'coffeeTable' ? wood : woodDark, 0, top, 0, 32));
      else g.add(box(w, 0.04, d, it.type === 'coffeeTable' || it.type === 'desk' || it.type.includes('Table') ? wood : woodDark, 0, top, 0));
      if (it.type === 'nightstand') g.add(box(w, top - 0.12, d, woodDark, 0, 0.12, 0));
      if (round) g.add(cyl(0.04, 0.12, top, metal, 0, 0, 0, 12));
      else legs(g, w, d, top, it.type === 'desk' ? metal : woodDark, 0.05, 0.018);
      if (it.type === 'desk') {
        g.add(box(0.56, 0.32, 0.03, mat('#1d2024'), 0, top + 0.16, back + 0.1));
        g.add(box(0.06, 0.16, 0.06, metal, 0, top + 0.04, back + 0.1));
        g.add(box(0.4, 0.015, 0.13, mat('#d9d9d9'), 0, top + 0.04, 0.08));
      }
      if (it.type === 'coffeeTable') {
        g.add(box(0.22, 0.04, 0.16, fabric2, -w * 0.25, top + 0.04, 0));
        g.add(cyl(0.05, 0.04, 0.12, mat(S.accent), w * 0.2, top + 0.04, 0));
      }
      break;
    }
    case 'pcTable': case 'lampTable': {
      g.add(box(w, 0.03, d, woodDark, 0, h - 0.03, 0));
      g.add(box(w - 0.04, 0.02, d - 0.04, woodDark, 0, 0.12, 0));
      legs(g, w, d, h - 0.03, metal, 0.03, 0.015);
      break;
    }
    case 'mediaUnit': case 'dresser': case 'sideboard': {
      g.add(box(w, h - 0.12, d, wood, 0, 0.12, 0));
      legs(g, w, d, 0.12, woodDark, 0.06, 0.015);
      const n = Math.max(2, Math.round(w / 0.45));
      for (let i = 0; i < n; i++) g.add(box(w / n - 0.02, h - 0.18, 0.01, mat(S.wood, { color: S.wood, roughness: 0.6 }), -w / 2 + (w / n) * (i + 0.5), 0.15, d / 2 + 0.002));
      break;
    }
    case 'bookshelf': {
      g.add(box(w, h, 0.02, woodDark, 0, 0, back + 0.01));
      g.add(box(0.02, h, d, woodDark, -w / 2 + 0.01, 0, 0));
      g.add(box(0.02, h, d, woodDark, w / 2 - 0.01, 0, 0));
      const r = rng(it.books || 5);
      const cols = S.art.concat([S.fabric2, S.accent]);
      for (let k = 0; k < 5; k++) {
        const y = k * (h / 5);
        g.add(box(w, 0.025, d, woodDark, 0, y, 0));
        let x = -w / 2 + 0.03;
        while (x < w / 2 - 0.08) {
          if (r() < 0.12) { x += 0.12; continue; }
          const bw = 0.025 + r() * 0.035, bh = 0.18 + r() * 0.1;
          g.add(box(bw, bh, d * 0.8, mat(cols[Math.floor(r() * cols.length)]), x + bw / 2, y + 0.025, 0));
          x += bw + 0.004;
        }
      }
      g.add(box(w, 0.025, d, woodDark, 0, h - 0.025, 0));
      break;
    }
    case 'bed': case 'singleBed': {
      g.add(box(w, 0.25, d, woodDark, 0, 0.08, 0));
      g.add(box(w - 0.06, 0.2, d - 0.1, mat(S.bedding, { roughness: 1 }), 0, 0.33, 0.03));
      g.add(box(w + 0.06, 1.0, 0.08, mat(S.fabric2, { roughness: 1 }), 0, 0.08, back + 0.04)); // headboard
      const pillows = it.type === 'bed' ? 2 : 1, pw = (w - 0.2) / pillows;
      for (let i = 0; i < pillows; i++) g.add(box(pw - 0.05, 0.12, 0.35, mat('#ffffff', { roughness: 1 }), -w / 2 + 0.1 + pw * (i + 0.5), 0.53, back + 0.3));
      g.add(box(w - 0.04, 0.05, d - 0.7, mat(S.fabric, { roughness: 1 }), 0, 0.53, 0.32));
      g.add(box(w, 0.06, 0.4, mat(S.accent, { roughness: 1 }), 0, 0.54, d / 2 - 0.4));
      break;
    }
    case 'wardrobe': {
      g.add(box(w, h, d, wood, 0, 0, 0));
      g.add(box(0.01, h - 0.1, 0.01, woodDark, 0, 0.05, d / 2 + 0.005));
      g.add(box(0.02, 0.25, 0.03, metal, -0.06, 1.0, d / 2 + 0.01));
      g.add(box(0.02, 0.25, 0.03, metal, 0.06, 1.0, d / 2 + 0.01));
      break;
    }
    case 'deskChair': {
      g.add(cyl(0.25, 0.25, 0.07, metal, 0, 0.42, 0));
      g.add(box(0.44, 0.5, 0.06, metal, 0, 0.5, -0.24));
      g.add(cyl(0.03, 0.03, 0.4, metal, 0, 0.02, 0, 8));
      g.add(cyl(0.28, 0.28, 0.03, metal, 0, 0, 0, 5));
      break;
    }
    case 'bench': {
      g.add(box(w, 0.06, d, wood, 0, h - 0.06, 0));
      g.add(box(w - 0.06, 0.05, d - 0.06, mat(S.fabric2, { roughness: 1 }), 0, h, 0));
      legs(g, w, d, h - 0.06, woodDark, 0.05, 0.02);
      break;
    }
    case 'chair': {
      g.add(box(w, 0.04, d, woodDark, 0, 0.45, 0));
      g.add(box(w, 0.04, d - 0.08, fabric, 0, 0.49, 0.02));
      g.add(box(w, 0.4, 0.03, woodDark, 0, 0.47, back + 0.015));
      legs(g, w, d, 0.45, woodDark, 0.03, 0.015);
      break;
    }
    case 'rug': {
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, 0.012, d), mat(S.rug, { roughness: 1 }));
      m.position.y = 0.006; m.receiveShadow = true;
      g.add(m);
      const inner = new THREE.Mesh(new THREE.BoxGeometry(w - 0.3, 0.013, d - 0.3), mat(S.rugPattern, { roughness: 1 }));
      inner.position.y = 0.007; inner.receiveShadow = true; inner.scale.set(1, 1, 1);
      const inner2 = new THREE.Mesh(new THREE.BoxGeometry(w - 0.4, 0.014, d - 0.4), mat(S.rug, { roughness: 1 }));
      inner2.position.y = 0.0075; inner2.receiveShadow = true;
      g.add(inner, inner2);
      break;
    }
    case 'floorLamp': case 'arcLamp': {
      g.add(cyl(0.16, 0.16, 0.03, metal, 0, 0, 0));
      if (it.type === 'arcLamp') {
        const curve = new THREE.QuadraticBezierCurve3(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 2.2, 0.1), new THREE.Vector3(0, 1.75, 0.9));
        const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, 0.012, 6), metal);
        g.add(tube);
        const shade = new THREE.Mesh(new THREE.SphereGeometry(0.2, 20, 12, 0, Math.PI * 2, 0, Math.PI / 2), lampShade(S.metal === '#1f1f1f' ? '#1f1f1f' : '#c9a050'));
        shade.position.set(0, 1.6, 0.9);
        g.add(shade);
        lights.push({ group: g, local: new THREE.Vector3(0, 1.5, 0.9) });
      } else {
        g.add(cyl(0.012, 0.012, h - 0.3, metal, 0, 0.03, 0, 6));
        const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.2, 0.3, 24, 1, true), lampShade('#fff1d0'));
        shade.position.y = h - 0.15;
        g.add(shade);
        lights.push({ group: g, local: new THREE.Vector3(0, h - 0.2, 0) });
      }
      break;
    }
    case 'plantLarge': plant(g, 1.0, S, it.id); break;
    case 'plantMedium': plant(g, 0.6, S, it.id); break;
    default: g.add(box(w, h, d, mat('#cccccc')));
  }
  return g;
}

function buildTop(it, S, lights) {
  const g = new THREE.Group();
  const metal = mat(S.metal, { metalness: 0.6, roughness: 0.4 });
  switch (it.type) {
    case 'tableLamp': {
      g.add(sphere(0.09, mat(S.accent), 0, 0.09, 0));
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.15, 0.2, 24, 1, true), lampShade('#fff1d0'));
      shade.position.y = 0.3; g.add(shade);
      lights.push({ group: g, local: new THREE.Vector3(0, 0.28, 0), small: true });
      break;
    }
    case 'deskLamp': {
      g.add(cyl(0.07, 0.07, 0.02, metal));
      g.add(cyl(0.01, 0.01, 0.4, metal, 0, 0.02, 0, 6));
      const shade = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.12, 16, 1, true), lampShade(S.metal));
      shade.position.set(0, 0.42, 0.06); g.add(shade);
      lights.push({ group: g, local: new THREE.Vector3(0, 0.38, 0.08), small: true });
      break;
    }
    case 'plantSmall': plant(g, 0.35, S, it.id); break;
    case 'pcTower': {
      g.add(box(0.22, 0.46, 0.44, mat('#1d1f22', { roughness: 0.4 })));
      const fan = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.012, 8, 24), new THREE.MeshStandardMaterial({ color: '#e8a23a', emissive: '#e8a23a', emissiveIntensity: 1 }));
      fan.position.set(0, 0.3, 0.221); g.add(fan);
      const fan2 = fan.clone(); fan2.position.y = 0.14; g.add(fan2);
      break;
    }
    case 'monitor': {
      g.add(box(0.2, 0.02, 0.18, mat('#1d1f22')));
      g.add(box(0.04, 0.2, 0.03, mat('#1d1f22'), 0, 0.02, -0.04));
      const scr = box(0.86, 0.36, 0.04, mat('#15171a', { roughness: 0.3 }), 0, 0.16, -0.02);
      g.add(scr);
      break;
    }
    case 'projector': {
      g.add(box(0.26, 0.09, 0.2, mat('#f4f4f4', { roughness: 0.4 }), 0, 0.15, 0));
      g.add(cyl(0.01, 0.01, 0.15, mat('#666'), 0, 0.24, 0, 6));
      break;
    }
    case 'pendant': {
      g.add(cyl(0.005, 0.005, 0.6, mat('#222'), 0, 0.3, 0, 4));
      const shade = new THREE.Mesh(new THREE.SphereGeometry(0.22, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), lampShade(S.accent));
      shade.position.y = 0.32; g.add(shade);
      lights.push({ group: g, local: new THREE.Vector3(0, 0.2, 0) });
      break;
    }
    case 'plantHanging': {
      g.add(cyl(0.004, 0.004, 0.9, mat('#8a7a63'), 0, 0.2, 0, 4));
      const pot = new THREE.Group();
      plant(pot, 0.45, S, it.id);
      pot.scale.set(1, -0.8, 1); pot.position.y = 0.25;
      g.add(pot);
      break;
    }
  }
  return g;
}

function buildWallItem(wi, S, lights) {
  const g = new THREE.Group();
  switch (wi.type) {
    case 'frame': {
      const t = S.frameStyle === 'thick' || wi.width > 0.5 ? 0.035 : 0.022;
      const matW = wi.mat === false ? 0 : wi.mat ? Math.min(0.07, wi.width * 0.12) : 0.015;
      g.add(box(wi.width, wi.height, 0.03, mat(wi.finish || S.frame, { roughness: wi.finishName === 'brass' ? 0.35 : 0.7, metalness: wi.finishName === 'brass' ? 0.6 : 0 }), 0, 0, 0.015));
      const art = new THREE.Mesh(new THREE.PlaneGeometry(Math.max(0.02, wi.width - t * 2 - matW * 2), Math.max(0.02, wi.height - t * 2 - matW * 2)), new THREE.MeshStandardMaterial({ map: artTexture(wi.art, wi.artSeed || 1, S), roughness: 0.9 }));
      art.position.set(0, wi.height / 2, 0.031);
      const mount = new THREE.Mesh(new THREE.PlaneGeometry(wi.width - t * 2, wi.height - t * 2), mat('#fbf8f2'));
      mount.position.set(0, wi.height / 2, 0.0305);
      g.add(mount, art);
      if (wi.lean) { g.position.z += 0.05; g.rotation.x = -0.07; }
      break;
    }
    case 'shelf': {
      if (wi.ledge) {
        g.add(box(wi.width, 0.03, wi.depth, mat(S.wood), 0, 0, wi.depth / 2));
        g.add(box(wi.width, 0.035, 0.012, mat(S.wood), 0, 0.02, wi.depth - 0.006)); // lip
        break;
      }
      g.add(box(wi.width, 0.04, wi.depth, mat(S.wood), 0, 0, wi.depth / 2));
      const r = rng(wi.decor || 3);
      let x = -wi.width / 2 + 0.05;
      while (x < wi.width / 2 - 0.25) {
        const bw = 0.025 + r() * 0.03, bh = 0.14 + r() * 0.08;
        if (r() < 0.3) { x += 0.06; continue; }
        g.add(box(bw, bh, 0.15, mat(S.art[Math.floor(r() * S.art.length)]), x, 0.04, wi.depth / 2));
        x += bw + 0.003;
      }
      // trailing plant on the end
      const p = new THREE.Group();
      plant(p, 0.3, S, wi.decor || 2);
      p.position.set(wi.width / 2 - 0.12, 0.04, wi.depth / 2);
      g.add(p);
      for (let k = 0; k < 4; k++) g.add(sphere(0.035, mat('#5f8f4e'), wi.width / 2 - 0.08 - k * 0.02, -0.04 - k * 0.07, wi.depth - 0.04));
      g.add(cyl(0.035, 0.035, 0.09, mat(S.accent), x + 0.08, 0.04, wi.depth / 2));
      break;
    }
    case 'mirror': {
      const glass = new THREE.MeshStandardMaterial({ color: '#cfe0e6', metalness: 0.9, roughness: 0.08 });
      if (wi.round) {
        const r = Math.min(wi.width, wi.height) / 2;
        const ring = new THREE.Mesh(new THREE.CylinderGeometry(r, r, 0.03, 40), mat(S.metal, { metalness: 0.7, roughness: 0.3 }));
        ring.rotation.x = Math.PI / 2; ring.position.set(0, wi.height / 2, 0.015);
        const m = new THREE.Mesh(new THREE.CircleGeometry(r - 0.03, 40), glass);
        m.position.set(0, wi.height / 2, 0.031);
        g.add(ring, m);
      } else {
        g.add(box(wi.width, wi.height, 0.03, mat(S.metal, { metalness: 0.7, roughness: 0.3 }), 0, 0, 0.015));
        const m = new THREE.Mesh(new THREE.PlaneGeometry(wi.width - 0.05, wi.height - 0.05), glass);
        m.position.set(0, wi.height / 2, 0.031);
        g.add(m);
      }
      break;
    }
    case 'tv': {
      g.add(box(wi.width, wi.height, 0.05, mat('#141517', { roughness: 0.3 }), 0, 0, 0.025));
      const scr = new THREE.Mesh(new THREE.PlaneGeometry(wi.width - 0.03, wi.height - 0.03), new THREE.MeshStandardMaterial({ color: '#1c2430', roughness: 0.15, metalness: 0.4 }));
      scr.position.set(0, wi.height / 2, 0.051);
      g.add(scr);
      break;
    }
    case 'bike': {
      const tire = mat('#1e1e1e', { roughness: 0.9 });
      const frame = mat('#4f7fa6', { metalness: 0.4, roughness: 0.4 });
      const R = 0.37, zc = R + 0.0, off = wi.depth / 2;
      for (const x of [-wi.width / 2 + R, wi.width / 2 - R]) {
        const wheel = new THREE.Mesh(new THREE.TorusGeometry(R - 0.03, 0.03, 10, 40), tire);
        wheel.position.set(x, zc, off); g.add(wheel);
        const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.1, 10), mat('#888'));
        hub.rotation.x = Math.PI / 2; hub.position.set(x, zc, off); g.add(hub);
      }
      const tube = (x1, y1, x2, y2, r = 0.022) => {
        const a = new THREE.Vector3(x1, y1, off), b = new THREE.Vector3(x2, y2, off);
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, a.distanceTo(b), 8), frame);
        m.position.copy(a).add(b).multiplyScalar(0.5);
        m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
        g.add(m);
      };
      const rx = -wi.width / 2 + R, fx = wi.width / 2 - R;
      tube(rx, zc, -0.05, zc + 0.05); tube(-0.05, zc + 0.05, -0.15, zc + 0.5); tube(-0.15, zc + 0.5, fx - 0.2, zc + 0.48); tube(fx - 0.2, zc + 0.48, fx, zc); tube(-0.05, zc + 0.05, fx - 0.2, zc + 0.48);
      g.add(box(0.25, 0.05, 0.1, mat('#222'), -0.2, zc + 0.55, off));
      g.add(box(0.06, 0.06, 0.7, mat('#222'), fx - 0.18, zc + 0.6, off));
      g.add(box(0.3, 0.06, 0.06, mat('#c79b5c'), -0.05, zc + 0.45, 0.03)); // wall mount
      break;
    }
    case 'projection': {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(wi.width, wi.height), new THREE.MeshStandardMaterial({ color: '#c7cdf2', emissive: '#7f8be0', emissiveIntensity: 0.35, transparent: true, opacity: 0.75 }));
      m.position.set(0, wi.height / 2, 0.004); g.add(m);
      break;
    }
    case 'floorMirror': {
      g.add(box(wi.width, wi.height, 0.03, mat('#f3f3f3'), 0, 0, 0.04));
      const m = new THREE.Mesh(new THREE.PlaneGeometry(wi.width - 0.05, wi.height - 0.05), new THREE.MeshStandardMaterial({ color: '#cfe0e6', metalness: 0.9, roughness: 0.08 }));
      m.position.set(0, wi.height / 2, 0.056); g.add(m);
      g.rotation.x = -0.08;
      break;
    }
    case 'sign': {
      g.add(box(wi.width, wi.height, 0.01, mat('#2f5d3a'), 0, 0, 0.005));
      break;
    }
    case 'sconce': {
      g.add(box(0.08, 0.12, 0.03, mat(S.metal, { metalness: 0.6 }), 0, 0.05, 0.015));
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.14, 16, 1, true), lampShade('#fff1d0'));
      shade.position.set(0, 0.16, 0.12); g.add(shade);
      g.add(box(0.015, 0.015, 0.1, mat(S.metal), 0, 0.1, 0.07));
      lights.push({ group: g, local: new THREE.Vector3(0, 0.15, 0.12), small: true });
      break;
    }
  }
  return g;
}

export class View3D {
  constructor(container) {
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    container.appendChild(this.renderer.domElement);
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color('#e9e6e1');
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.05, 100);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.maxPolarAngle = Math.PI * 0.49;
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.wallMeshes = [];
    this.resize = this.resize.bind(this);
    this.ro = new ResizeObserver(this.resize);
    this.ro.observe(container);
    this.running = true;
    const loop = () => {
      if (!this.running) return;
      this.raf = requestAnimationFrame(loop);
      this.controls.update();
      this.updateCutaway();
      this.renderer.render(this.scene, this.camera);
    };
    loop();
  }

  resize() {
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.renderer.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  updateCutaway() {
    const cam = this.camera.position;
    for (const wm of this.wallMeshes) {
      const toCam = new THREE.Vector3(cam.x - wm.mid.x, 0, cam.z - wm.mid.z).normalize();
      const facing = toCam.x * wm.out.x + toCam.z * wm.out.z;
      const cut = facing > 0.25 && cam.y < 12;
      for (const m of wm.meshes) m.visible = !cut;
      wm.stub.visible = cut;
    }
  }

  setScene(room, design) {
    const S = surfaces(STYLES[design?.style] || STYLES.scandinavian, room);
    this.scene.remove(this.root);
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    this.root = new THREE.Group();
    this.scene.add(this.root);
    this.wallMeshes = [];
    const H = room.height || 2.5;
    const poly = room.points;
    const ws = wallsOf(poly);

    // Floor
    const shape = new THREE.Shape(poly.map((p) => new THREE.Vector2(p.x, p.y)));
    const floorGeo = new THREE.ShapeGeometry(shape);
    floorGeo.rotateX(Math.PI / 2); // (x, y) -> (x, 0, y)
    const floor = new THREE.Mesh(floorGeo, new THREE.MeshStandardMaterial({ map: floorTexture(S), roughness: S.floorType === 'carpet' ? 1 : S.floorType === 'tile' ? 0.35 : 0.7, side: THREE.DoubleSide }));
    floor.receiveShadow = true;
    this.root.add(floor);

    // Walls with openings
    const wallMat = mat(S.wall, { roughness: 0.95 });
    const stubMat = mat(S.wall, { roughness: 0.95 });
    const capMat = mat('#3a3631');
    const openings = room.openings || [];
    for (const w of ws) {
      const extA = interiorAngle(poly, w.i) < Math.PI ? WALL_T : 0;
      const extB = interiorAngle(poly, (w.i + 1) % poly.length) < Math.PI ? WALL_T : 0;
      const segs = [];
      const mine = openings.filter((o) => o.wall === w.i).sort((a, b) => a.t - b.t);
      // pieces: [t0, t1, z0, z1]
      let cur = -extA;
      for (const o of mine) {
        const s0 = o.t - o.width / 2, s1 = o.t + o.width / 2;
        const [z0, z1] = openingZ(o);
        if (s0 > cur) segs.push([cur, s0, 0, H]);
        if (z0 > 0) segs.push([s0, s1, 0, z0, o.type === 'window' ? 'sill' : null]);
        if (z1 < H) segs.push([s0, s1, z1, H]);
        if (o.type === 'window') segs.push([s0, s1, z0, z1, 'glass']);
        cur = Math.max(cur, s1);
      }
      if (cur < w.length + extB) segs.push([cur, w.length + extB, 0, H]);
      const theta = Math.atan2(w.dir.y, w.dir.x);
      const group = { meshes: [], out: { x: -w.n.x, z: -w.n.y }, mid: { x: (w.a.x + w.b.x) / 2, z: (w.a.y + w.b.y) / 2 } };
      for (const [t0, t1, z0, z1, kind] of segs) {
        const len = t1 - t0;
        if (len <= 0.001 || z1 - z0 <= 0.001) continue;
        const c = add(add(w.a, mul(w.dir, (t0 + t1) / 2)), mul(w.n, -WALL_T / 2));
        let m;
        if (kind === 'glass') {
          m = new THREE.Mesh(new THREE.BoxGeometry(len, z1 - z0, 0.02), new THREE.MeshStandardMaterial({ color: '#cfe8f5', transparent: true, opacity: 0.25, roughness: 0.05 }));
          const frameMat = mat('#f5f5f2');
          const fr = new THREE.Group();
          fr.add(box(len, 0.05, WALL_T, frameMat, 0, -(z1 - z0) / 2, 0));
          fr.add(box(len, 0.05, WALL_T, frameMat, 0, (z1 - z0) / 2 - 0.05, 0));
          fr.add(box(0.04, z1 - z0, WALL_T, frameMat, 0, -(z1 - z0) / 2, 0));
          m.add(fr);
        } else {
          m = new THREE.Mesh(new THREE.BoxGeometry(len, z1 - z0, WALL_T), wallMat);
          m.castShadow = true; m.receiveShadow = true;
        }
        m.position.set(c.x, (z0 + z1) / 2, c.y);
        m.rotation.y = -theta;
        this.root.add(m);
        group.meshes.push(m);
      }
      // cap + stub (low wall shown when cut away)
      const c = add(add(w.a, mul(w.dir, (w.length + extB - extA) / 2)), mul(w.n, -WALL_T / 2));
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w.length + extA + extB, 0.01, WALL_T), capMat);
      cap.position.set(c.x, H + 0.005, c.y); cap.rotation.y = -theta;
      this.root.add(cap); group.meshes.push(cap);
      const stub = new THREE.Mesh(new THREE.BoxGeometry(w.length + extA + extB, 0.12, WALL_T), stubMat);
      stub.position.set(c.x, 0.06, c.y); stub.rotation.y = -theta; stub.visible = false;
      this.root.add(stub); group.stub = stub;
      // door leaves
      // open doorways: casing trim + a recess behind (with clothes if it's a closet)
      for (const o of mine.filter((x) => x.type === 'door' && x.swing === 'none')) {
        const c = add(w.a, mul(w.dir, o.t));
        const g = new THREE.Group();
        const trim = mat('#f5f3ee');
        const ow = o.width, oh = openingZ(o)[1];
        g.add(box(0.06, oh, 0.02, trim, -ow / 2 - 0.03, 0, 0.01));
        g.add(box(0.06, oh, 0.02, trim, ow / 2 + 0.03, 0, 0.01));
        g.add(box(ow + 0.12, 0.06, 0.02, trim, 0, oh, 0.01));
        const depth = 0.6;
        const recess = mat('#5a554e', { roughness: 1 });
        g.add(box(ow + 0.02, oh, 0.02, recess, 0, 0, -WALL_T - depth)); // back
        g.add(box(0.02, oh, depth, recess, -ow / 2 - 0.01, 0, -WALL_T - depth / 2));
        g.add(box(0.02, oh, depth, recess, ow / 2 + 0.01, 0, -WALL_T - depth / 2));
        g.add(box(ow + 0.02, 0.02, depth, recess, 0, oh - 0.02, -WALL_T - depth / 2));
        if (/closet/i.test(o.label || '')) {
          const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, ow - 0.04, 10), mat('#9a9a9a', { metalness: 0.6 }));
          rod.rotation.z = Math.PI / 2;
          rod.position.set(0, 1.78, -WALL_T - depth / 2);
          g.add(rod);
          const cols = ['#6b3f2a', '#2f4b6b', '#7a7a72', '#a44', '#3d5a3a', '#c9b38f', '#333'];
          const r = rng(o.wall * 13 + 5);
          for (let x = -ow / 2 + 0.06; x < ow / 2 - 0.05; x += 0.07) {
            const hgt = 0.6 + r() * 0.35;
            g.add(box(0.05, hgt, 0.4, mat(cols[Math.floor(r() * cols.length)], { roughness: 1 }), x, 1.75 - hgt, -WALL_T - depth / 2));
          }
        }
        g.position.set(c.x, 0, c.y);
        g.rotation.y = -theta;
        this.root.add(g);
        group.meshes.push(g);
      }
      for (const o of mine.filter((x) => x.type === 'door' && x.swing !== 'none')) {
        const hingeT = o.hinge === 'right' ? o.t + o.width / 2 : o.t - o.width / 2;
        const hp = add(w.a, mul(w.dir, hingeT));
        const leaf = new THREE.Group();
        const panel = box(o.width - 0.02, 2.05, 0.04, mat('#f2efe9'), (o.hinge === 'right' ? -1 : 1) * (o.width / 2), 0, 0);
        leaf.add(panel);
        leaf.position.set(hp.x, 0, hp.y);
        leaf.rotation.y = -theta + (o.hinge === 'right' ? 1 : -1) * 0.6;
        this.root.add(leaf);
      }
      this.wallMeshes.push(group);
    }

    // Lights
    this.scene.children.filter((c) => c.isLight).forEach((l) => this.scene.remove(l));
    const hemi = new THREE.HemisphereLight('#ffffff', '#b9a68e', 1.6);
    this.scene.add(hemi);
    const ctr = centroid(poly);
    const sun = new THREE.DirectionalLight('#fff4e0', 2.2);
    const win = openings.find((o) => o.type === 'window');
    let sunDir = new THREE.Vector3(-3, 6, -2);
    if (win && ws[win.wall]) {
      const n = ws[win.wall].n;
      sunDir = new THREE.Vector3(-n.x * 4, 5, -n.y * 4);
    }
    sun.position.set(ctr.x + sunDir.x, sunDir.y, ctr.y + sunDir.z);
    sun.target.position.set(ctr.x, 0, ctr.y);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    const bnd = polygonBounds(poly);
    const ext = Math.max(bnd.w, bnd.h);
    Object.assign(sun.shadow.camera, { left: -ext, right: ext, top: ext, bottom: -ext, near: 0.5, far: 30 });
    sun.shadow.bias = -0.0005;
    this.scene.add(sun, sun.target);

    const lampAnchors = [];
    if (design) {
      for (const it of design.items) {
        const g = buildItem(it, S, lampAnchors);
        g.position.set(it.x, 0, it.y);
        g.rotation.y = -it.theta;
        this.root.add(g);
      }
      for (const t of design.topItems) {
        const g = buildTop(t, S, lampAnchors);
        g.position.set(t.x, t.z || 0, t.y);
        g.rotation.y = -(t.theta || 0);
        this.root.add(g);
      }
      for (const wi of design.wallItems) {
        const w = ws[wi.wall];
        if (!w) continue;
        const p = add(w.a, mul(w.dir, wi.t));
        const g = buildWallItem(wi, S, lampAnchors);
        g.position.set(p.x, wi.z, p.y);
        g.rotation.y = -Math.atan2(w.dir.y, w.dir.x);
        this.root.add(g);
      }
    }
    this.root.updateMatrixWorld(true);
    for (const la of lampAnchors.slice(0, 8)) {
      const pl = new THREE.PointLight('#ffcf8a', la.small ? 1.2 : 2.5, la.small ? 2.5 : 4.5, 2);
      pl.position.copy(la.local).applyMatrix4(la.group.matrixWorld);
      this.scene.add(pl);
    }

    // Camera: look in through the open side
    const dist = Math.max(bnd.w, bnd.h) * 1.35 + 2;
    this.controls.target.set(ctr.x, 0.8, ctr.y);
    if (!this.cameraPlaced) {
      this.camera.position.set(ctr.x + dist * 0.55, dist * 0.85, ctr.y + dist * 0.75);
      this.cameraPlaced = true;
    }
    this.resize();
  }

  snapshot() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }

  dispose() {
    this.running = false;
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }
}
