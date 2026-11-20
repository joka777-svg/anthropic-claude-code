/* Raumaufmaß – Grundrisse zeichnen, Bodenfläche & Sockelleisten berechnen, PDF-Export.
 * Reines JavaScript ohne Build-Schritt. Läuft als Web-App (PWA) und in der iOS-App (Capacitor).
 * Koordinaten der Räume in Metern, mathematisches System (y nach oben).
 */
'use strict';
(function () {
  // ---------------------------------------------------------------- Helfer
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const deg = (r) => (r * 180) / Math.PI;
  const rad = (d) => (d * Math.PI) / 180;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const fmt = (v, d = 2) =>
    (Number.isFinite(v) ? v : 0).toLocaleString('de-DE', { minimumFractionDigits: d, maximumFractionDigits: d });
  const fmtIn = (v, d = 2) => (Number.isFinite(v) ? (Math.round(v * 10 ** d) / 10 ** d).toString().replace('.', ',') : '');
  const num = (s) => {
    if (typeof s === 'number') return s;
    const t = String(s ?? '').trim().replace(/\s/g, '').replace(',', '.');
    if (t === '') return NaN;
    const v = Number(t);
    return Number.isFinite(v) ? v : NaN;
  };
  const esc = (s) =>
    String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const letter = (i) => {
    let s = '';
    i++;
    while (i > 0) {
      const m = (i - 1) % 26;
      s = String.fromCharCode(65 + m) + s;
      i = Math.floor((i - 1) / 26);
    }
    return s;
  };
  const r4 = (v) => Math.round(v * 10000) / 10000;
  const roundPt = (p) => ({ x: r4(p.x), y: r4(p.y) });

  let toastTimer = null;
  let toastAction = null;
  function toast(msg, actionLabel, action) {
    const t = $('#toast');
    t.textContent = msg;
    toastAction = action || null;
    t.classList.toggle('has-action', !!action);
    if (action) {
      const b = document.createElement('button');
      b.className = 'toast-action';
      b.textContent = actionLabel;
      b.addEventListener('click', () => { const fn = toastAction; toastAction = null; t.classList.remove('show'); if (fn) fn(); });
      t.appendChild(b);
    }
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.classList.remove('show'); toastAction = null; }, action ? 6000 : 2600);
  }

  // ---------------------------------------------------------------- Geometrie
  const G = {
    signedArea(p) {
      let a = 0;
      for (let i = 0; i < p.length; i++) {
        const q = p[i], r = p[(i + 1) % p.length];
        a += q.x * r.y - r.x * q.y;
      }
      return a / 2;
    },
    area: (p) => Math.abs(G.signedArea(p)),
    len: (a, b) => Math.hypot(b.x - a.x, b.y - a.y),
    perimeter(p) {
      let s = 0;
      for (let i = 0; i < p.length; i++) s += G.len(p[i], p[(i + 1) % p.length]);
      return s;
    },
    walls(p) {
      return p.map((a, i) => {
        const b = p[(i + 1) % p.length];
        const len = G.len(a, b);
        const u = len > 0 ? { x: (b.x - a.x) / len, y: (b.y - a.y) / len } : { x: 1, y: 0 };
        return { i, a, b, len, u };
      });
    },
    orient: (p) => (G.signedArea(p) >= 0 ? 1 : -1),
    dir: (a, b) => Math.atan2(b.y - a.y, b.x - a.x),
    normDeg(d) {
      while (d <= -180) d += 360;
      while (d > 180) d -= 360;
      return d;
    },
    /** Innenwinkel an jeder Ecke (Grad). */
    interiorAngles(p) {
      const s = G.orient(p), n = p.length;
      return p.map((v, i) => {
        const prev = p[(i - 1 + n) % n], next = p[(i + 1) % n];
        const turn = G.normDeg(deg(G.dir(v, next) - G.dir(prev, v)));
        return 180 - s * turn;
      });
    },
    bounds(p) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const q of p) {
        minX = Math.min(minX, q.x); maxX = Math.max(maxX, q.x);
        minY = Math.min(minY, q.y); maxY = Math.max(maxY, q.y);
      }
      return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
    },
    inside(pt, p) {
      let c = false;
      for (let i = 0, j = p.length - 1; i < p.length; j = i++) {
        if ((p[i].y > pt.y) !== (p[j].y > pt.y) &&
            pt.x < ((p[j].x - p[i].x) * (pt.y - p[i].y)) / (p[j].y - p[i].y) + p[i].x) c = !c;
      }
      return c;
    },
    segDist(pt, a, b) {
      const dx = b.x - a.x, dy = b.y - a.y, L2 = dx * dx + dy * dy;
      let t = L2 ? ((pt.x - a.x) * dx + (pt.y - a.y) * dy) / L2 : 0;
      t = clamp(t, 0, 1);
      const x = a.x + t * dx, y = a.y + t * dy;
      return { t, d: Math.hypot(pt.x - x, pt.y - y), x, y };
    },
    /** Gut sichtbarer Punkt im Inneren (für die Flächenbeschriftung, auch bei L-Formen). */
    labelPoint(p) {
      const b = G.bounds(p);
      let best = null, bestD = -1;
      const N = 24;
      for (let i = 1; i < N; i++) {
        for (let j = 1; j < N; j++) {
          const pt = { x: b.minX + (b.w * i) / N, y: b.minY + (b.h * j) / N };
          if (!G.inside(pt, p)) continue;
          let d = Infinity;
          for (let k = 0; k < p.length; k++) d = Math.min(d, G.segDist(pt, p[k], p[(k + 1) % p.length]).d);
          if (d > bestD) { bestD = d; best = pt; }
        }
      }
      return best || { x: b.minX + b.w / 2, y: b.minY + b.h / 2 };
    },
    segIntersect(a, b, c, d) {
      const o = (p, q, r) => Math.sign((q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x));
      return o(a, b, c) * o(a, b, d) < 0 && o(c, d, a) * o(c, d, b) < 0;
    },
    selfIntersects(p) {
      const n = p.length;
      for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
          if (j === i + 1 || (i === 0 && j === n - 1)) continue;
          if (G.segIntersect(p[i], p[(i + 1) % n], p[j], p[(j + 1) % n])) return true;
        }
      }
      return false;
    },
    isOrtho(p) {
      if (p.length < 4) return false;
      return G.interiorAngles(p).every((a) => Math.abs(a - 90) < 0.05 || Math.abs(a - 270) < 0.05);
    },
  };

  // ---------------------------------------------------------------- Formen
  const Shapes = {
    rect: (a, b) => [{ x: 0, y: 0 }, { x: a, y: 0 }, { x: a, y: b }, { x: 0, y: b }],
    trap: (a, b, h, o) => [{ x: 0, y: 0 }, { x: a, y: 0 }, { x: o + b, y: h }, { x: o, y: h }],
    L(a, b, c, d) {
      if (!(c < a && d < b)) throw new Error('Der Ausschnitt muss kleiner als der Raum sein.');
      return [{ x: 0, y: 0 }, { x: a, y: 0 }, { x: a, y: b - d }, { x: a - c, y: b - d }, { x: a - c, y: b }, { x: 0, y: b }];
    },
    /** Viereck aus 4 Seiten und Diagonale A–C (Triangulation). */
    quad(a, b, c, d, e) {
      const tri = (x, y, z) => x + y > z && x + z > y && y + z > x;
      if (!tri(a, b, e)) throw new Error('Maße passen nicht: a, b und Diagonale e bilden kein Dreieck.');
      if (!tri(c, d, e)) throw new Error('Maße passen nicht: c, d und Diagonale e bilden kein Dreieck.');
      const cx = (e * e - b * b + a * a) / (2 * a);
      const cy = Math.sqrt(Math.max(0, e * e - cx * cx));
      const C = { x: cx, y: cy };
      const u = { x: cx / e, y: cy / e };
      const t = (d * d - c * c + e * e) / (2 * e);
      const h = Math.sqrt(Math.max(0, d * d - t * t));
      const D = { x: u.x * t - u.y * h, y: u.y * t + u.x * h };
      return [{ x: 0, y: 0 }, { x: a, y: 0 }, C, D];
    },
  };

  // ---------------------------------------------------------------- Aufmaß-Rechner
  /* Bringt eine grobe Skizze auf die gemessenen Längen (Laser).
   * Ausgleichsrechnung (Levenberg-Marquardt) über alle Eckpunkte:
   *  - gemessene Wände und Diagonalen: harte Bedingungen
   *  - Winkel: nahezu rechte Winkel der Skizze werden als 90° angenommen (Option), sonst Winkel der Skizze (weich)
   *  - ungemessene Wände: sehr weich an die Skizze gebunden */
  const Solver = {
    snapRight(a, tol = 10) {
      if (Math.abs(a - 90) <= tol) return 90;
      if (Math.abs(a - 270) <= tol) return 270;
      return null;
    },
    linSolve(A, b) {
      const n = b.length;
      const M = A.map((row, i) => row.concat([b[i]]));
      for (let c = 0; c < n; c++) {
        let piv = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[piv][c])) piv = r;
        if (Math.abs(M[piv][c]) < 1e-14) return null;
        [M[c], M[piv]] = [M[piv], M[c]];
        for (let r = c + 1; r < n; r++) {
          const f = M[r][c] / M[c][c];
          if (f) for (let k = c; k <= n; k++) M[r][k] -= f * M[c][k];
        }
      }
      const x = new Array(n).fill(0);
      for (let r = n - 1; r >= 0; r--) {
        let s = M[r][n];
        for (let k = r + 1; k < n; k++) s -= M[r][k] * x[k];
        x[r] = s / M[r][r];
      }
      return x;
    },
    solve(sketch, meas) {
      const n = sketch.length;
      const s = G.orient(sketch);
      const sk = G.walls(sketch).map((w) => w.len);
      const angS = G.interiorAngles(sketch);
      const mw = (i) => (meas.walls[i] > 0 ? meas.walls[i] : 0);
      const diags = meas.diags.filter((d) => d.len > 0 && d.a !== d.b && d.a < n && d.b < n);
      // Maßstab der Skizze an die Messwerte angleichen (Median)
      const ratios = [];
      for (let i = 0; i < n; i++) if (mw(i) && sk[i] > 1e-6) ratios.push(mw(i) / sk[i]);
      diags.forEach((d) => { const l = G.len(sketch[d.a], sketch[d.b]); if (l > 1e-6) ratios.push(d.len / l); });
      ratios.sort((x, y) => x - y);
      const k = ratios.length ? ratios[Math.floor(ratios.length / 2)] : 1;
      const p0 = sketch[0];
      const start = sketch.map((q) => ({ x: p0.x + (q.x - p0.x) * k, y: p0.y + (q.y - p0.y) * k }));
      const skLen = sk.map((l) => l * k);
      let snapped = 0;
      const targets = angS.map((a) => {
        const r = meas.ortho ? Solver.snapRight(a) : null;
        if (r != null) { snapped++; return { v: rad(r), w: 3 }; }
        return { v: rad(a), w: 0.3 };
      });
      const u0 = G.walls(start)[0].u;
      const X0 = start[0];
      const P = (x, i) => { i = ((i % n) + n) % n; return { x: x[2 * i], y: x[2 * i + 1] }; };
      const resid = (x) => {
        const out = [];
        for (let i = 0; i < n; i++) {
          const L = G.len(P(x, i), P(x, i + 1));
          out.push(mw(i) ? 100 * (L - mw(i)) : 0.05 * (L - skLen[i]));
        }
        diags.forEach((d) => out.push(100 * (G.len(P(x, d.a), P(x, d.b)) - d.len)));
        for (let i = 0; i < n; i++) {
          const a = P(x, i - 1), b = P(x, i), c = P(x, i + 1);
          const d1x = b.x - a.x, d1y = b.y - a.y, d2x = c.x - b.x, d2y = c.y - b.y;
          const turn = Math.atan2(d1x * d2y - d1y * d2x, d1x * d2x + d1y * d2y);
          out.push(targets[i].w * (Math.PI - s * turn - targets[i].v));
        }
        out.push(100 * (x[0] - X0.x), 100 * (x[1] - X0.y));
        const p1 = P(x, 1);
        out.push(100 * (u0.x * (p1.y - x[1]) - u0.y * (p1.x - x[0])));
        return out;
      };
      const cost = (r) => r.reduce((t, v) => t + v * v, 0);
      let x = start.flatMap((q) => [q.x, q.y]);
      let r = resid(x), c = cost(r), lambda = 1e-3;
      const N = x.length;
      for (let it = 0; it < 150 && c > 1e-16; it++) {
        const J = r.map(() => new Array(N).fill(0));
        for (let j = 0; j < N; j++) {
          const h = 1e-7;
          const xh = x.slice(); xh[j] += h;
          const rh = resid(xh);
          for (let i = 0; i < r.length; i++) J[i][j] = (rh[i] - r[i]) / h;
        }
        const A = Array.from({ length: N }, () => new Array(N).fill(0));
        const g = new Array(N).fill(0);
        for (let i = 0; i < r.length; i++) {
          const Ji = J[i];
          for (let p = 0; p < N; p++) {
            if (!Ji[p]) continue;
            g[p] += Ji[p] * r[i];
            for (let q = 0; q < N; q++) A[p][q] += Ji[p] * Ji[q];
          }
        }
        let improved = false;
        for (let tries = 0; tries < 12; tries++) {
          const Ad = A.map((row, p) => row.map((v, q) => (p === q ? v + lambda * (v + 1e-9) : v)));
          const d = Solver.linSolve(Ad, g.map((v) => -v));
          if (!d) { lambda *= 10; continue; }
          const xn = x.map((v, i) => v + d[i]);
          const rn = resid(xn), cn = cost(rn);
          if (cn < c) {
            const gain = c - cn;
            x = xn; r = rn; c = cn; lambda = Math.max(lambda / 3, 1e-9); improved = true;
            if (gain < 1e-14) it = 1e9;
            break;
          }
          lambda *= 4;
        }
        if (!improved) break;
      }
      const pts = Array.from({ length: n }, (_, i) => roundPt(P(x, i)));
      let maxDev = 0;
      for (let i = 0; i < n; i++) if (mw(i)) maxDev = Math.max(maxDev, Math.abs(G.len(pts[i], pts[(i + 1) % n]) - mw(i)));
      diags.forEach((d) => { maxDev = Math.max(maxDev, Math.abs(G.len(pts[d.a], pts[d.b]) - d.len)); });
      const measured = Array.from({ length: n }, (_, i) => mw(i)).filter(Boolean).length;
      // Wie stark weichen die als 90° angenommenen Ecken ab? (z. B. gegenüberliegende Wände unterschiedlich lang)
      const angR = G.interiorAngles(pts);
      let angDev = 0;
      targets.forEach((t, i) => { if (t.w === 3) angDev = Math.max(angDev, Math.abs(angR[i] - deg(t.v))); });
      const missingDiag = Math.max(0, 2 * n - 3 - (n + diags.length + Math.min(snapped, n - 1)));
      return { points: pts, maxDev, angDev, measured, missingDiag, snapped };
    },
  };

  /** Messwerte anwenden: Skizze merken und auf die Messwerte bringen. */
  function applyMeasure(r) {
    const m = r.meas;
    const n = r.points.length;
    if (n < 3) return null;
    if (!m.sketch || m.sketch.length !== n) m.sketch = r.points.map((q) => ({ x: q.x, y: q.y }));
    const any = m.walls.some((v) => v > 0) || m.diags.some((d) => d.len > 0);
    if (!any) { r.points = m.sketch.map(roundPt); return null; }
    const res = Solver.solve(m.sketch, m);
    r.points = res.points;
    return res;
  }
  function measInfo(r) {
    const m = r.meas, n = r.points.length;
    if (n < 3) return null;
    const sketch = m.sketch && m.sketch.length === n ? m.sketch : r.points;
    const any = m.walls.some((v) => v > 0) || m.diags.some((d) => d.len > 0);
    if (!any) return { measured: 0, maxDev: 0, missingDiag: 0, sketch };
    const res = Solver.solve(sketch, m);
    return Object.assign(res, { sketch });
  }
  /** Alle Diagonalen eines Raums (Ecke zu Ecke, nicht benachbart) mit berechnetem und gemessenem Wert. */
  function allDiags(r) {
    const p = r.points, n = p.length, out = [];
    if (n < 4) return out;
    for (let a = 0; a < n; a++) {
      for (let b = a + 2; b < n; b++) {
        if (a === 0 && b === n - 1) continue;
        const m = r.meas.diags.find((d) => d.len > 0 && Math.min(d.a, d.b) === a && Math.max(d.a, d.b) === b);
        const calc = G.len(p[a], p[b]);
        out.push({ a, b, calc, meas: m ? m.len : 0, dev: m ? calc - m.len : 0 });
      }
    }
    return out;
  }
  /** Laserwert lesen: „4,235“, „4.235 m“, „423,5 cm“, „4235 mm“; ohne Einheit: > 30 → cm, > 3000 → mm. */
  function parseLaser(s) {
    const t = String(s ?? '').trim().toLowerCase().replace(/\s/g, '');
    const mt = t.match(/-?\d+(?:[.,]\d+)?/);
    if (!mt) return NaN;
    let v = Number(mt[0].replace(',', '.'));
    if (/mm/.test(t)) v /= 1000;
    else if (/cm/.test(t)) v /= 100;
    else if (!/m/.test(t)) { if (v > 3000) v /= 1000; else if (v > 30) v /= 100; }
    return v;
  }
  /** Bei manueller Änderung der Geometrie: Skizze verwerfen (Messwerte bleiben erhalten). */
  const dropSketch = (r) => { if (r && r.meas) r.meas.sketch = null; };

  // ---------------------------------------------------------------- Daten
  const STORE = 'raumaufmass.db.v1';
  const DEFAULT_DOOR = 0.86;

  function newProject(name = 'Neues Projekt') {
    return {
      id: uid(), name, client: '', address: '', author: '', note: '',
      date: new Date().toISOString().slice(0, 10),
      wasteArea: 10, wasteSkirt: 10, piece: 2.4,
      rooms: [], activeRoom: null, created: Date.now(), updated: Date.now(),
    };
  }
  function newRoom(name, points) {
    return { id: uid(), name, points: (points || []).map(roundPt), doors: [], extras: [], meas: newMeas() };
  }
  function newMeas() {
    return { walls: [], diags: [], ortho: true, sketch: null };
  }
  function newDoor(wall, pos, width = DEFAULT_DOOR) {
    return { id: uid(), name: 'Tür', wall, pos: r4(pos), width, reveal: 0, revealSkirting: false, revealArea: false, hingeEnd: false, swingOut: false };
  }
  function demoProject() {
    const p = newProject('Beispielprojekt');
    const r1 = newRoom('Wohnzimmer', Shapes.L(6.2, 5.1, 2.3, 1.8));
    r1.doors.push(Object.assign(newDoor(0, 1.2), { name: 'Flurtür' }));
    const r2 = newRoom('Schlafzimmer (schief)', Shapes.quad(4.2, 3.6, 3.7, 3.4, 5.35));
    r2.doors.push(Object.assign(newDoor(3, 0.6), { name: 'Tür' }));
    r2.extras.push({ id: uid(), name: 'Kaminschacht', kind: 'sub', w: 0.4, d: 0.4, count: 1, skirt: true });
    p.rooms.push(r1, r2);
    p.activeRoom = r1.id;
    return p;
  }
  function normalizeProject(p) {
    const d = newProject();
    for (const k of Object.keys(d)) if (p[k] === undefined) p[k] = d[k];
    p.rooms = (p.rooms || []).map((r) => ({
      id: r.id || uid(), name: r.name || 'Raum', points: (r.points || []).map((q) => ({ x: +q.x || 0, y: +q.y || 0 })),
      doors: (r.doors || []).map((x) => Object.assign(newDoor(0, 0), x)),
      extras: (r.extras || []).map((x) => Object.assign({ id: uid(), name: 'Abzug', kind: 'sub', w: 0, d: 0, count: 1, skirt: false }, x)),
      meas: Object.assign(newMeas(), r.meas || {}),
    }));
    p.openings = Array.isArray(p.openings) ? p.openings : [];
    return p;
  }
  function loadDb() {
    try {
      const s = localStorage.getItem(STORE);
      if (s) {
        const d = JSON.parse(s);
        if (d && d.projects && (Object.keys(d.projects).length || d.seeded)) {
          Object.values(d.projects).forEach(normalizeProject);
          return d;
        }
      }
    } catch (e) { /* leer oder defekt -> neu */ }
    const p = demoProject();
    return { projects: { [p.id]: p }, current: p.id, seeded: true };
  }

  let db = loadDb();
  db.seeded = true;
  let P = db.projects[db.current] || Object.values(db.projects)[0] || newProject('Neues Projekt');

  function persist() {
    P.updated = Date.now();
    db.current = P.id;
    try { localStorage.setItem(STORE, JSON.stringify(db)); } catch (e) { toast('Speichern fehlgeschlagen'); }
  }

  const ui = {
    tab: 'measure',
    screen: 'projects',
    ovTab: 'rooms',
    openingId: null,
    showDiag: false,
    measIdx: 0,
    mode: 'edit',
    sel: null, // {type:'wall'|'vertex'|'door', i|id}
    snap: true,
    grid: 0.05,
    draft: [],
    draftPreview: null,
    view: { cx: 0, cy: 0, k: 50 },
  };

  const room = () => P.rooms.find((r) => r.id === P.activeRoom) || P.rooms[0] || null;

  // Rückgängig
  const undoStack = [];
  function snapshot() {
    undoStack.push(JSON.stringify({ id: P.id, p: P }));
    if (undoStack.length > 80) undoStack.shift();
  }
  function undo() {
    if (ui.mode === 'draw' && ui.draft.length) { ui.draft.pop(); renderAll(); return; }
    while (undoStack.length) {
      const s = JSON.parse(undoStack.pop());
      if (s.id !== P.id) continue;
      P = db.projects[P.id] = normalizeProject(s.p);
      ui.sel = null;
      persist();
      renderAll();
      toast('Rückgängig gemacht');
      return;
    }
    toast('Nichts mehr rückgängig zu machen');
  }
  function mutate(fn, opts = {}) {
    if (opts.snap !== false) snapshot();
    fn();
    persist();
    renderAll();
  }

  // ---------------------------------------------------------------- Berechnung
  function calcRoom(r) {
    const p = r.points;
    const valid = p.length >= 3;
    const walls = valid ? G.walls(p) : [];
    const base = valid ? G.area(p) : 0;
    const perim = valid ? G.perimeter(p) : 0;
    let doorW = 0, revealSk = 0, revealA = 0;
    const doors = r.doors.map((d) => {
      const w = walls[d.wall];
      if (!w) return Object.assign({}, d, { eff: 0, effPos: 0 });
      const effPos = clamp(d.pos, 0, w.len);
      const eff = clamp(d.width, 0, w.len - effPos);
      doorW += eff;
      const rv = Math.max(0, d.reveal || 0);
      if (d.revealSkirting) revealSk += 2 * rv;
      if (d.revealArea) revealA += eff * rv;
      return Object.assign({}, d, { eff, effPos });
    });
    let sub = 0, add = 0, exSk = 0;
    const extras = r.extras.map((x) => {
      const n = Math.max(0, Math.round(x.count || 0));
      const a = Math.max(0, x.w || 0) * Math.max(0, x.d || 0) * n;
      let sk = 0;
      if (x.skirt) sk = x.kind === 'add' ? 2 * Math.max(0, x.d || 0) * n : 2 * (Math.max(0, x.w || 0) + Math.max(0, x.d || 0)) * n;
      if (x.kind === 'add') add += a; else sub += a;
      exSk += sk;
      return Object.assign({}, x, { area: a, sk });
    });
    const net = Math.max(0, base - sub + add + revealA);
    const skirting = Math.max(0, perim - doorW + revealSk + exSk);
    return {
      valid, walls, base, perim, doorW, revealSk, revealA, sub, add, exSk, net, skirting, doors, extras,
      angles: valid ? G.interiorAngles(p) : [],
      selfX: valid && G.selfIntersects(p),
    };
  }
  function calcProject(p = P) {
    const rooms = p.rooms.map((r) => ({ r, c: calcRoom(r) }));
    const net = rooms.reduce((s, x) => s + x.c.net, 0);
    const skirting = rooms.reduce((s, x) => s + x.c.skirting, 0);
    const netW = net * (1 + (p.wasteArea || 0) / 100);
    const skW = skirting * (1 + (p.wasteSkirt || 0) / 100);
    const pieces = p.piece > 0 ? Math.ceil(skW / p.piece - 1e-9) : 0;
    return { rooms, net, skirting, netW, skW, pieces };
  }

  // ---------------------------------------------------------------- Geometrie bearbeiten
  function editWall(r, idx, newLen, newAng) {
    const p = r.points, n = p.length;
    if (n < 3 || idx < 0 || idx > n - 2) return;
    dropSketch(r);
    const walls = G.walls(p);
    if (newLen != null && newAng == null && G.isOrtho(p)) {
      // Rechtwinklige Räume: "Strecken" – alles jenseits der Wand verschieben, rechte Winkel bleiben erhalten.
      const w = walls[idx], delta = newLen - w.len;
      const ref = w.b.x * w.u.x + w.b.y * w.u.y;
      r.points = p.map((q) => ((q.x * w.u.x + q.y * w.u.y) >= ref - 1e-6 ? roundPt({ x: q.x + w.u.x * delta, y: q.y + w.u.y * delta }) : q));
      return;
    }
    // Wandzug: Wände nacheinander mit Länge und Innenwinkel, die letzte Wand schließt automatisch.
    const s = G.orient(p);
    const lens = walls.map((w) => w.len);
    const angs = G.interiorAngles(p);
    if (newLen != null) lens[idx] = newLen;
    if (newAng != null) angs[idx] = newAng;
    let dir = G.dir(p[0], p[1]);
    let cur = { x: p[0].x, y: p[0].y };
    const out = [cur];
    for (let i = 0; i < n - 1; i++) {
      if (i > 0) dir += s * rad(180 - angs[i]);
      cur = { x: cur.x + lens[i] * Math.cos(dir), y: cur.y + lens[i] * Math.sin(dir) };
      out.push(cur);
    }
    r.points = out.map(roundPt);
  }

  function splitWall(r, i, t = 0.5) {
    const walls = G.walls(r.points);
    const w = walls[i];
    if (!w) return;
    const L1 = w.len * t;
    const np = roundPt({ x: w.a.x + w.u.x * L1, y: w.a.y + w.u.y * L1 });
    r.points.splice(i + 1, 0, np);
    const m = r.meas;
    if (m) {
      while (m.walls.length < r.points.length - 1) m.walls.push(0);
      m.walls.splice(i, 1, 0, 0); // geteilte Wand muss neu gemessen werden
      m.diags.forEach((d) => { if (d.a > i) d.a++; if (d.b > i) d.b++; });
      m.sketch = null;
    }
    r.doors.forEach((d) => {
      if (d.wall > i) d.wall++;
      else if (d.wall === i && d.pos >= L1 - 1e-6) { d.wall = i + 1; d.pos = r4(d.pos - L1); }
    });
    return i + 1;
  }

  function deleteVertex(r, v) {
    const n = r.points.length;
    if (n <= 3) { toast('Ein Raum braucht mindestens 3 Ecken'); return false; }
    const walls = G.walls(r.points);
    const prev = (v - 1 + n) % n;
    const map = (oldStart) => (oldStart < v ? oldStart : oldStart - 1);
    r.doors.forEach((d) => {
      if (d.wall === prev) d.wall = map(prev);
      else if (d.wall === v) { d.pos = r4(d.pos + walls[prev].len); d.wall = map(prev); }
      else d.wall = map(d.wall);
    });
    r.points.splice(v, 1);
    const m = r.meas;
    if (m) {
      while (m.walls.length < n) m.walls.push(0);
      m.walls.splice(v, 1);
      m.walls[map(prev)] = 0; // zusammengelegte Wand neu messen
      m.diags = m.diags.filter((d) => d.a !== v && d.b !== v).map((d) => ({ ...d, a: d.a > v ? d.a - 1 : d.a, b: d.b > v ? d.b - 1 : d.b }));
      m.sketch = null;
    }
    return true;
  }

  // ---------------------------------------------------------------- Plan (SVG)
  const svg = $('#plan');
  let W = 300, H = 300;
  const toS = (p) => ({ x: (p.x - ui.view.cx) * ui.view.k + W / 2, y: -(p.y - ui.view.cy) * ui.view.k + H / 2 });
  const toW = (sx, sy) => ({ x: (sx - W / 2) / ui.view.k + ui.view.cx, y: -(sy - H / 2) / ui.view.k + ui.view.cy });

  function resize() {
    if (ui.screen !== 'room') return;
    const rc = svg.getBoundingClientRect();
    if (rc.width < 10 || rc.height < 10) return;
    W = rc.width;
    H = rc.height;
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    renderPlan();
  }
  function fit() {
    const r = room();
    const pts = r && r.points.length >= 2 ? r.points : null;
    if (!pts) { ui.view = { cx: 2.5, cy: 2, k: Math.min(W, H) / 7 }; return; }
    const b = G.bounds(pts);
    const padX = 56, padTop = 84, padBot = 70;
    const k = Math.min((W - 2 * padX) / Math.max(b.w, 0.5), (H - padTop - padBot) / Math.max(b.h, 0.5));
    ui.view = { cx: (b.minX + b.maxX) / 2, cy: (b.minY + b.maxY) / 2 + (padBot - padTop) / 2 / Math.max(k, 1), k: clamp(k, 5, 1500) };
  }

  function arcPoints(center, from, to, steps = 14) {
    const a0 = Math.atan2(from.y - center.y, from.x - center.x);
    let a1 = Math.atan2(to.y - center.y, to.x - center.x);
    let da = G.normDeg(deg(a1 - a0));
    const rr = G.len(center, from);
    const out = [];
    for (let i = 0; i <= steps; i++) {
      const a = a0 + rad((da * i) / steps);
      out.push({ x: center.x + rr * Math.cos(a), y: center.y + rr * Math.sin(a) });
    }
    return out;
  }
  /** Türgeometrie in Weltkoordinaten. */
  function doorGeom(r, d, c) {
    const w = c.walls[d.wall];
    if (!w) return null;
    const s = G.orient(r.points);
    const dd = c.doors.find((x) => x.id === d.id);
    const pos = dd.effPos, wid = dd.eff;
    const start = { x: w.a.x + w.u.x * pos, y: w.a.y + w.u.y * pos };
    const end = { x: start.x + w.u.x * wid, y: start.y + w.u.y * wid };
    let nIn = { x: -w.u.y * s, y: w.u.x * s };
    if (d.swingOut) nIn = { x: -nIn.x, y: -nIn.y };
    const hinge = d.hingeEnd ? end : start;
    const other = d.hingeEnd ? start : end;
    const leaf = { x: hinge.x + nIn.x * wid, y: hinge.y + nIn.y * wid };
    return { start, end, hinge, leaf, arc: arcPoints(hinge, leaf, other) };
  }

  function textAlong(a, b) {
    let ang = deg(Math.atan2(b.y - a.y, b.x - a.x));
    if (ang > 90) ang -= 180;
    if (ang < -90) ang += 180;
    return ang;
  }

  function renderPlan() {
    const r = room();
    const parts = [];
    // Raster
    const tl = toW(0, 0), br = toW(W, H);
    const k = ui.view.k;
    const minor = k >= 80 ? 0.1 : k >= 25 ? 0.5 : 1;
    const major = k >= 12 ? 1 : 5;
    const lines = (step, cls) => {
      if (step * k < 6) return;
      let s = '';
      for (let x = Math.floor(tl.x / step) * step; x <= br.x; x += step) { const sx = toS({ x, y: 0 }).x; s += `M${sx.toFixed(1)} 0V${H}`; }
      for (let y = Math.floor(br.y / step) * step; y <= tl.y; y += step) { const sy = toS({ x: 0, y }).y; s += `M0 ${sy.toFixed(1)}H${W}`; }
      parts.push(`<path class="${cls}" d="${s}"/>`);
    };
    lines(minor, 'g-minor');
    lines(major, 'g-major');

    $('#emptyHint').hidden = !!r;
    if (r) {
      const p = r.points;
      const c = calcRoom(r);
      if (p.length >= 3) {
        const sp = p.map(toS);
        parts.push(`<polygon class="floor${c.selfX ? ' bad' : ''}" points="${sp.map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ')}"/>`);
        // Wände
        c.walls.forEach((w, i) => {
          const a = toS(w.a), b = toS(w.b);
          const sel = ui.sel && ui.sel.type === 'wall' && ui.sel.i === i;
          parts.push(`<line class="wall${sel ? ' sel' : ''}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`);
        });
        // Trefferflächen der Wände (Türen liegen darüber und haben eine eigene Trefferlinie)
        const hits = c.walls.map((w, i) => {
          const a = toS(w.a), b = toS(w.b);
          return `<line class="wall-hit" data-wall="${i}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`;
        });
        parts.push(...hits);
        // Türen
        r.doors.forEach((d) => {
          const g = doorGeom(r, d, c);
          if (!g) return;
          const s1 = toS(g.start), s2 = toS(g.end), h = toS(g.hinge), lf = toS(g.leaf);
          const arc = g.arc.map(toS).map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');
          const sel = ui.sel && ui.sel.type === 'door' && ui.sel.id === d.id;
          parts.push(`<g class="${sel ? 'door-sel' : ''}">
            <line class="door-gap" x1="${s1.x}" y1="${s1.y}" x2="${s2.x}" y2="${s2.y}"/>
            <line class="door-line" x1="${s1.x}" y1="${s1.y}" x2="${s2.x}" y2="${s2.y}" stroke-dasharray="2 3"/>
            <line class="door-line" x1="${h.x}" y1="${h.y}" x2="${lf.x}" y2="${lf.y}"/>
            <polyline class="door-arc" points="${arc}"/>
            <line class="door-hit" data-door="${d.id}" x1="${s1.x}" y1="${s1.y}" x2="${s2.x}" y2="${s2.y}"/>
          </g>`);
        });
        // Diagonalen (gemessene immer, alle berechneten auf Wunsch)
        const m = r.meas;
        allDiags(r).forEach((d) => {
          if (!ui.showDiag && !d.meas) return;
          const a = toS(p[d.a]), b = toS(p[d.b]);
          const ok = d.meas && Math.abs(d.dev) <= 0.005;
          parts.push(`<line class="diag${d.meas ? (ok ? ' ok' : ' bad') : ''}" x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}"/>`);
          if (G.len(p[d.a], p[d.b]) * k > 60) {
            const mx = a.x + (b.x - a.x) * 0.2, my = a.y + (b.y - a.y) * 0.2, ang = -textAlong(p[d.a], p[d.b]);
            parts.push(`<text class="dim diag-t${d.meas ? (ok ? ' ok' : ' bad') : ''}" x="${mx}" y="${my - 7}" text-anchor="middle" transform="rotate(${ang.toFixed(2)} ${mx} ${my})">${letter(d.a)}–${letter(d.b)} ${fmt(d.calc)}</text>`);
          }
        });
        // Maße
        const anyMeas = m.walls.some((v) => v > 0);
        const s = G.orient(p);
        c.walls.forEach((w, i) => {
          if (w.len * k < 28) return;
          const out = { x: w.u.y * s, y: -w.u.x * s };
          const mid = { x: (w.a.x + w.b.x) / 2, y: (w.a.y + w.b.y) / 2 };
          const sm = toS(mid);
          const off = 16;
          const tx = sm.x + out.x * off, ty = sm.y - out.y * off;
          const ang = -textAlong(w.a, w.b);
          const measured = m.walls[i] > 0;
          const label = anyMeas && !measured ? `≈${fmt(w.len)}` : fmt(w.len);
          parts.push(`<text class="dim${measured ? ' measured' : anyMeas ? ' closing' : ''}" x="${tx}" y="${ty}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${ang.toFixed(2)} ${tx} ${ty})">${label}</text>`);
        });
        // Fläche
        const lp = toS(G.labelPoint(p));
        parts.push(`<text class="area-label" x="${lp.x}" y="${lp.y}">${fmt(c.net)} m²</text>`);
        parts.push(`<text class="area-sub" x="${lp.x}" y="${lp.y + 17}">${esc(r.name)} · Sockel ${fmt(c.skirting)} m</text>`);
      }
      // Ecken
      if (ui.mode !== 'draw') {
        const n = p.length;
        const s = p.length >= 3 ? G.orient(p) : 1;
        p.forEach((q, i) => {
          const sq = toS(q);
          const sel = ui.sel && ui.sel.type === 'vertex' && ui.sel.i === i;
          let lx = sq.x - 12, ly = sq.y - 10;
          if (n >= 3) {
            const a = p[(i - 1 + n) % n], b = p[(i + 1) % n];
            const u1 = G.walls([a, q])[0].u, u2 = G.walls([q, b])[0].u;
            let ox = (u1.y + u2.y) * s, oy = -(u1.x + u2.x) * s;
            const L = Math.hypot(ox, oy) || 1;
            ox /= L; oy /= L;
            lx = sq.x + ox * 18; ly = sq.y - oy * 18;
          }
          parts.push(`<circle class="vertex${sel ? ' sel' : ''}" cx="${sq.x}" cy="${sq.y}" r="${sel ? 8 : 6}"/>`);
          parts.push(`<text class="vlabel" x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="middle">${letter(i)}</text>`);
          parts.push(`<circle class="vertex-hit" data-v="${i}" cx="${sq.x}" cy="${sq.y}" r="22"/>`);
        });
      }
      // Entwurf
      if (ui.mode === 'draw') {
        const d = ui.draft.map(toS);
        if (d.length) {
          parts.push(`<polyline class="draft-line" points="${d.map((q) => `${q.x},${q.y}`).join(' ')}"/>`);
          if (ui.draftPreview) {
            const pv = toS(ui.draftPreview);
            const last = d[d.length - 1];
            parts.push(`<line class="draft-preview" x1="${last.x}" y1="${last.y}" x2="${pv.x}" y2="${pv.y}"/>`);
          }
          parts.push(`<circle class="draft-first" cx="${d[0].x}" cy="${d[0].y}" r="14"/>`);
          ui.draft.forEach((q, i) => {
            if (i === 0) return;
            const a = ui.draft[i - 1];
            const m = toS({ x: (a.x + q.x) / 2, y: (a.y + q.y) / 2 });
            const ang = -textAlong(a, q);
            parts.push(`<text class="dim" x="${m.x}" y="${m.y - 12}" text-anchor="middle" transform="rotate(${ang} ${m.x} ${m.y})">${fmt(G.len(a, q))}</text>`);
          });
        }
        d.forEach((q) => parts.push(`<circle class="draft-pt" cx="${q.x}" cy="${q.y}" r="5"/>`));
        if (ui.draftPreview) { const pv = toS(ui.draftPreview); parts.push(`<circle class="draft-pt" cx="${pv.x}" cy="${pv.y}" r="4" opacity=".6"/>`); }
      }
    }
    svg.innerHTML = parts.join('');
  }

  // ---------------------------------------------------------------- Zeigersteuerung (Touch, Maus, Stift)
  const pointers = new Map();
  let gesture = null;
  const TAP_PX = 8;

  function localPt(e) {
    const rc = svg.getBoundingClientRect();
    return { x: e.clientX - rc.left, y: e.clientY - rc.top };
  }
  function snapGrid(v) {
    const g = ui.snap ? ui.grid : 0.01;
    return Math.round(v / g) * g;
  }
  function snapVertex(r, idx, w) {
    let x = snapGrid(w.x), y = snapGrid(w.y);
    if (ui.snap) {
      const tol = 10 / ui.view.k;
      let bx = tol, by = tol;
      r.points.forEach((q, i) => {
        if (i === idx) return;
        if (Math.abs(w.x - q.x) < bx) { bx = Math.abs(w.x - q.x); x = q.x; }
        if (Math.abs(w.y - q.y) < by) { by = Math.abs(w.y - q.y); y = q.y; }
      });
    }
    return roundPt({ x, y });
  }
  function snapDraft(w) {
    const d = ui.draft;
    if (!d.length) return roundPt({ x: snapGrid(w.x), y: snapGrid(w.y) });
    const last = d[d.length - 1];
    let ang = Math.atan2(w.y - last.y, w.x - last.x);
    let L = G.len(last, w);
    if (ui.snap) {
      const step = rad(15);
      const snapped = Math.round(ang / step) * step;
      if (Math.abs(snapped - ang) < rad(4)) ang = snapped;
      // auf Linie mit der ersten Ecke einrasten
    }
    L = snapGrid(L);
    let p = { x: last.x + L * Math.cos(ang), y: last.y + L * Math.sin(ang) };
    if (ui.snap && d.length >= 2) {
      const f = d[0], tol = 10 / ui.view.k;
      if (Math.abs(p.x - f.x) < tol && Math.abs(Math.cos(ang)) > 0.01) {
        // gleiche x-Koordinate wie Startpunkt
        p = { x: f.x, y: p.y };
      }
      if (Math.abs(p.y - f.y) < tol) p = { x: p.x, y: f.y };
    }
    return roundPt(p);
  }

  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId);
    const pt = localPt(e);
    pointers.set(e.pointerId, pt);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      gesture = { type: 'pinch', d0: Math.hypot(b.x - a.x, b.y - a.y), m0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, view: { ...ui.view } };
      ui.draftPreview = null;
      $('#hud').hidden = true;
      return;
    }
    if (pointers.size > 2) return;
    const r = room();
    const t = e.target;
    const vHit = t.closest && t.closest('[data-v]');
    const wHit = t.closest && t.closest('[data-wall]');
    const dHit = t.closest && t.closest('[data-door]');
    const base = { start: pt, moved: false, view: { ...ui.view } };

    if (ui.mode === 'draw') {
      gesture = Object.assign(base, { type: 'draw' });
      ui.draftPreview = snapDraft(toW(pt.x, pt.y));
      renderPlan();
      return;
    }
    if (ui.mode === 'edit' && vHit && r) {
      const i = +vHit.dataset.v;
      const w = toW(pt.x, pt.y);
      const q = r.points[i];
      gesture = Object.assign(base, { type: 'vertex', i, off: { x: q.x - w.x, y: q.y - w.y }, snapped: false });
      ui.sel = { type: 'vertex', i };
      renderAll();
      return;
    }
    if (dHit && r) {
      const id = dHit.dataset.door;
      gesture = Object.assign(base, { type: 'door', id, snapped: false });
      ui.sel = { type: 'door', id };
      renderAll();
      return;
    }
    if (wHit && r) {
      gesture = Object.assign(base, { type: 'wall', i: +wHit.dataset.wall });
      return;
    }
    gesture = Object.assign(base, { type: 'pan' });
  });

  svg.addEventListener('pointermove', (e) => {
    if (!pointers.has(e.pointerId)) {
      // Maus-Hover im Zeichenmodus: Vorschau
      if (ui.mode === 'draw' && e.pointerType === 'mouse' && ui.draft.length) {
        const pt = localPt(e);
        ui.draftPreview = snapDraft(toW(pt.x, pt.y));
        renderPlan();
        showHudDraft();
      }
      return;
    }
    const pt = localPt(e);
    pointers.set(e.pointerId, pt);
    if (!gesture) return;
    if (gesture.type === 'pinch') {
      if (pointers.size < 2) return;
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(b.x - a.x, b.y - a.y);
      const m = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const v = gesture.view;
      const k = clamp(v.k * (d / Math.max(gesture.d0, 1)), 5, 2000);
      // Weltpunkt unter der Start-Mitte bleibt unter der aktuellen Mitte
      const wx = (gesture.m0.x - W / 2) / v.k + v.cx;
      const wy = -(gesture.m0.y - H / 2) / v.k + v.cy;
      ui.view = { k, cx: wx - (m.x - W / 2) / k, cy: wy + (m.y - H / 2) / k };
      renderPlan();
      return;
    }
    const dx = pt.x - gesture.start.x, dy = pt.y - gesture.start.y;
    if (!gesture.moved && Math.hypot(dx, dy) > TAP_PX) gesture.moved = true;
    const r = room();
    switch (gesture.type) {
      case 'pan':
      case 'wall':
        if (!gesture.moved) return;
        gesture.type = 'pan';
        ui.view = { k: gesture.view.k, cx: gesture.view.cx - dx / gesture.view.k, cy: gesture.view.cy + dy / gesture.view.k };
        renderPlan();
        break;
      case 'vertex': {
        if (!gesture.moved || !r) return;
        if (!gesture.snapped) { snapshot(); gesture.snapped = true; dropSketch(r); }
        const w = toW(pt.x, pt.y);
        r.points[gesture.i] = snapVertex(r, gesture.i, { x: w.x + gesture.off.x, y: w.y + gesture.off.y });
        renderPlan();
        showHudVertex(r, gesture.i);
        break;
      }
      case 'door': {
        if (!gesture.moved || !r) return;
        const d = r.doors.find((x) => x.id === gesture.id);
        const walls = G.walls(r.points);
        const w = d && walls[d.wall];
        if (!w) return;
        if (!gesture.snapped) { snapshot(); gesture.snapped = true; gesture.grab = null; }
        const wp = toW(pt.x, pt.y);
        const pr = G.segDist(wp, w.a, w.b);
        const along = pr.t * w.len;
        if (gesture.grab == null) gesture.grab = along - d.pos;
        d.pos = r4(clamp(snapGrid(along - gesture.grab), 0, Math.max(0, w.len - d.width)));
        renderPlan();
        showHud(`${esc(d.name)}: ${fmt(d.pos)} m ab Ecke ${letter(d.wall)}`);
        break;
      }
      case 'draw':
        ui.draftPreview = snapDraft(toW(pt.x, pt.y));
        renderPlan();
        showHudDraft();
        break;
    }
  });

  function endPointer(e) {
    if (!pointers.has(e.pointerId)) return;
    pointers.delete(e.pointerId);
    if (!gesture) return;
    if (gesture.type === 'pinch') {
      if (pointers.size === 0) gesture = null;
      else gesture = { type: 'pan', start: [...pointers.values()][0], moved: true, view: { ...ui.view } };
      return;
    }
    if (e.type === 'pointercancel') { gesture = null; ui.draftPreview = null; $('#hud').hidden = true; renderPlan(); return; }
    const g = gesture;
    gesture = null;
    $('#hud').hidden = true;
    const r = room();
    const pt = localPt(e);
    switch (g.type) {
      case 'pan':
        if (!g.moved) { ui.sel = null; renderAll(); }
        break;
      case 'wall':
        if (g.moved || !r) break;
        if (ui.mode === 'door') {
          const walls = G.walls(r.points);
          const w = walls[g.i];
          const pr = G.segDist(toW(pt.x, pt.y), w.a, w.b);
          const width = Math.min(DEFAULT_DOOR, w.len);
          const pos = clamp(snapGrid(pr.t * w.len - width / 2), 0, w.len - width);
          let id;
          mutate(() => {
            const d = newDoor(g.i, pos, width);
            d.name = `Tür ${r.doors.length + 1}`;
            r.doors.push(d);
            id = d.id;
          });
          ui.sel = { type: 'door', id };
          ui.tab = 'doors';
          renderAll();
          toast('Tür eingesetzt – Maße unter „Türen“ anpassen');
        } else {
          ui.sel = { type: 'wall', i: g.i };
          if (ui.tab === 'measure') {
            ui.measIdx = g.i;
            renderAll();
            setMeasInput(true);
          } else {
            if (ui.tab !== 'walls') ui.tab = 'walls';
            renderAll();
            scrollPanelTo(`[data-k="row-${g.i}"]`);
          }
        }
        break;
      case 'vertex':
        if (g.snapped) { persist(); renderAll(); }
        break;
      case 'door':
        if (g.snapped) persist();
        if (!g.moved) ui.tab = 'doors';
        renderAll();
        if (!g.moved) scrollPanelTo(`[data-k="door-${g.id}"]`);
        break;
      case 'draw': {
        const p = snapDraft(toW(pt.x, pt.y));
        ui.draftPreview = null;
        const d = ui.draft;
        if (d.length >= 3) {
          const f = toS(d[0]), sp = toS(p);
          if (Math.hypot(f.x - sp.x, f.y - sp.y) < 22) { finishDraw(); return; }
        }
        if (!d.length || G.len(d[d.length - 1], p) > 0.005) d.push(p);
        renderAll();
        break;
      }
    }
  }
  svg.addEventListener('pointerup', endPointer);
  svg.addEventListener('pointercancel', endPointer);
  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const pt = localPt(e);
    const w = toW(pt.x, pt.y);
    const k = clamp(ui.view.k * Math.exp(-e.deltaY * 0.0015), 5, 2000);
    ui.view = { k, cx: w.x - (pt.x - W / 2) / k, cy: w.y + (pt.y - H / 2) / k };
    renderPlan();
  }, { passive: false });

  function showHud(html) {
    const h = $('#hud');
    h.innerHTML = html;
    h.hidden = false;
  }
  function showHudVertex(r, i) {
    const n = r.points.length;
    const q = r.points[i], a = r.points[(i - 1 + n) % n], b = r.points[(i + 1) % n];
    showHud(`${letter((i - 1 + n) % n)}–${letter(i)}: ${fmt(G.len(a, q))} m · ${letter(i)}–${letter((i + 1) % n)}: ${fmt(G.len(q, b))} m`);
  }
  function showHudDraft() {
    const d = ui.draft;
    if (!d.length || !ui.draftPreview) return;
    const a = d[d.length - 1], b = ui.draftPreview;
    let ang = deg(Math.atan2(b.y - a.y, b.x - a.x));
    if (ang < 0) ang += 360;
    showHud(`Länge ${fmt(G.len(a, b))} m · Richtung ${fmt(ang, 0)}°`);
  }

  function setMode(m) {
    const r = room();
    if (m === 'draw' && r && r.points.length >= 3 && ui.mode !== 'draw') {
      if (!confirm(`Umriss von „${r.name}“ neu zeichnen? Die bisherigen Ecken und Türen dieses Raums werden ersetzt.`)) return;
    }
    if (m === 'draw' && !r) { openRoomDialog(); return; }
    ui.mode = m;
    ui.draft = [];
    ui.draftPreview = null;
    ui.sel = null;
    renderAll();
  }
  function finishDraw() {
    const r = room();
    if (!r) return;
    if (ui.draft.length < 3) { toast('Mindestens 3 Ecken setzen'); return; }
    const pts = ui.draft.slice();
    if (G.selfIntersects(pts)) toast('Achtung: Die Wände überschneiden sich');
    mutate(() => {
      r.points = pts.map(roundPt);
      r.doors = [];
      r.meas = newMeas();
    });
    ui.draft = [];
    ui.mode = 'edit';
    ui.tab = 'measure';
    ui.measIdx = 0;
    ui.sel = { type: 'wall', i: 0 };
    fit();
    renderAll();
    toast('Skizze fertig – jetzt Wand für Wand mit dem Laser messen');
  }

  // ---------------------------------------------------------------- Panel
  const panel = $('#panelBody');
  let lastSig = '';

  function scrollPanelTo(sel) {
    const el = panel.querySelector(sel);
    if (el) el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  const inputAttrs = (k, f, extra = '') => `data-k="${k}" data-f="${f}" ${extra}`;

  function panelWalls(r) {
    if (!r) return `<div class="card"><p>Kein Raum vorhanden.</p><button class="btn primary" data-act="newRoom">+ Raum anlegen</button></div>`;
    const c = calcRoom(r);
    const n = r.points.length;
    const ortho = G.isOrtho(r.points);
    let rows = '';
    c.walls.forEach((w, i) => {
      const sel = ui.sel && ui.sel.type === 'wall' && ui.sel.i === i;
      const closing = i === n - 1;
      const angEditable = i > 0 && i < n - 1;
      rows += `<tr data-k="row-${i}" class="${sel ? 'sel' : ''}" data-act="selWall" data-i="${i}">
        <td class="wname">${letter(i)}–${letter((i + 1) % n)}</td>
        <td>${closing
          ? `<span class="ro" data-k="len-${i}" data-h>${fmt(w.len)}</span>`
          : `<input class="cell-input" inputmode="decimal" ${inputAttrs(`len-${i}`, 'wallLen', `data-i="${i}"`)} value="${fmtIn(w.len)}">`}</td>
        <td>${angEditable
          ? `<input class="cell-input" inputmode="decimal" ${inputAttrs(`ang-${i}`, 'wallAng', `data-i="${i}"`)} value="${fmtIn(c.angles[i], 1)}">`
          : `<span class="ro" data-k="ang-${i}" data-h>${fmt(c.angles[i], 1)}°</span>`}</td>
        <td><div class="row" style="flex-wrap:nowrap">
          <button class="icon-btn" title="Ecke einfügen (Wand teilen)" data-act="split" data-i="${i}">⊕</button>
          <button class="icon-btn" title="Tür in diese Wand" data-act="addDoorWall" data-i="${i}">🚪</button>
        </div></td>
      </tr>`;
    });
    return `
      <div class="card">
        <div class="grid2">
          <label class="field"><span>Raumname</span><input ${inputAttrs('roomName', 'roomName')} value="${esc(r.name)}"></label>
          <div class="field"><span>&nbsp;</span><button class="btn danger" data-act="delRoom">Raum löschen</button></div>
        </div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Wände</h3><span class="hint" style="margin:0">${n} Ecken · Umfang <b data-k="perim" data-h>${fmt(c.perim)} m</b></span></div>
        ${c.selfX ? '<p class="warn">⚠ Wände überschneiden sich – Fläche ist so nicht korrekt.</p>' : ''}
        <p class="hint">Längen in Metern (z. B. 4,35). Der Winkel ist der Innenwinkel an der Anfangsecke der Wand (90 = rechtwinklig, schiefe Räume z. B. 97,5).
        ${ortho
          ? 'Der Raum ist rechtwinklig: Wenn du eine Länge änderst, wird der Raum gestreckt und alle Winkel bleiben 90°.'
          : `Die letzte Wand (${letter(n - 1)}–${letter(0)}) schließt den Raum und wird automatisch berechnet.`}
        Ecken kannst du im Plan auch ziehen.</p>
        <table class="walls">
          <thead><tr><th>Wand</th><th>Länge (m)</th><th>Winkel (°)</th><th></th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  function panelMeasure(r) {
    if (!r) return '';
    const n = r.points.length;
    if (n < 3) return `<div class="card empty-card"><div class="big-icon">✎</div><p><b>Raum skizzieren</b></p><p class="hint">Tippe im Plan nacheinander auf die Ecken des Raums. Die Maße müssen noch nicht stimmen. Zum Schließen auf die erste Ecke tippen.</p></div>`;
    const m = r.meas;
    const i = clamp(ui.measIdx, 0, n - 1);
    const info = measInfo(r);
    const name = (j) => `${letter(j)}–${letter((j + 1) % n)}`;
    const cur = m.walls[i] > 0 ? fmtIn(m.walls[i], 3) : '';
    const doneCount = Array.from({ length: n }, (_, j) => m.walls[j] > 0).filter(Boolean).length;
    let status = '';
    if (doneCount < n) status = `<div class="pill">Noch ${n - doneCount} von ${n} Wänden messen</div>`;
    else if (info.maxDev > 0.01) status = `<div class="pill bad">⚠ Maße passen nicht zusammen – Abweichung bis ${fmt(info.maxDev * 100, 1)} cm. Bitte prüfen.</div>`;
    else if (info.missingDiag) status = `<div class="pill warnp">Alle Wände ✓ – der Raum hat schiefe Ecken. Für die exakte Form noch ${info.missingDiag} Diagonale${info.missingDiag > 1 ? 'n' : ''} messen (unten).</div>`;
    else if (info.angDev > 0.5) status = `<div class="pill warnp">Alle Wände ✓ – Raum nicht ganz rechtwinklig (bis ${fmt(info.angDev, 1)}°). Zur Kontrolle eine Diagonale messen.</div>`;
    else status = `<div class="pill okp">✓ Alle Maße passen zusammen</div>`;
    const c = calcRoom(r);
    const pct = Math.round((doneCount / n) * 100);
    const rows = r.points.map((_, j) => `<button class="wall-chip${j === i ? ' sel' : ''}${m.walls[j] > 0 ? ' done' : ''}" data-k="mrow-${j}" data-act="measGo" data-i="${j}">
        <span class="wc-name">${name(j)}</span>
        <span class="wc-val" data-k="mval-${j}" data-h>${m.walls[j] > 0 ? `${fmt(m.walls[j], 3)}` : `≈ ${fmt(G.len(r.points[j], r.points[(j + 1) % n]), 2)}`}</span>
      </button>`).join('');
    const diags = allDiags(r);
    const drows = diags.map((d) => {
      const key = `${d.a}-${d.b}`;
      let st = '<span class="ro">–</span>';
      if (d.meas) st = Math.abs(d.dev) <= 0.005 ? '<span class="okt">✓ passt</span>' : `<span class="badt">${d.dev > 0 ? '+' : '−'}${fmt(Math.abs(d.dev) * 100, 1)} cm</span>`;
      return `<tr>
        <td class="wname">${letter(d.a)}–${letter(d.b)}</td>
        <td data-k="dgc-${key}" data-h>${fmt(d.calc, 3)}</td>
        <td><input class="cell-input" inputmode="decimal" placeholder="messen" data-k="dgm-${key}" data-f="diagPair" data-a="${d.a}" data-b="${d.b}" value="${d.meas ? fmtIn(d.meas, 3) : ''}"></td>
        <td data-k="dgs-${key}" data-h>${st}</td>
      </tr>`;
    }).join('');
    return `
      <div class="card meas-card">
        <div class="meas-top">
          <div>
            <div class="meas-label">Wand messen</div>
            <div class="meas-wall" data-k="mcur" data-h>${name(i)}</div>
          </div>
          <div class="progress" data-k="mprog" data-h><svg viewBox="0 0 36 36"><circle cx="18" cy="18" r="15.5" class="pr-bg"/><circle cx="18" cy="18" r="15.5" class="pr-fg" stroke-dasharray="${pct * 0.974} 100"/></svg><span>${doneCount}/${n}</span></div>
        </div>
        <div class="meas-field">
          <input class="meas-input" data-k="meas-input" data-f="measLen" inputmode="decimal" enterkeyhint="next" autocomplete="off" placeholder="0,000" value="${cur}">
          <span class="meas-unit">m</span>
        </div>
        <div class="meas-nav">
          <button class="btn" data-act="measPrev" aria-label="Vorherige Wand">‹</button>
          <button class="btn ghost danger" data-act="measClear">Löschen</button>
          <button class="btn primary" data-act="measNext">Weiter ›</button>
        </div>
        <div data-k="mstatus" data-h>${status}</div>
      </div>
      <div class="card">
        <div class="card-head"><h3>Wände</h3><span class="hint" style="margin:0">antippen zum Messen</span></div>
        <div class="wall-chips">${rows}</div>
        <div class="meas-result" data-k="mresult" data-h><div><b>${fmt(c.net)} m²</b><span>Fläche</span></div><div><b>${fmt(c.skirting)} m</b><span>Sockelleiste</span></div><div><b>${fmt(c.perim)} m</b><span>Umfang</span></div></div>
      </div>
      ${diags.length ? `<div class="card">
        <div class="card-head"><h3>Diagonalen</h3><span class="hint" style="margin:0">Kontrollmaße</span></div>
        <p class="hint">Die App berechnet jede Diagonale von Ecke zu Ecke aus deinen Maßen. Ist der Raum verzogen (z. B. für Spanndecken wichtig), Diagonale messen und eintragen – die Zeichnung wird angeglichen und du siehst, ob alles zusammenpasst.</p>
        <table class="walls diag-table"><thead><tr><th>Diagonale</th><th>berechnet</th><th>gemessen</th><th></th></tr></thead><tbody>${drows}</tbody></table>
        <label class="check"><input type="checkbox" data-k="mortho" data-f="measOrtho" ${m.ortho ? 'checked' : ''}> Fast rechte Ecken der Skizze als 90° annehmen</label>
      </div>` : ''}
      <button class="btn block ghost danger" data-act="measReset">Alle Messwerte dieses Raums löschen</button>`;
  }

  function panelDoors(r) {
    if (!r) return '';
    const c = calcRoom(r);
    const n = r.points.length;
    const opts = (sel) => c.walls.map((w, i) => `<option value="${i}" ${i === sel ? 'selected' : ''}>${letter(i)}–${letter((i + 1) % n)} (${fmt(w.len)} m)</option>`).join('');
    const cards = r.doors.map((d) => {
      const sel = ui.sel && ui.sel.type === 'door' && ui.sel.id === d.id;
      const cd = c.doors.find((x) => x.id === d.id);
      const k = (f) => `door-${d.id}-${f}`;
      const ida = `data-id="${d.id}"`;
      return `<div class="card${sel ? ' sel' : ''}" data-k="door-${d.id}">
        <div class="card-head">
          <input class="cell-input" style="max-width:60%" ${inputAttrs(k('name'), 'doorName', ida)} value="${esc(d.name)}">
          <button class="btn small danger" data-act="delDoor" ${ida}>Löschen</button>
        </div>
        <div class="grid2">
          <label class="field"><span>Wand</span><select ${inputAttrs(k('wall'), 'doorWall', ida)}>${opts(d.wall)}</select></label>
          <label class="field"><span>Breite der Öffnung (m)</span><input inputmode="decimal" ${inputAttrs(k('width'), 'doorWidth', ida)} value="${fmtIn(d.width)}"></label>
          <label class="field"><span>Abstand ab Ecke ${letter(d.wall)} (m)</span><input inputmode="decimal" ${inputAttrs(k('pos'), 'doorPos', ida)} value="${fmtIn(d.pos)}"></label>
          <label class="field"><span>Laibungstiefe / Wandstärke (m)</span><input inputmode="decimal" ${inputAttrs(k('reveal'), 'doorReveal', ida)} value="${fmtIn(d.reveal)}" placeholder="0"></label>
        </div>
        <label class="check"><input type="checkbox" ${inputAttrs(k('rs'), 'doorRevSk', ida)} ${d.revealSkirting ? 'checked' : ''}> Sockelleiste in die Laibung führen (+ 2 × Tiefe)</label>
        <label class="check"><input type="checkbox" ${inputAttrs(k('ra'), 'doorRevArea', ida)} ${d.revealArea ? 'checked' : ''}> Boden im Türdurchgang mitrechnen (+ Breite × Tiefe)</label>
        <div class="row">
          <button class="btn small" data-act="flipHinge" ${ida}>Anschlag wechseln</button>
          <button class="btn small" data-act="flipSwing" ${ida}>Aufschlag ${d.swingOut ? 'nach innen' : 'nach außen'}</button>
          <span class="hint" style="margin:0" data-k="${k('eff')}" data-h>Abzug Sockelleiste: ${fmt(cd ? cd.eff : 0)} m</span>
        </div>
      </div>`;
    }).join('');
    return `
      <p class="hint">Türen werden von der Sockelleiste abgezogen. Am schnellsten: oben Werkzeug „Tür“ wählen und auf eine Wand tippen. Türen lassen sich im Plan entlang der Wand verschieben.</p>
      ${cards || '<div class="card"><p class="hint" style="margin:0">Noch keine Türen in diesem Raum.</p></div>'}
      <button class="btn block" data-act="addDoor">+ Tür hinzufügen</button>`;
  }

  function panelExtras(r) {
    if (!r) return '';
    const cards = r.extras.map((x) => {
      const k = (f) => `ex-${x.id}-${f}`;
      const ida = `data-id="${x.id}"`;
      return `<div class="card" data-k="ex-${x.id}">
        <div class="card-head">
          <input class="cell-input" style="max-width:60%" ${inputAttrs(k('name'), 'exName', ida)} value="${esc(x.name)}">
          <button class="btn small danger" data-act="delExtra" ${ida}>Löschen</button>
        </div>
        <div class="grid2">
          <label class="field"><span>Art</span><select ${inputAttrs(k('kind'), 'exKind', ida)}>
            <option value="sub" ${x.kind !== 'add' ? 'selected' : ''}>Abzug (Säule, Schacht, Kamin …)</option>
            <option value="add" ${x.kind === 'add' ? 'selected' : ''}>Zuschlag (Nische, Erker …)</option>
          </select></label>
          <label class="field"><span>Anzahl</span><input inputmode="numeric" ${inputAttrs(k('count'), 'exCount', ida)} value="${x.count}"></label>
          <label class="field"><span>Breite (m)</span><input inputmode="decimal" ${inputAttrs(k('w'), 'exW', ida)} value="${fmtIn(x.w)}"></label>
          <label class="field"><span>Tiefe (m)</span><input inputmode="decimal" ${inputAttrs(k('d'), 'exD', ida)} value="${fmtIn(x.d)}"></label>
        </div>
        <label class="check"><input type="checkbox" ${inputAttrs(k('sk'), 'exSkirt', ida)} ${x.skirt ? 'checked' : ''}> ${x.kind === 'add' ? 'Sockelleiste an den Seiten der Nische (+ 2 × Tiefe)' : 'Sockelleiste rundherum (+ Umfang)'}</label>
      </div>`;
    }).join('');
    return `
      <p class="hint">Flächen, die nicht im Umriss gezeichnet sind: z. B. eine Säule oder ein Schacht wird abgezogen, eine Nische wird hinzugerechnet.</p>
      ${cards || '<div class="card"><p class="hint" style="margin:0">Keine Abzüge oder Zuschläge.</p></div>'}
      <div class="grid2">
        <button class="btn" data-act="addExtra" data-kind="sub">+ Abzug</button>
        <button class="btn" data-act="addExtra" data-kind="add">+ Zuschlag</button>
      </div>`;
  }

  function panelSig() {
    const r = room();
    const base = `${ui.tab}|${P.id}|${r ? r.id : '-'}`;
    switch (ui.tab) {
      case 'walls': return r ? `${base}|${r.points.length}|${G.isOrtho(r.points)}|${calcRoom(r).selfX}` : base;
      case 'measure': return r ? `${base}|${r.points.length}` : base;
      case 'doors': return r ? `${base}|${r.doors.map((d) => d.id + d.wall + d.swingOut).join(',')}|${r.points.length}` : base;
      case 'extra': return r ? `${base}|${r.extras.map((x) => x.id + x.kind).join(',')}` : base;
    }
    return base;
  }

  function renderPanel() {
    const r = room();
    const html = ({ walls: panelWalls, measure: panelMeasure, doors: panelDoors, extra: panelExtras }[ui.tab] || panelMeasure)(r);
    const sig = panelSig();
    $$('.panel-tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === ui.tab));
    if (sig !== lastSig) {
      const scroll = panel.scrollTop;
      panel.innerHTML = html;
      if (lastSig.split('|')[0] === ui.tab) panel.scrollTop = scroll;
      lastSig = sig;
      return;
    }
    // Gleiche Struktur: nur Werte aktualisieren, damit Fokus und Tastatur erhalten bleiben.
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    tmp.querySelectorAll('[data-k]').forEach((el) => {
      const cur = panel.querySelector(`[data-k="${CSS.escape(el.dataset.k)}"]`);
      if (!cur) return;
      if (cur.matches('input, select, textarea')) {
        if (cur === document.activeElement) return;
        if (cur.type === 'checkbox') cur.checked = el.hasAttribute('checked');
        else if (cur.tagName === 'SELECT') cur.value = el.value;
        else if (cur.tagName === 'TEXTAREA') cur.value = el.value;
        else cur.value = el.getAttribute('value') ?? '';
      } else {
        cur.className = el.className;
        if (el.hasAttribute('data-h')) cur.innerHTML = el.innerHTML;
      }
    });
  }

  function renderRoomHeader() {
    const r = room();
    $('#roomTitle').textContent = r ? r.name : '';
  }

  /** Kleine Grundriss-Zeichnung eines Raums (für Übersicht und Projektliste). */
  function thumbSvg(r, w = 160, h = 112, pad = 10, labels = false) {
    if (labels) pad = 18;
    const p = r.points;
    if (p.length < 3) return `<svg class="thumb" viewBox="0 0 ${w} ${h}"><text x="${w / 2}" y="${h / 2}" text-anchor="middle" class="thumb-empty">noch nicht gezeichnet</text></svg>`;
    const b = G.bounds(p);
    const s = Math.min((w - 2 * pad) / Math.max(b.w, 0.1), (h - 2 * pad) / Math.max(b.h, 0.1));
    const ox = (w - b.w * s) / 2, oy = (h - b.h * s) / 2;
    const T = (q) => ({ x: ox + (q.x - b.minX) * s, y: h - oy - (q.y - b.minY) * s });
    const pts = p.map(T).map((q) => `${q.x.toFixed(1)},${q.y.toFixed(1)}`).join(' ');
    const c = calcRoom(r);
    const doors = r.doors.map((d) => {
      const g = doorGeom(r, d, c);
      if (!g) return '';
      const a = T(g.start), e = T(g.end);
      return `<line class="thumb-door" x1="${a.x}" y1="${a.y}" x2="${e.x}" y2="${e.y}"/>`;
    }).join('');
    let dims = '';
    if (labels) {
      const so = G.orient(p);
      c.walls.forEach((wl) => {
        if (wl.len * s < 34) return;
        const out = { x: wl.u.y * so, y: -wl.u.x * so };
        const m = T({ x: (wl.a.x + wl.b.x) / 2, y: (wl.a.y + wl.b.y) / 2 });
        const tx = m.x + out.x * 8, ty = m.y - out.y * 8;
        const ang = -textAlong(wl.a, wl.b);
        dims += `<text class="thumb-dim" x="${tx.toFixed(1)}" y="${ty.toFixed(1)}" text-anchor="middle" dominant-baseline="middle" transform="rotate(${ang.toFixed(1)} ${tx.toFixed(1)} ${ty.toFixed(1)})">${fmt(wl.len)}</text>`;
      });
    }
    return `<svg class="thumb" viewBox="0 0 ${w} ${h}"><polygon class="thumb-floor" points="${pts}"/>${doors}${dims}</svg>`;
  }

  function roomBadge(r) {
    const n = r.points.length;
    if (n < 3) return '<span class="badge">Skizze fehlt</span>';
    const done = Array.from({ length: n }, (_, j) => r.meas.walls[j] > 0).filter(Boolean).length;
    if (done === n) return '<span class="badge ok">✓ gemessen</span>';
    if (done > 0) return `<span class="badge warn">${done}/${n} gemessen</span>`;
    if (r.meas.sketch || !r.meas.walls.length) return '<span class="badge">Maße eingegeben</span>';
    return '<span class="badge">Skizze</span>';
  }

  function renderOverview() {
    const pc = calcProject();
    $('#ovTitle').textContent = P.name;
    const dateStr = P.date ? new Date(P.date + 'T12:00:00').toLocaleDateString('de-DE') : '';
    $('#ovSub').textContent = [P.client, P.address, dateStr].filter(Boolean).join(' · ');
    const cards = pc.rooms.map(({ r, c }) => `
      <div class="room-card" role="button" tabindex="0" data-act="openRoom" data-id="${r.id}">
        <button class="card-del" data-act="delRoomCard" data-id="${r.id}" aria-label="Raum ${esc(r.name)} löschen" title="Raum löschen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        ${thumbSvg(r, 160, 112, 10, true)}
        <div class="rc-body">
          <div class="rc-name">${esc(r.name)}</div>
          <div class="rc-stats"><span><b>${fmt(c.net)}</b> m²</span><span><b>${fmt(c.skirting)}</b> m Sockel</span></div>
          ${roomBadge(r)}
        </div>
      </div>`).join('');
    const nOps = (P.openings || []).length;
    const tabs = OP ? `<div class="seg2 ov-tabs" role="tablist">
        <button class="${ui.ovTab === 'rooms' ? 'active' : ''}" data-act="ovTab" data-tab="rooms">Räume <small>${P.rooms.length}</small></button>
        <button class="${ui.ovTab === 'openings' ? 'active' : ''}" data-act="ovTab" data-tab="openings">Türen &amp; Fenster <small>${nOps}</small></button>
      </div>` : '';
    if (OP && ui.ovTab === 'openings') {
      $('#overviewBody').innerHTML = tabs + OP.renderList();
      $('#ovTotals').innerHTML = OP.totalsHtml();
      return;
    }
    $('#overviewBody').innerHTML = tabs + `
      ${pc.rooms.length ? '' : `<div class="empty-state"><div class="big-icon">📐</div><h2>Was möchtest du aufmessen?</h2><p>Räume für Bodenfläche und Sockelleisten – oder nur Türen und Fenster.</p></div>
        ${OP && !nOps ? '<div class="op-add three"><button class="btn primary big" data-act="newRoom">＋ Raum</button><button class="btn big" data-oact="add" data-type="door">＋ Tür</button><button class="btn big" data-oact="add" data-type="window">＋ Fenster</button></div>' : ''}`}
      ${!pc.rooms.length && OP && !nOps ? '' : `<div class="room-grid">
        ${cards}
        <button class="room-card add" data-act="newRoom"><span class="plus">＋</span><span>Raum hinzufügen</span></button>
      </div>`}
      ${pc.rooms.length ? `<div class="card material">
        <div class="card-head"><h3>Materialbedarf</h3><button class="btn small ghost" data-act="editProject">Verschnitt ändern</button></div>
        <table class="calc">
          <tr><td>Bodenbelag inkl. ${fmt(P.wasteArea, 0)} % Verschnitt</td><td>${fmt(pc.netW)} m²</td></tr>
          <tr><td>Sockelleiste inkl. ${fmt(P.wasteSkirt, 0)} % Verschnitt</td><td>${fmt(pc.skW)} m</td></tr>
          ${P.piece > 0 ? `<tr><td>Leisten à ${fmt(P.piece)} m</td><td>${pc.pieces} Stück</td></tr>` : ''}
        </table>
      </div>` : ''}`;
    $('#ovTotals').innerHTML = `
      <div class="tot-main"><span>Gesamtfläche</span><b>${fmt(pc.net)} m²</b></div>
      <div class="tot-side"><div><b>${fmt(pc.skirting)} m</b><span>Sockelleiste</span></div><div><b>${P.rooms.length}</b><span>Räume</span></div></div>`;
  }

  function renderProjects() {
    const list = Object.values(db.projects).sort((x, y) => y.updated - x.updated);
    $('#projectsBody').innerHTML = list.length ? list.map((p) => {
      const pc = calcProject(p);
      const shapes = p.rooms.slice(0, 4).map((r) => thumbSvg(r, 60, 44, 4)).join('');
      return `<div class="project-card" role="button" tabindex="0" data-act="openProject" data-id="${p.id}">
        <div class="pc-thumbs">${shapes || '<span class="pc-empty">📐</span>'}</div>
        <div class="pc-body">
          <div class="pc-name">${esc(p.name)}</div>
          <div class="pc-meta">${esc([p.client, p.address].filter(Boolean).join(' · ') || 'ohne Kunde')}</div>
          <div class="pc-stats"><b>${fmt(pc.net)} m²</b> · ${p.rooms.length} ${p.rooms.length === 1 ? 'Raum' : 'Räume'} · ${new Date(p.updated).toLocaleDateString('de-DE')}</div>
        </div>
        <button class="card-del inline" data-act="delProjectCard" data-id="${p.id}" aria-label="Projekt ${esc(p.name)} löschen" title="Projekt löschen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        <span class="chev">›</span>
      </div>`;
    }).join('') : '<div class="empty-state"><div class="big-icon">📁</div><h2>Noch keine Projekte</h2><p>Lege ein Projekt an, z. B. „Wohnung Müller“.</p></div>';
  }

  function renderSummary() {
    const r = room();
    const c = r ? calcRoom(r) : null;
    $('#summary').innerHTML = `
      <div class="s"><b>${c ? fmt(c.net) : '–'} m²</b><span>Fläche</span></div>
      <div class="s"><b>${c ? fmt(c.skirting) : '–'} m</b><span>Sockelleiste</span></div>
      <div class="s"><b>${c ? fmt(c.perim) : '–'} m</b><span>Umfang</span></div>`;
  }

  function renderContext() {
    const bar = $('#contextBar');
    const r = room();
    let h = '';
    if (ui.mode === 'draw') {
      h = `<span class="note">Ecken antippen – erste Ecke schließt</span>`;
      if (ui.draft.length) h += `<button class="btn small" data-act="draftBack">Punkt zurück</button>`;
      if (ui.draft.length >= 3) h += `<button class="btn small primary" data-act="finishDraw">Fertig</button>`;
      h += `<button class="btn small ghost" data-act="cancelDraw" style="background:var(--surface)">Abbrechen</button>`;
    } else if (ui.mode === 'door') {
      h = `<span class="note">Auf eine Wand tippen, um eine Tür einzusetzen</span>`;
    } else if (ui.sel && r) {
      if (ui.sel.type === 'vertex') {
        h = `<span class="note">Ecke ${letter(ui.sel.i)}</span><button class="btn small danger" data-act="delVertex">Ecke löschen</button>`;
      } else if (ui.sel.type === 'wall') {
        const n = r.points.length;
        h = `<span class="note">Wand ${letter(ui.sel.i)}–${letter((ui.sel.i + 1) % n)}</span>
          <button class="btn small" data-act="split" data-i="${ui.sel.i}">Ecke einfügen</button>
          <button class="btn small" data-act="addDoorWall" data-i="${ui.sel.i}">Tür einsetzen</button>`;
      } else if (ui.sel.type === 'door') {
        const d = r.doors.find((x) => x.id === ui.sel.id);
        if (d) h = `<span class="note">${esc(d.name)}</span><button class="btn small danger" data-act="delDoor" data-id="${d.id}">Tür löschen</button>`;
      }
    }
    if (bar.innerHTML !== h) bar.innerHTML = h;
    $$('.seg button').forEach((b) => b.classList.toggle('active', b.dataset.mode === ui.mode));
    $('#btnSnap').classList.toggle('on', ui.snap);
    $('#btnDiag').classList.toggle('on', ui.showDiag);
  }

  function renderAll() {
    $('#screenProjects').hidden = ui.screen !== 'projects';
    $('#screenOverview').hidden = ui.screen !== 'overview';
    $('#screenRoom').hidden = ui.screen !== 'room';
    $('#screenOpening').hidden = ui.screen !== 'opening';
    if (ui.screen === 'opening' && OP) { OP.renderEditor(); return; }
    if (ui.screen === 'projects') { renderProjects(); return; }
    if (ui.screen === 'overview') { renderOverview(); return; }
    if (!room()) { ui.screen = 'overview'; renderAll(); return; }
    renderRoomHeader();
    renderPlan();
    renderPanel();
    renderSummary();
    renderContext();
  }

  // ---------------------------------------------------------------- Navigation
  function go(screen) {
    ui.screen = screen;
    ui.mode = 'edit';
    ui.draft = [];
    ui.draftPreview = null;
    ui.sel = null;
    lastSig = '';
    if (screen === 'opening') $('#openingBody').scrollTop = 0;
    renderAll();
    if (screen === 'room') {
      W = 0; H = 0;
      requestAnimationFrame(() => {
        const rc = svg.getBoundingClientRect();
        W = rc.width; H = rc.height;
        svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
        fit();
        renderPlan();
      });
    } else {
      const body = screen === 'projects' ? $('#projectsBody') : $('#overviewBody');
      if (body) body.scrollTop = 0;
    }
  }
  function openRoom(id, tab) {
    P.activeRoom = id;
    ui.measIdx = 0;
    const r = room();
    ui.tab = tab || (r && (r.points.length < 3 || r.meas.walls.some((v) => v > 0) || r.meas.sketch) ? 'measure' : 'walls');
    persist();
    go('room');
    if (ui.tab === 'measure' && r && r.points.length >= 3) { ui.sel = { type: 'wall', i: 0 }; renderAll(); }
  }
  /** Leere Räume (Skizze abgebrochen) beim Verlassen entfernen. */
  function dropEmptyRoom() {
    const r = room();
    if (r && r.points.length < 3) {
      P.rooms = P.rooms.filter((x) => x !== r);
      P.activeRoom = P.rooms[0] ? P.rooms[0].id : null;
      persist();
    }
  }

  // ---------------------------------------------------------------- Projekt-Dialog
  const dlgP = $('#dlgProject');
  const formP = $('#formProject');
  let projectDialogMode = 'new';
  function openProjectDialog(mode) {
    projectDialogMode = mode;
    const f = formP.elements;
    const src = mode === 'edit' ? P : newProject('');
    f.name.value = src.name;
    f.client.value = src.client || '';
    f.address.value = src.address || '';
    f.date.value = src.date || '';
    f.author.value = src.author || '';
    f.wasteArea.value = fmtIn(src.wasteArea, 1);
    f.wasteSkirt.value = fmtIn(src.wasteSkirt, 1);
    f.piece.value = fmtIn(src.piece);
    f.note.value = src.note || '';
    $('#projectMore').hidden = mode !== 'edit';
    $('#dlgProjectTitle').textContent = mode === 'edit' ? 'Projektdaten' : 'Neues Projekt';
    $('#btnProjectOk').textContent = mode === 'edit' ? 'Speichern' : 'Anlegen';
    if (typeof dlgP.showModal === 'function') dlgP.showModal(); else dlgP.setAttribute('open', '');
    if (mode === 'new') setTimeout(() => f.name.focus(), 50);
  }
  formP.addEventListener('submit', (e) => {
    const sub = e.submitter && e.submitter.value;
    if (sub !== 'ok') return;
    const f = formP.elements;
    const name = f.name.value.trim();
    if (!name) { e.preventDefault(); f.name.focus(); toast('Bitte einen Projektnamen eingeben'); return; }
    const numOr = (s, d) => { const v = num(s); return Number.isFinite(v) && v >= 0 ? v : d; };
    if (projectDialogMode === 'new') {
      const p = newProject(name);
      Object.assign(p, { client: f.client.value.trim(), address: f.address.value.trim(), date: f.date.value || p.date, author: f.author.value.trim() });
      db.projects[p.id] = p;
      P = p;
      persist();
      ui.ovTab = 'rooms';
      go('overview');
    } else {
      mutate(() => Object.assign(P, {
        name, client: f.client.value.trim(), address: f.address.value.trim(), date: f.date.value, author: f.author.value.trim(),
        wasteArea: numOr(f.wasteArea.value, P.wasteArea), wasteSkirt: numOr(f.wasteSkirt.value, P.wasteSkirt), piece: numOr(f.piece.value, P.piece), note: f.note.value,
      }));
    }
  });

  // ---------------------------------------------------------------- Eingaben  // ---------------------------------------------------------------- Eingaben
  panel.addEventListener('change', (e) => {
    const el = e.target;
    const f = el.dataset.f;
    if (!f) return;
    const r = room();
    const v = el.type === 'checkbox' ? el.checked : el.value;
    const needNum = (x, min = 0) => {
      const n = num(x);
      if (!Number.isFinite(n) || n < min) { toast('Bitte eine gültige Zahl eingeben'); renderPanel(); lastSig = ''; renderPanel(); return null; }
      return n;
    };
    const door = () => r && r.doors.find((d) => d.id === el.dataset.id);
    const ex = () => r && r.extras.find((x) => x.id === el.dataset.id);
    switch (f) {
      case 'roomName': mutate(() => { r.name = v.trim() || 'Raum'; }); break;
      case 'wallLen': {
        const n = needNum(v); if (n == null) return;
        if (n < 0.01) { toast('Länge muss größer als 0 sein'); lastSig = ''; renderPanel(); return; }
        mutate(() => editWall(r, +el.dataset.i, n, null));
        break;
      }
      case 'wallAng': {
        const n = needNum(v); if (n == null) return;
        if (n <= 0 || n >= 360) { toast('Winkel zwischen 0 und 360°'); lastSig = ''; renderPanel(); return; }
        mutate(() => editWall(r, +el.dataset.i, null, n));
        break;
      }
      case 'measLen': commitMeasure(el, false); return;
      case 'diagLen': {
        const n = v.trim() === '' ? 0 : parseLaser(v);
        if (!(n >= 0)) { toast('Bitte eine gültige Länge eingeben'); return; }
        mutate(() => { r.meas.diags.find((d) => d.id === el.dataset.id).len = n; reportMeasure(applyMeasure(r)); });
        break;
      }
      case 'diagA': case 'diagB': {
        const d = r.meas.diags.find((x) => x.id === el.dataset.id);
        mutate(() => { d[f === 'diagA' ? 'a' : 'b'] = +v; applyMeasure(r); });
        break;
      }
      case 'diagPair': {
        const da = +el.dataset.a, dbb = +el.dataset.b;
        const raw = v.trim();
        const n = raw === '' ? 0 : parseLaser(raw);
        if (raw !== '' && !(n > 0.01 && n < 500)) { toast('Bitte eine gültige Länge eingeben'); return; }
        let res;
        mutate(() => {
          const list = r.meas.diags.filter((d) => !(Math.min(d.a, d.b) === da && Math.max(d.a, d.b) === dbb));
          if (n > 0) list.push({ id: uid(), a: da, b: dbb, len: r4(n) });
          r.meas.diags = list;
          res = applyMeasure(r);
        });
        reportMeasure(res);
        break;
      }
      case 'measOrtho': mutate(() => { r.meas.ortho = v; applyMeasure(r); }); break;
      case 'doorName': mutate(() => { door().name = v.trim() || 'Tür'; }); break;
      case 'doorWall': mutate(() => { const d = door(); d.wall = +v; d.pos = Math.min(d.pos, Math.max(0, G.walls(r.points)[d.wall].len - d.width)); }); break;
      case 'doorWidth': { const n = needNum(v); if (n == null) return; mutate(() => { door().width = n; }); break; }
      case 'doorPos': { const n = needNum(v); if (n == null) return; mutate(() => { door().pos = n; }); break; }
      case 'doorReveal': { const n = needNum(v || 0); if (n == null) return; mutate(() => { door().reveal = n; }); break; }
      case 'doorRevSk': mutate(() => { door().revealSkirting = v; }); break;
      case 'doorRevArea': mutate(() => { door().revealArea = v; }); break;
      case 'exName': mutate(() => { ex().name = v.trim() || 'Abzug'; }); break;
      case 'exKind': mutate(() => { ex().kind = v; }); break;
      case 'exW': { const n = needNum(v); if (n == null) return; mutate(() => { ex().w = n; }); break; }
      case 'exD': { const n = needNum(v); if (n == null) return; mutate(() => { ex().d = n; }); break; }
      case 'exCount': { const n = needNum(v); if (n == null) return; mutate(() => { ex().count = Math.round(n); }); break; }
      case 'exSkirt': mutate(() => { ex().skirt = v; }); break;
      case 'pName': mutate(() => { P.name = v.trim() || 'Projekt'; }); break;
      case 'pClient': mutate(() => { P.client = v; }); break;
      case 'pAddress': mutate(() => { P.address = v; }); break;
      case 'pAuthor': mutate(() => { P.author = v; }); break;
      case 'pDate': mutate(() => { P.date = v; }); break;
      case 'pNote': mutate(() => { P.note = v; }); break;
      case 'pWasteA': { const n = needNum(v); if (n == null) return; mutate(() => { P.wasteArea = n; }); break; }
      case 'pWasteS': { const n = needNum(v); if (n == null) return; mutate(() => { P.wasteSkirt = n; }); break; }
      case 'pPiece': { const n = needNum(v || 0); if (n == null) return; mutate(() => { P.piece = n; }); break; }
    }
  });
  // Eingabe mit „Return“ bestätigen
  panel.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset.f === 'measLen') { e.preventDefault(); commitMeasure(e.target, true); return; }
    if (e.key === 'Enter' && e.target.matches('input')) e.target.blur();
  });

  // ---------------------------------------------------------------- Messen
  function setMeasInput(focus) {
    const r = room();
    const inp = panel.querySelector('[data-k="meas-input"]');
    if (!r || !inp) return;
    const v = r.meas.walls[ui.measIdx];
    inp.value = v > 0 ? fmtIn(v, 3) : '';
    if (focus) { inp.focus(); inp.select(); }
  }
  function reportMeasure(res) {
    if (res && res.maxDev > 0.01) toast(`Hinweis: Maße weichen bis ${fmt(res.maxDev * 100, 1)} cm voneinander ab`);
  }
  function measGo(i, focus = true) {
    const r = room();
    if (!r) return;
    const n = r.points.length;
    ui.measIdx = ((i % n) + n) % n;
    ui.sel = { type: 'wall', i: ui.measIdx };
    renderAll();
    setMeasInput(focus);
    scrollPanelTo(`[data-k="mrow-${ui.measIdx}"]`);
  }
  /** Messwert aus dem Eingabefeld übernehmen (optional zur nächsten offenen Wand springen). */
  function commitMeasure(inp, advance) {
    const r = room();
    if (!r || r.points.length < 3) return;
    const n = r.points.length;
    const raw = inp.value.trim();
    const i = ui.measIdx;
    while (r.meas.walls.length < n) r.meas.walls.push(0);
    if (raw !== '') {
      const v = parseLaser(raw);
      if (!(v > 0.01) || v > 500) { toast('Bitte einen gültigen Messwert eingeben (z. B. 4,235)'); inp.select(); return; }
      if (Math.abs((r.meas.walls[i] || 0) - v) > 1e-9) {
        let res;
        mutate(() => { r.meas.walls[i] = r4(v); res = applyMeasure(r); fit(); });
        reportMeasure(res);
      }
    }
    if (!advance) return;
    // nächste noch offene Wand, sonst einfach die nächste
    let next = (i + 1) % n;
    for (let s = 1; s <= n; s++) { const j = (i + s) % n; if (!(r.meas.walls[j] > 0)) { next = j; break; } }
    const allDone = Array.from({ length: n }, (_, j) => r.meas.walls[j] > 0).every(Boolean);
    if (allDone && raw !== '' && i === n - 1) toast('Alle Wände gemessen ✓');
    measGo(next, true);
  }

  // ---------------------------------------------------------------- Aktionen
  const actions = {
    measGo: (el, e) => { if (e.target.closest('input,button,select')) return; measGo(+el.dataset.i); },
    measNext: () => { const inp = panel.querySelector('[data-k="meas-input"]'); if (inp) commitMeasure(inp, true); },
    measPrev: () => measGo(ui.measIdx - 1),
    measClear: () => {
      const r = room();
      mutate(() => { r.meas.walls[ui.measIdx] = 0; applyMeasure(r); });
      setMeasInput(false);
    },
    measReset: () => {
      const r = room();
      if (!confirm('Alle Messwerte dieses Raums löschen? Die Skizze wird wiederhergestellt.')) return;
      mutate(() => { applyMeasure(Object.assign(r, { meas: Object.assign(r.meas, { walls: [], diags: [] }) })); });
      measGo(0, false);
    },
    addDiag: () => {
      const r = room();
      const n = r.points.length;
      if (n < 4) { toast('Ein Dreieck braucht keine Diagonale'); return; }
      const used = new Set(r.meas.diags.map((d) => `${d.a}-${d.b}`));
      let a = 0, b = 2;
      outer: for (let x = 0; x < n; x++) for (let y = x + 2; y < n; y++) {
        if (x === 0 && y === n - 1) continue;
        if (!used.has(`${x}-${y}`)) { a = x; b = y; break outer; }
      }
      mutate(() => r.meas.diags.push({ id: uid(), a, b, len: 0 }));
      const inp = panel.querySelector(`[data-k="dgl-${r.meas.diags[r.meas.diags.length - 1].id}"]`);
      if (inp) inp.focus();
    },
    delDiag: (el) => { const r = room(); mutate(() => { r.meas.diags = r.meas.diags.filter((d) => d.id !== el.dataset.id); applyMeasure(r); }); },
    newRoom: () => openRoomDialog(),
    openRoom: (el) => openRoom(el.dataset.id),
    ovTab: (el) => { ui.ovTab = el.dataset.tab; renderAll(); },
    delRoomCard: (el) => {
      const idx = P.rooms.findIndex((x) => x.id === el.dataset.id);
      if (idx < 0) return;
      const proj = P;
      const [removed] = proj.rooms.splice(idx, 1);
      if (proj.activeRoom === removed.id) proj.activeRoom = proj.rooms[0] ? proj.rooms[0].id : null;
      persist();
      renderAll();
      toast(`„${removed.name}“ gelöscht`, 'Rückgängig', () => {
        proj.rooms.splice(Math.min(idx, proj.rooms.length), 0, removed);
        persist();
        renderAll();
      });
    },
    delProjectCard: (el) => {
      const p = db.projects[el.dataset.id];
      if (!p) return;
      delete db.projects[p.id];
      const wasCurrent = p.id === P.id;
      if (wasCurrent) {
        const rest = Object.values(db.projects).sort((x, y) => y.updated - x.updated);
        P = rest[0] || newProject('Neues Projekt');
      }
      persist();
      renderAll();
      toast(`Projekt „${p.name}“ gelöscht`, 'Rückgängig', () => {
        db.projects[p.id] = p;
        if (wasCurrent) P = p;
        persist();
        renderAll();
      });
    },
    goOverview: () => { dropEmptyRoom(); go('overview'); },
    goProjects: () => go('projects'),
    editProject: () => openProjectDialog('edit'),
    delCurrentProject: () => {
      if (!confirm(`Projekt „${P.name}“ mit allen Räumen endgültig löschen?`)) return;
      delete db.projects[P.id];
      dlgP.close();
      const rest = Object.values(db.projects).sort((x, y) => y.updated - x.updated);
      P = rest[0] || newProject('Neues Projekt');
      if (!rest.length) db.projects[P.id] = P;
      persist();
      go('projects');
    },
    selRoom: (el) => { P.activeRoom = el.dataset.id; ui.sel = null; ui.measIdx = 0; ui.mode = ui.mode === 'draw' ? 'edit' : ui.mode; ui.draft = []; persist(); fit(); renderAll(); },
    delRoom: () => {
      const r = room();
      if (!r || !confirm(`Raum „${r.name}“ löschen?`)) return;
      mutate(() => {
        P.rooms = P.rooms.filter((x) => x.id !== r.id);
        P.activeRoom = P.rooms[0] ? P.rooms[0].id : null;
      });
      go('overview');
    },
    selWall: (el, e) => {
      if (e.target.closest('input,button,select')) return;
      ui.sel = { type: 'wall', i: +el.dataset.i };
      renderAll();
    },
    split: (el) => {
      const r = room();
      let v;
      mutate(() => { v = splitWall(r, +el.dataset.i); });
      ui.sel = { type: 'vertex', i: v };
      renderAll();
      toast(`Ecke ${letter(v)} eingefügt – im Plan ziehen oder Winkel eintragen`);
    },
    delVertex: () => {
      const r = room();
      if (!ui.sel || ui.sel.type !== 'vertex') return;
      const i = ui.sel.i;
      snapshot();
      if (deleteVertex(r, i)) { ui.sel = null; persist(); renderAll(); } else undoStack.pop();
    },
    addDoorWall: (el) => addDoor(+el.dataset.i),
    addDoor: () => addDoor(ui.sel && ui.sel.type === 'wall' ? ui.sel.i : 0),
    delDoor: (el) => {
      const r = room();
      mutate(() => { r.doors = r.doors.filter((d) => d.id !== el.dataset.id); });
      ui.sel = null; renderAll();
    },
    flipHinge: (el) => { const d = room().doors.find((x) => x.id === el.dataset.id); mutate(() => { d.hingeEnd = !d.hingeEnd; }); },
    flipSwing: (el) => { const d = room().doors.find((x) => x.id === el.dataset.id); mutate(() => { d.swingOut = !d.swingOut; }); },
    addExtra: (el) => {
      const r = room();
      const add = el.dataset.kind === 'add';
      mutate(() => r.extras.push({ id: uid(), name: add ? 'Nische' : 'Säule / Schacht', kind: add ? 'add' : 'sub', w: add ? 1 : 0.3, d: add ? 0.3 : 0.3, count: 1, skirt: false }));
    },
    delExtra: (el) => { const r = room(); mutate(() => { r.extras = r.extras.filter((x) => x.id !== el.dataset.id); }); },
    finishDraw: () => finishDraw(),
    cancelDraw: () => {
      ui.mode = 'edit'; ui.draft = []; ui.draftPreview = null;
      const r = room();
      if (r && r.points.length < 3) { dropEmptyRoom(); go('overview'); return; }
      renderAll();
    },
    draftBack: () => { ui.draft.pop(); renderAll(); },
    pdf: () => exportPdf(),
    newProject: () => openProjectDialog('new'),
    openProject: (el) => {
      P = db.projects[el.dataset.id];
      P.activeRoom = P.rooms[0] ? P.rooms[0].id : null;
      undoStack.length = 0;
      ui.ovTab = !P.rooms.length && (P.openings || []).length ? 'openings' : 'rooms';
      persist();
      if (OP) OP.preload(P).catch(() => {});
      go('overview');
    },
    exportJson: () => {
      const photos = {};
      (P.openings || []).forEach((o) => (o.photos || []).forEach((id) => { const d = OP && OP.photoCache.get(id); if (d) photos[id] = d; }));
      const blob = new Blob([JSON.stringify({ app: 'raumaufmass', version: 2, project: P, photos }, null, 2)], { type: 'application/json' });
      deliverFile(blob, `${fileBase()}.json`, 'application/json');
    },
    importJson: () => $('#fileImport').click(),
  };

  function addDoor(wallIdx) {
    const r = room();
    if (!r || r.points.length < 3) return;
    const w = G.walls(r.points)[wallIdx];
    const width = Math.min(DEFAULT_DOOR, w.len);
    let id;
    mutate(() => {
      const d = newDoor(wallIdx, Math.max(0, (w.len - width) / 2), width);
      d.name = `Tür ${r.doors.length + 1}`;
      r.doors.push(d);
      id = d.id;
    });
    ui.sel = { type: 'door', id };
    ui.tab = 'doors';
    renderAll();
    scrollPanelTo(`[data-k="door-${id}"]`);
  }

  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.room-card[data-act], .project-card[data-act]')) { e.preventDefault(); e.target.click(); }
  });
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = actions[el.dataset.act];
    if (fn) fn(el, e);
  });
  $$('.panel-tabs button').forEach((b) => b.addEventListener('click', () => {
    ui.tab = b.dataset.tab;
    if (ui.tab === 'measure' && room()) { const n = room().points.length; ui.measIdx = clamp(ui.measIdx, 0, Math.max(0, n - 1)); ui.sel = { type: 'wall', i: ui.measIdx }; }
    renderAll();
    panel.scrollTop = 0;
  }));
  $$('.seg button').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  $('#btnFit').addEventListener('click', () => { fit(); renderPlan(); });
  $('#btnSnap').addEventListener('click', () => { ui.snap = !ui.snap; renderContext(); toast(ui.snap ? 'Fang an: 5-cm-Raster, Ausrichten, 15°-Winkel' : 'Fang aus: freie Position (1 cm)'); });
  $('#btnDiag').addEventListener('click', () => { ui.showDiag = !ui.showDiag; renderContext(); renderPlan(); toast(ui.showDiag ? 'Alle Diagonalen werden angezeigt' : 'Nur gemessene Diagonalen'); });
  $('#btnUndo').addEventListener('click', undo);
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !e.target.matches('input,textarea')) { e.preventDefault(); undo(); }
    if (e.key === 'Escape' && ui.mode === 'draw') actions.cancelDraw();
    else if (e.key === 'Escape' && (ui.screen === 'room' || ui.screen === 'opening') && !document.querySelector('dialog[open], .photo-viewer')) actions.goOverview();
  });

  $('#fileImport').addEventListener('change', async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const d = JSON.parse(await f.text());
      const p = normalizeProject(d.project || d);
      if (!Array.isArray(p.rooms)) throw new Error();
      if (db.projects[p.id]) p.id = uid();
      p.updated = Date.now();
      if (OP && d.photos) await OP.importPhotos(d.photos);
      db.projects[p.id] = p; P = p; persist(); go('overview');
      toast(`„${p.name}“ importiert`);
    } catch (err) {
      toast('Die Datei ist kein gültiges Projekt');
    }
  });

  // ---------------------------------------------------------------- Raum-Dialog
  const dlg = $('#dlgRoom');
  const form = $('#formRoom');
  function openRoomDialog() {
    form.reset();
    form.elements.name.value = `Raum ${P.rooms.length + 1}`;
    $('#roomError').textContent = '';
    updateShapeFields();
    if (typeof dlg.showModal === 'function') dlg.showModal(); else dlg.setAttribute('open', '');
  }
  function updateShapeFields() {
    const s = form.elements.shape.value;
    $$('.shape-fields', form).forEach((el) => { el.hidden = el.dataset.shape !== s; });
    $('#btnRoomOk').textContent = s === 'draw' ? 'Skizze starten' : 'Anlegen';
  }
  form.addEventListener('change', (e) => { if (e.target.name === 'shape') updateShapeFields(); });
  form.addEventListener('submit', (e) => {
    const sub = e.submitter && e.submitter.value;
    if (sub !== 'ok') return;
    const f = form.elements;
    const s = f.shape.value;
    const v = (n) => num(f[n].value);
    const name = f.name.value.trim() || `Raum ${P.rooms.length + 1}`;
    let pts = null;
    try {
      const need = (...xs) => { if (xs.some((x) => !(x > 0))) throw new Error('Bitte alle Maße größer 0 eingeben.'); };
      if (s === 'rect') { need(v('rect_a'), v('rect_b')); pts = Shapes.rect(v('rect_a'), v('rect_b')); }
      if (s === 'trap') { need(v('t_a'), v('t_b'), v('t_h')); if (!Number.isFinite(v('t_o'))) throw new Error('Versatz eingeben (0 möglich).'); pts = Shapes.trap(v('t_a'), v('t_b'), v('t_h'), v('t_o')); }
      if (s === 'L') { need(v('l_a'), v('l_b'), v('l_c'), v('l_d')); pts = Shapes.L(v('l_a'), v('l_b'), v('l_c'), v('l_d')); }
      if (s === 'quad') { need(v('q_a'), v('q_b'), v('q_c'), v('q_d'), v('q_e')); pts = Shapes.quad(v('q_a'), v('q_b'), v('q_c'), v('q_d'), v('q_e')); }
    } catch (err) {
      e.preventDefault();
      $('#roomError').textContent = err.message;
      return;
    }
    const r = newRoom(name, pts || []);
    snapshot();
    P.rooms.push(r);
    persist();
    openRoom(r.id, s === 'draw' ? 'measure' : 'walls');
    if (s === 'draw') { ui.mode = 'draw'; ui.draft = []; renderAll(); }
  });

  // ---------------------------------------------------------------- Dateien ausgeben (iOS-App, Web, Desktop)
  const fileBase = () => `Aufmass_${(P.name || 'Projekt').replace(/[^\wäöüÄÖÜß-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '')}_${P.date || ''}`.replace(/_$/, '');

  async function blobToBase64(blob) {
    const buf = new Uint8Array(await blob.arrayBuffer());
    let s = '';
    for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
    return btoa(s);
  }

  async function deliverFile(blob, filename, type) {
    const Cap = window.Capacitor;
    // 1) Native iOS-App: Datei schreiben und Teilen-Menü öffnen (Sichern in „Dateien“, AirDrop, Mail …)
    if (Cap && Cap.isNativePlatform && Cap.isNativePlatform() && Cap.Plugins && Cap.Plugins.Filesystem && Cap.Plugins.Share) {
      try {
        const data = await blobToBase64(blob);
        const res = await Cap.Plugins.Filesystem.writeFile({ path: filename, data, directory: 'DOCUMENTS' });
        await Cap.Plugins.Share.share({ title: filename, url: res.uri, dialogTitle: filename });
        return;
      } catch (err) {
        if (String(err && err.message).toLowerCase().includes('cancel')) return;
        console.warn(err);
      }
    }
    // 2) iPhone/iPad im Browser oder als Home-Bildschirm-App: Teilen-Menü
    const file = new File([blob], filename, { type });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: filename }); return; } catch (err) { if (err && err.name === 'AbortError') return; }
    }
    // 3) Download
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  }

  // ---------------------------------------------------------------- PDF
  function exportPdf() {
    if (!window.jspdf) { toast('PDF-Modul nicht geladen'); return; }
    if (!P.rooms.some((r) => r.points.length >= 3) && !(P.openings || []).length) { toast('Noch nichts aufgemessen – erst einen Raum, eine Tür oder ein Fenster anlegen'); return; }
    try {
      const doc = buildPdf();
      deliverFile(doc.output('blob'), `${fileBase()}.pdf`, 'application/pdf');
    } catch (err) {
      console.error(err);
      toast('PDF konnte nicht erstellt werden');
    }
  }

  function buildPdf() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
    // Standardschrift kennt nur WinAnsi-Zeichen: Sonderzeichen ersetzen
    const clean = (t) => String(t).replace(/[\u2212]/g, '-').replace(/[^\x00-\xFF\u2013\u2014\u2018-\u201E\u2022\u2026\u20AC]/g, '?');
    const rawText = doc.text.bind(doc);
    doc.text = (t, ...rest) => rawText(Array.isArray(t) ? t.map(clean) : clean(t), ...rest);
    const PW = 210, PH = 297, M = 16;
    const pc = calcProject();
    const accent = [29, 78, 216];
    const grey = [95, 100, 112];
    const dateStr = P.date ? new Date(P.date + 'T12:00:00').toLocaleDateString('de-DE') : '';

    const setFont = (size, style = 'normal', color = [20, 22, 28]) => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...color); };
    let y = M;
    const ensure = (h) => { if (y + h > PH - 18) { doc.addPage(); y = M; } };

    function table(cols, rows, opts = {}) {
      const rowH = opts.rowH || 7;
      const x0 = M;
      const totalW = cols.reduce((s, c) => s + c.w, 0);
      const head = () => {
        ensure(rowH * 2);
        doc.setFillColor(238, 240, 244);
        doc.rect(x0, y, totalW, rowH, 'F');
        setFont(9, 'bold', grey);
        let x = x0;
        cols.forEach((c) => { doc.text(c.label, c.align === 'right' ? x + c.w - 2 : x + 2, y + rowH - 2.2, { align: c.align === 'right' ? 'right' : 'left' }); x += c.w; });
        y += rowH;
      };
      head();
      rows.forEach((row) => {
        if (y + rowH > PH - 18) { doc.addPage(); y = M; head(); }
        const bold = row.bold;
        setFont(10, bold ? 'bold' : 'normal');
        let x = x0;
        cols.forEach((c, i) => {
          let t = String(row.cells[i] ?? '');
          while (t.length > 3 && doc.getTextWidth(t) > c.w - 4) t = t.slice(0, -2) + '…';
          doc.text(t, c.align === 'right' ? x + c.w - 2 : x + 2, y + rowH - 2.2, { align: c.align === 'right' ? 'right' : 'left' });
          x += c.w;
        });
        doc.setDrawColor(bold ? 40 : 215, bold ? 40 : 218, bold ? 40 : 224);
        doc.setLineWidth(bold ? 0.4 : 0.2);
        doc.line(x0, y + rowH, x0 + totalW, y + rowH);
        y += rowH;
      });
      y += 7;
    }

    // ---- Seite 1: Übersicht
    const hasRooms = pc.rooms.some((x) => x.r.points.length >= 3);
    const hasOps = !!(OP && (P.openings || []).length);
    doc.setFillColor(...accent);
    doc.rect(0, 0, PW, 4, 'F');
    y = 20;
    setFont(22, 'bold');
    doc.text('Aufmaß', M, y);
    setFont(11, 'normal', grey);
    doc.text(hasRooms && hasOps ? 'Bodenfläche, Sockelleisten, Türen und Fenster' : hasRooms ? 'Bodenfläche und Sockelleisten' : 'Türen und Fenster', M, y + 7);
    setFont(10, 'normal', grey);
    doc.text(dateStr, PW - M, y, { align: 'right' });
    y += 18;

    const info = [['Projekt', P.name], ['Kunde', P.client], ['Adresse', P.address], ['Aufgenommen von', P.author], ['Datum', dateStr]].filter((x) => x[1]);
    info.forEach(([k, v]) => {
      setFont(10, 'bold', grey); doc.text(k, M, y);
      setFont(11, 'normal');
      const lines = doc.splitTextToSize(String(v), PW - 2 * M - 42);
      doc.text(lines, M + 42, y);
      y += 6 * lines.length;
    });
    y += 6;

    if (hasRooms) {
    setFont(13, 'bold');
    doc.text('Zusammenfassung', M, y);
    y += 4;
    table(
      [{ label: 'Raum', w: 88 }, { label: 'Bodenfläche', w: 32, align: 'right' }, { label: 'Umfang', w: 29, align: 'right' }, { label: 'Sockelleiste', w: 29, align: 'right' }],
      pc.rooms.map((x) => ({ cells: [x.r.name, `${fmt(x.c.net)} m²`, `${fmt(x.c.perim)} m`, `${fmt(x.c.skirting)} m`] }))
        .concat([{ bold: true, cells: ['Summe', `${fmt(pc.net)} m²`, '', `${fmt(pc.skirting)} m`] }]),
    );

    ensure(40);
    doc.setFillColor(238, 243, 255);
    doc.setDrawColor(...accent);
    doc.setLineWidth(0.4);
    const boxH = P.piece > 0 ? 32 : 25;
    doc.roundedRect(M, y, PW - 2 * M, boxH, 2, 2, 'FD');
    setFont(11, 'bold', accent);
    doc.text('Materialbedarf inkl. Verschnitt', M + 5, y + 7);
    setFont(11, 'normal');
    doc.text(`Bodenbelag (+${fmt(P.wasteArea, 0)} % Verschnitt):`, M + 5, y + 15);
    doc.text(`Sockelleiste (+${fmt(P.wasteSkirt, 0)} % Verschnitt):`, M + 5, y + 22);
    setFont(12, 'bold');
    doc.text(`${fmt(pc.netW)} m²`, PW - M - 5, y + 15, { align: 'right' });
    doc.text(`${fmt(pc.skW)} lfm`, PW - M - 5, y + 22, { align: 'right' });
    if (P.piece > 0) {
      setFont(11, 'normal');
      doc.text(`Leisten à ${fmt(P.piece)} m:`, M + 5, y + 29);
      setFont(12, 'bold');
      doc.text(`${pc.pieces} Stück`, PW - M - 5, y + 29, { align: 'right' });
    }
    y += boxH + 8;
    }
    const opLine = OP && hasRooms ? OP.pdfSummaryLine() : '';
    if (opLine) {
      ensure(14);
      setFont(11, 'bold'); doc.text('Türen & Fenster', M, y); y += 6;
      setFont(10, 'normal'); doc.text(opLine, M, y); y += 9;
    }

    if (P.note && P.note.trim()) {
      ensure(20);
      setFont(11, 'bold'); doc.text('Notizen', M, y); y += 6;
      setFont(10, 'normal');
      doc.splitTextToSize(P.note, PW - 2 * M).forEach((ln) => { ensure(6); doc.text(ln, M, y); y += 5; });
    }

    // ---- Je Raum eine Seite
    pc.rooms.forEach(({ r, c }) => {
      if (r.points.length < 3) return;
      doc.addPage();
      doc.setFillColor(...accent);
      doc.rect(0, 0, PW, 4, 'F');
      y = 18;
      setFont(16, 'bold');
      doc.text(r.name, M, y);
      setFont(11, 'bold', accent);
      doc.text(`${fmt(c.net)} m²  ·  Sockelleiste ${fmt(c.skirting)} m`, PW - M, y, { align: 'right' });
      y += 6;
      const box = { x: M, y, w: PW - 2 * M, h: 105 };
      drawPlanPdf(doc, r, c, box);
      y = box.y + box.h + 8;

      setFont(12, 'bold'); doc.text('Wände', M, y); y += 2;
      const n = r.points.length;
      table(
        [{ label: 'Wand', w: 30 }, { label: 'Länge', w: 40, align: 'right' }, { label: 'Innenwinkel an Anfangsecke', w: 60, align: 'right' }, { label: 'Aufmaß', w: 48, align: 'right' }],
        c.walls.map((w, i) => ({ cells: [`${letter(i)}–${letter((i + 1) % n)}`, `${fmt(w.len)} m`, `${fmt(c.angles[i], 1)}°`, r.meas.walls[i] > 0 ? `gemessen ${fmt(r.meas.walls[i], 3)} m` : (r.meas.walls.some((v) => v > 0) ? 'aus Skizze' : '')] })),
        { rowH: 5.6 },
      );
      const dg = allDiags(r);
      if (dg.length) {
        ensure(16);
        setFont(12, 'bold'); doc.text('Diagonalen (Kontrollmaße)', M, y); y += 2;
        table([{ label: 'Diagonale', w: 30 }, { label: 'laut Plan', w: 40, align: 'right' }, { label: 'gemessen', w: 40, align: 'right' }, { label: 'Differenz', w: 40, align: 'right' }],
          dg.map((d) => ({ cells: [`${letter(d.a)}–${letter(d.b)}`, `${fmt(d.calc, 3)} m`, d.meas ? `${fmt(d.meas, 3)} m` : '–', d.meas ? (Math.abs(d.dev) <= 0.005 ? 'passt' : `${d.dev > 0 ? '+' : '-'}${fmt(Math.abs(d.dev) * 100, 1)} cm`) : ''] })), { rowH: 5.6 });
      }
      if (r.doors.length) {
        ensure(20);
        setFont(12, 'bold'); doc.text('Türen / Öffnungen', M, y); y += 2;
        table(
          [{ label: 'Bezeichnung', w: 50 }, { label: 'Wand', w: 22 }, { label: 'ab Ecke', w: 26, align: 'right' }, { label: 'Breite', w: 26, align: 'right' }, { label: 'Laibung', w: 26, align: 'right' }, { label: 'Abzug', w: 28, align: 'right' }],
          c.doors.map((d) => ({ cells: [d.name, `${letter(d.wall)}–${letter((d.wall + 1) % n)}`, `${fmt(d.effPos)} m`, `${fmt(d.width)} m`, d.reveal ? `${fmt(d.reveal)} m` : '–', `${fmt(d.eff)} m`] })),
          { rowH: 5.6 },
        );
      }
      if (r.extras.length) {
        ensure(20);
        setFont(12, 'bold'); doc.text('Abzüge / Zuschläge', M, y); y += 2;
        table(
          [{ label: 'Bezeichnung', w: 56 }, { label: 'Art', w: 26 }, { label: 'Maße', w: 40, align: 'right' }, { label: 'Anzahl', w: 22, align: 'right' }, { label: 'Fläche', w: 34, align: 'right' }],
          c.extras.map((x) => ({ cells: [x.name, x.kind === 'add' ? 'Zuschlag' : 'Abzug', `${fmt(x.w)} × ${fmt(x.d)} m`, String(x.count), `${x.kind === 'add' ? '+' : '−'} ${fmt(x.area)} m²`] })),
          { rowH: 5.6 },
        );
      }
      ensure(48);
      setFont(12, 'bold'); doc.text('Berechnung', M, y); y += 2;
      const calcRows = [{ cells: ['Grundfläche laut Umriss', `${fmt(c.base)} m²`] }];
      if (c.sub) calcRows.push({ cells: ['− Abzüge', `${fmt(c.sub)} m²`] });
      if (c.add) calcRows.push({ cells: ['+ Zuschläge', `${fmt(c.add)} m²`] });
      if (c.revealA) calcRows.push({ cells: ['+ Boden in Türdurchgängen', `${fmt(c.revealA)} m²`] });
      calcRows.push({ bold: true, cells: ['Bodenfläche netto', `${fmt(c.net)} m²`] });
      calcRows.push({ cells: ['Umfang', `${fmt(c.perim)} m`] });
      if (c.doorW) calcRows.push({ cells: ['− Türöffnungen', `${fmt(c.doorW)} m`] });
      if (c.revealSk) calcRows.push({ cells: ['+ Laibungen', `${fmt(c.revealSk)} m`] });
      if (c.exSk) calcRows.push({ cells: ['+ Säulen / Nischen', `${fmt(c.exSk)} m`] });
      calcRows.push({ bold: true, cells: ['Sockelleiste', `${fmt(c.skirting)} m`] });
      table([{ label: 'Position', w: 120 }, { label: 'Wert', w: 58, align: 'right' }], calcRows, { rowH: 5.8 });
    });

    // ---- Türen & Fenster
    if (OP) {
      const ctx = {
        doc, M, PW, PH, table, ensure, getY: () => y, setY: (v) => { y = v; },
        header: (title) => {
          doc.setFillColor(...accent); doc.rect(0, 0, PW, 4, 'F');
          y = 18; setFont(16, 'bold'); doc.text(title, M, y); y += 8;
        },
        heading: (t) => { ensure(18); setFont(12, 'bold'); doc.text(t, M, y); y += 2; },
      };
      ctx.samePage = !hasRooms; // nur Türen/Fenster: direkt auf Seite 1 weiter
      OP.pdfPages(ctx);
    }

    // ---- Fußzeilen
    const pages = doc.getNumberOfPages();
    for (let i = 1; i <= pages; i++) {
      doc.setPage(i);
      setFont(8, 'normal', grey);
      doc.setDrawColor(215, 218, 224); doc.setLineWidth(0.2);
      doc.line(M, PH - 12, PW - M, PH - 12);
      doc.text(`${P.name}${P.client ? ' · ' + P.client : ''}`, M, PH - 7.5);
      doc.text(`Seite ${i} von ${pages}`, PW - M, PH - 7.5, { align: 'right' });
    }
    doc.setProperties({ title: `Aufmaß ${P.name}`, subject: 'Bodenfläche und Sockelleisten', creator: 'Raumaufmaß' });
    return doc;
  }

  function drawPlanPdf(doc, r, c, box) {
    const p = r.points;
    const b = G.bounds(p);
    const pad = 14;
    const raw = Math.min((box.w - 2 * pad) / Math.max(b.w, 0.1), (box.h - 2 * pad) / Math.max(b.h, 0.1)); // mm pro m
    const nice = [10, 20, 25, 50, 75, 100, 125, 150, 200, 250, 300, 400, 500, 750, 1000];
    const N = nice.find((x) => 1000 / x <= raw) || Math.ceil(1000 / raw);
    const s = 1000 / N;
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const mx = (b.minX + b.maxX) / 2, my = (b.minY + b.maxY) / 2;
    const T = (q) => ({ x: cx + (q.x - mx) * s, y: cy - (q.y - my) * s });

    doc.setDrawColor(215, 218, 224);
    doc.setLineWidth(0.2);
    doc.rect(box.x, box.y, box.w, box.h);
    doc.setFontSize(8); doc.setTextColor(95, 100, 112); doc.setFont('helvetica', 'normal');
    doc.text(`Maßstab 1:${N} (bei Druck auf A4 in Originalgröße)`, box.x + 2, box.y + box.h - 2);

    // Fläche
    const tp = p.map(T);
    doc.setFillColor(226, 234, 252);
    doc.lines(tp.slice(1).map((q, i) => [q.x - tp[i].x, q.y - tp[i].y]), tp[0].x, tp[0].y, [1, 1], 'F', true);
    // Wände
    doc.setDrawColor(30, 32, 38);
    doc.setLineWidth(0.9);
    doc.setLineCap('round');
    c.walls.forEach((w) => { const a = T(w.a), bb = T(w.b); doc.line(a.x, a.y, bb.x, bb.y); });
    // Türen
    r.doors.forEach((d) => {
      const g = doorGeom(r, d, c);
      if (!g) return;
      const s1 = T(g.start), s2 = T(g.end), h = T(g.hinge), lf = T(g.leaf);
      doc.setDrawColor(255, 255, 255); doc.setLineWidth(1.4); doc.line(s1.x, s1.y, s2.x, s2.y);
      doc.setDrawColor(194, 65, 12); doc.setLineWidth(0.35); doc.line(h.x, h.y, lf.x, lf.y);
      doc.setLineWidth(0.2);
      const arc = g.arc.map(T);
      for (let i = 1; i < arc.length; i++) doc.line(arc[i - 1].x, arc[i - 1].y, arc[i].x, arc[i].y);
      doc.setFontSize(7); doc.setTextColor(194, 65, 12);
      const m = { x: (s1.x + s2.x) / 2, y: (s1.y + s2.y) / 2 };
      doc.text(`${fmt(d.width)}`, m.x, m.y + 0.5, { align: 'center', baseline: 'middle' });
    });
    // Diagonalen
    const dgs = allDiags(r).filter((d) => d.meas || p.length <= 5);
    doc.setDrawColor(150, 155, 165); doc.setLineWidth(0.2);
    if (doc.setLineDashPattern) doc.setLineDashPattern([1.2, 1.2], 0);
    dgs.forEach((d) => { const a = T(p[d.a]), bb = T(p[d.b]); doc.line(a.x, a.y, bb.x, bb.y); });
    if (doc.setLineDashPattern) doc.setLineDashPattern([], 0);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.setTextColor(110, 115, 125);
    dgs.forEach((d) => {
      const a = T(p[d.a]), bb = T(p[d.b]);
      const t = `${letter(d.a)}–${letter(d.b)} ${fmt(d.calc)}`;
      const ang = textAlong(p[d.a], p[d.b]);
      const tw = doc.getTextWidth(t);
      const u = { x: Math.cos(rad(ang)), y: -Math.sin(rad(ang)) };
      const mx = a.x + (bb.x - a.x) * 0.3, my = a.y + (bb.y - a.y) * 0.3;
      doc.text(t, mx - u.x * (tw / 2) + Math.sin(rad(ang)) * -1, my - u.y * (tw / 2) + Math.cos(rad(ang)) * -1, { angle: ang });
    });
    // Maße
    const so = G.orient(p);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(20, 22, 28);
    c.walls.forEach((w) => {
      const out = { x: w.u.y * so, y: -w.u.x * so };
      const mid = T({ x: (w.a.x + w.b.x) / 2 + out.x * (4.2 / s), y: (w.a.y + w.b.y) / 2 + out.y * (4.2 / s) });
      const t = fmt(w.len);
      const ang = textAlong(w.a, w.b);
      const tw = doc.getTextWidth(t);
      const u = { x: Math.cos(rad(ang)), y: -Math.sin(rad(ang)) }; // Richtung auf dem Blatt
      const nrm = { x: Math.sin(rad(ang)), y: Math.cos(rad(ang)) }; // nach unten senkrecht
      const x = mid.x - u.x * (tw / 2) + nrm.x * 1.1;
      const yy = mid.y - u.y * (tw / 2) + nrm.y * 1.1;
      doc.text(t, x, yy, { angle: ang });
    });
    // Eckbuchstaben
    doc.setFontSize(8); doc.setTextColor(29, 78, 216);
    const n = p.length;
    p.forEach((q, i) => {
      const a = p[(i - 1 + n) % n], bq = p[(i + 1) % n];
      const u1 = G.walls([a, q])[0].u, u2 = G.walls([q, bq])[0].u;
      let ox = (u1.y + u2.y) * so, oy = -(u1.x + u2.x) * so;
      const L = Math.hypot(ox, oy) || 1;
      const pt = T({ x: q.x + (ox / L) * (3.2 / s), y: q.y + (oy / L) * (3.2 / s) });
      doc.text(letter(i), pt.x, pt.y, { align: 'center', baseline: 'middle' });
    });
    // Flächenangabe im Raum
    const lp = T(G.labelPoint(p));
    doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(29, 78, 216);
    doc.text(`${fmt(c.net)} m²`, lp.x, lp.y, { align: 'center', baseline: 'middle' });
  }

  // ---------------------------------------------------------------- Start
  if (!P.activeRoom && P.rooms[0]) P.activeRoom = P.rooms[0].id;
  // Türen & Fenster (eigenes Modul)
  const RA = {
    $, esc, uid, toast, ui,
    get P() { return P; },
    persist, snapshot, renderAll, go,
  };
  const OP = window.OpeningsModule ? window.OpeningsModule(RA) : null;
  if (OP) { OP.preload(P).catch(() => {}); setTimeout(() => OP.gc(db), 3000); }
  window.addEventListener('resize', resize);
  if (window.ResizeObserver) new ResizeObserver(resize).observe(svg);
  renderAll();

  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol) && !(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform())) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // für Tests
  window.__raumaufmass = { G, Shapes, calcRoom, calcProject, buildPdf, allDiags, OP, get project() { return P; }, get ui() { return ui; } };
})();
