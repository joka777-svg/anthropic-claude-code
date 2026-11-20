/* Raumaufmaß – Aufmaß von Türen und Fenstern.
 * Wird von app.js mit window.OpeningsModule(RA) gestartet. Alle Maße intern in Millimetern.
 */
'use strict';
window.OpeningsModule = function (RA) {
  const { $, esc, uid, toast } = RA;

  // ---------------------------------------------------------------- Helfer
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const mm = (v) => (isNum(v) ? (Math.round(v * 10) / 10).toLocaleString('de-DE', { maximumFractionDigits: 1, useGrouping: false }) : '–');
  const mmIn = (v) => (isNum(v) ? String(Math.round(v * 10) / 10).replace('.', ',') : '');
  const m2 = (v) => (isNum(v) ? v.toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '–');
  /** Längen lesen. Mit Einheit (mm/cm/m) eindeutig. Ohne Einheit:
   *  kleine Maße (Wandstärke, Laibung, Fugen …): < 1 → Meter (Laser), sonst Millimeter;
   *  große Maße (Breite, Höhe …): < 10 → Meter (Laser), < 300 → Zentimeter, sonst Millimeter. */
  function parseMM(s, small) {
    const t = String(s ?? '').trim().toLowerCase().replace(/\s/g, '');
    if (!t) return null;
    const mt = t.match(/-?\d+(?:[.,]\d+)?/);
    if (!mt) return NaN;
    let v = Number(mt[0].replace(',', '.'));
    if (/mm/.test(t)) return v;
    if (/cm/.test(t)) return v * 10;
    if (/m/.test(t)) return v * 1000;
    if (small) return v < 1 ? v * 1000 : v;
    if (v < 10) return v * 1000;
    if (v < 300) return v * 10;
    return v;
  }
  const minOf = (arr) => { const v = arr.filter(isNum); return v.length ? Math.min(...v) : null; };
  const maxOf = (arr) => { const v = arr.filter(isNum); return v.length ? Math.max(...v) : null; };

  // ---------------------------------------------------------------- Datenmodell
  const DOOR_TYPES = ['Zimmertür', 'Wohnungseingangstür', 'Haustür', 'Nebeneingangstür', 'Schiebetür', 'Glastür', 'Brandschutztür'];
  const PASS = 'Durchgangszarge (ohne Türblatt)';
  const FRAMES = ['Umfassungszarge', PASS, 'Blockzarge', 'Stahlzarge', 'Blockrahmen', 'ohne Zarge'];
  const isPass = (o) => o.type === 'door' && o.frame === PASS;
  const LOCKS = ['BB (Buntbart)', 'PZ (Profilzylinder)', 'WC (Bad)', 'ohne Schloss'];
  const SASH_TYPES = [
    ['DK-L', 'Dreh-Kipp, Anschlag links'], ['DK-R', 'Dreh-Kipp, Anschlag rechts'],
    ['D-L', 'Dreh, Anschlag links'], ['D-R', 'Dreh, Anschlag rechts'],
    ['K', 'Kipp'], ['F', 'Festverglasung'], ['S', 'Schiebe'],
  ];
  const MATERIALS = ['Kunststoff', 'Holz', 'Aluminium', 'Holz-Alu', 'Kunststoff-Alu'];
  const GLAZING = ['2-fach', '3-fach', '3-fach Schallschutz', 'Sicherheitsglas (VSG)', 'Ornamentglas'];
  const SHUTTERS = ['kein', 'Aufsatzkasten', 'Vorbaukasten', 'bestehender Kasten', 'Raffstore'];
  const DRIVES = ['Gurt', 'Kurbel', 'Motor', 'Motor + Funk'];
  const MOUNTS = ['stumpf (ohne Anschlag)', 'Innenanschlag', 'Außenanschlag'];
  const HREFS = [['OFF', 'ab Fertigfußboden (OFF)'], ['RFB', 'ab Rohfußboden'], ['MR', 'ab Meterriss (bis Sturz)']];

  // Normmaße für Türen (DIN 18101): Rohbaurichtmaß → Türblatt-Außenmaß
  const NORM_W = [[635, 610], [760, 735], [885, 860], [1010, 985], [1135, 1110], [1260, 1235]];
  const NORM_H = [[1885, 1860], [2005, 1985], [2130, 2110]];
  const NORM_TOL = 10;

  function defaults(type) {
    const base = {
      id: uid(), type, pos: '', roomId: '', location: '', qty: 1,
      w: [null, null, null], h: [null, null, null], diag: [null, null], wall: [null, null],
      outer: { w: null, h: null },
      note: '', photos: [],
    };
    if (type === 'door') {
      return Object.assign(base, {
        doorType: 'Zimmertür', din: 'L', openIn: true, frame: 'Umfassungszarge', lock: 'BB (Buntbart)',
        heightRef: 'OFF', floorBuild: null, finish: '',
      });
    }
    return Object.assign(base, {
      sashes: 1, sashTypes: ['DK-R', 'DK-L', 'F'], transom: false, transomH: null, balcony: false,
      mount: 'stumpf (ohne Anschlag)', material: 'Kunststoff', colorIn: 'weiß', colorOut: 'weiß', glazing: '3-fach',
      shutter: 'kein', shutterDrive: 'Gurt', parapet: null,
      gapSide: 15, gapTop: 15, gapBottom: 30,
      ext: { l: 0, r: 0, t: 0, b: 0 },
      sillIn: { on: false, reveal: null, front: 20, side: 20, insert: 0, material: '' },
      sillOut: { on: false, reveal: null, front: 40, side: 15, insert: 20, material: '' },
    });
  }
  function normalize(o) {
    const d = defaults(o.type === 'door' ? 'door' : 'window');
    const out = Object.assign(d, o);
    for (const k of ['w', 'h']) out[k] = [0, 1, 2].map((i) => (isNum((o[k] || [])[i]) ? o[k][i] : null));
    for (const k of ['diag', 'wall']) out[k] = [0, 1].map((i) => (isNum((o[k] || [])[i]) ? o[k][i] : null));
    out.outer = Object.assign({ w: null, h: null }, o.outer || {});
    if (out.type === 'window') {
      out.sillIn = Object.assign(defaults('window').sillIn, o.sillIn || {});
      out.sillOut = Object.assign(defaults('window').sillOut, o.sillOut || {});
      out.ext = Object.assign({ l: 0, r: 0, t: 0, b: 0 }, o.ext || {});
      out.sashTypes = [0, 1, 2].map((i) => (o.sashTypes && o.sashTypes[i]) || ['DK-R', 'DK-L', 'F'][i]);
    }
    out.photos = Array.isArray(o.photos) ? o.photos.slice() : [];
    return out;
  }
  /** Einmalig vervollständigen – dasselbe Objekt bleibt erhalten (wichtig für laufende Foto-Speicherung). */
  function ensure(o) {
    if (o.__ok) return o;
    const n = normalize(o);
    Object.keys(n).forEach((k) => { o[k] = n[k]; });
    Object.defineProperty(o, '__ok', { value: true, enumerable: false });
    return o;
  }
  const list = () => { if (!RA.P.openings) RA.P.openings = []; return RA.P.openings.map(ensure); };
  const cur = () => { const o = (RA.P.openings || []).find((x) => x.id === RA.ui.openingId); return o ? ensure(o) : null; };

  // ---------------------------------------------------------------- Berechnungen
  function calc(o) {
    const W = minOf(o.w), H = minOf(o.h);
    const dW = isNum(W) ? maxOf(o.w) - W : 0;
    const dH = isNum(H) ? maxOf(o.h) - H : 0;
    const dD = isNum(o.diag[0]) && isNum(o.diag[1]) ? Math.abs(o.diag[0] - o.diag[1]) : null;
    const r = { W, H, dW, dH, dD, checks: [] };
    if (dW > 5) r.checks.push({ lvl: 'warn', t: `Breite nicht parallel: ${mm(dW)} mm Unterschied – kleinstes Maß wird verwendet.` });
    if (dH > 5) r.checks.push({ lvl: 'warn', t: `Höhe ungleich: ${mm(dH)} mm Unterschied – kleinstes Maß wird verwendet.` });
    if (isNum(dD) && dD > 5) r.checks.push({ lvl: 'warn', t: `Öffnung nicht rechtwinklig: Diagonalen weichen ${mm(dD)} mm ab.` });
    if (isNum(dD) && dD <= 5) r.checks.push({ lvl: 'ok', t: `Diagonalen passen (${mm(dD)} mm Differenz).` });
    // Außenmaß (z. B. Außenlaibung) gegenüber dem Rohbaumaß innen
    if (isNum(o.outer.w) && isNum(W)) r.outerDW = o.outer.w - W;
    if (isNum(o.outer.h) && isNum(H)) r.outerDH = o.outer.h - H;
    if (isNum(r.outerDW) || isNum(r.outerDH)) {
      const parts = [];
      if (isNum(r.outerDW)) parts.push(`Breite ${r.outerDW >= 0 ? '+' : ''}${mm(r.outerDW)} mm${r.outerDW > 0 ? ` (je Seite ${mm(r.outerDW / 2)})` : ''}`);
      if (isNum(r.outerDH)) parts.push(`Höhe ${r.outerDH >= 0 ? '+' : ''}${mm(r.outerDH)} mm`);
      r.checks.push({ lvl: (r.outerDW > 0 || r.outerDH > 0) ? 'info' : 'ok', t: `Außenmaß gegenüber innen: ${parts.join(', ')}.${o.type === 'window' && (r.outerDW > 0 || r.outerDH > 0) ? ' Verbreiterungen prüfen.' : ''}` });
    }
    if (o.type === 'door') {
      let Hoff = H;
      if (isNum(H) && o.heightRef === 'RFB') Hoff = H - (o.floorBuild || 0);
      if (isNum(H) && o.heightRef === 'MR') Hoff = H + 1000;
      r.Hoff = Hoff;
      const nw = isNum(W) ? NORM_W.find(([n]) => W >= n && W <= n + NORM_TOL) : null;
      const nh = isNum(Hoff) ? NORM_H.find(([n]) => Hoff >= n && Hoff <= n + NORM_TOL) : null;
      r.norm = nw && nh ? { w: nw[0], h: nh[0], bw: nw[1], bh: nh[1] } : null;
      if (isNum(W) && isNum(Hoff)) {
        if (r.norm) r.checks.unshift({ lvl: 'ok', t: `Normmaß: Rohbaurichtmaß ${r.norm.w} × ${r.norm.h} mm${isPass(o) ? '' : `, Türblatt ${r.norm.bw} × ${r.norm.bh} mm`}.` });
        else {
          const cw = NORM_W.reduce((a, b) => (Math.abs(b[0] - W) < Math.abs(a[0] - W) ? b : a));
          const ch = NORM_H.reduce((a, b) => (Math.abs(b[0] - Hoff) < Math.abs(a[0] - Hoff) ? b : a));
          r.near = { w: cw[0], h: ch[0] };
          r.checks.unshift({ lvl: 'info', t: `Sondermaß. Nächstes Normmaß ${cw[0]} × ${ch[0]} mm (Abweichung ${W - cw[0] >= 0 ? '+' : ''}${mm(W - cw[0])} / ${Hoff - ch[0] >= 0 ? '+' : ''}${mm(Hoff - ch[0])} mm).` });
        }
      }
      const wl = o.wall.filter(isNum);
      r.wallMin = wl.length ? Math.min(...wl) : null;
      r.wallMax = wl.length ? Math.max(...wl) : null;
      if (wl.length === 2 && r.wallMax - r.wallMin > 5) r.checks.push({ lvl: 'warn', t: `Wandstärke ungleich (${mm(r.wallMin)}–${mm(r.wallMax)} mm) – Zarge mit Verstellbereich wählen.` });
    } else {
      r.orderW = isNum(W) ? W - 2 * (o.gapSide || 0) : null;
      r.orderH = isNum(H) ? H - (o.gapTop || 0) - (o.gapBottom || 0) : null;
      const e = o.ext;
      r.hasExt = !!(e.l || e.r || e.t || e.b);
      if (r.hasExt && isNum(r.orderW)) { r.totalW = r.orderW + (e.l || 0) + (e.r || 0); r.totalH = r.orderH + (e.t || 0) + (e.b || 0); }
      const si = o.sillIn, so = o.sillOut;
      if (si.on && isNum(W)) r.sillIn = { L: W + 2 * (si.side || 0), T: isNum(si.reveal) ? si.reveal + (si.front || 0) + (si.insert || 0) : null };
      if (so.on && isNum(W)) r.sillOut = { L: W + 2 * (so.side || 0), T: isNum(so.reveal) ? so.reveal + (so.front || 0) + (so.insert || 0) : null };
      if (isNum(W) && isNum(H) && isNum(si.reveal)) r.revealArea = ((2 * H + W) * si.reveal) / 1e6;
    }
    return r;
  }

  function nextPos(type) {
    const pre = type === 'door' ? 'T' : 'F';
    let n = 1;
    const used = new Set((RA.P.openings || []).map((o) => o.pos));
    while (used.has(pre + n)) n++;
    return pre + n;
  }
  const typeName = (o) => (o.type === 'door' ? 'Tür' : o.balcony ? 'Balkontür' : 'Fenster');
  const roomName = (o) => { const r = RA.P.rooms.find((x) => x.id === o.roomId); return r ? r.name : (o.location || ''); };
  function shortSpec(o) {
    if (isPass(o)) return ['Durchgangszarge', 'ohne Türblatt'].join(' · ');
    if (o.type === 'door') return [`DIN ${o.din === 'L' ? 'links' : 'rechts'}`, o.doorType, o.frame].filter(Boolean).join(' · ');
    const s = o.sashTypes.slice(0, o.sashes).join(' | ');
    return [`${o.sashes}-flg. ${s}`, o.transom ? 'Oberlicht' : '', o.shutter !== 'kein' ? o.shutter : ''].filter(Boolean).join(' · ');
  }

  // ---------------------------------------------------------------- Ansichtszeichnung (Grundformen in mm)
  function shapes(o, withDims = true) {
    const c = calc(o);
    const B = c.W || (o.type === 'door' ? 885 : 1000);
    const H = c.H || (o.type === 'door' ? 2005 : 1250);
    const it = [];
    const rect = (x, y, w, h, cls, fill) => it.push({ t: 'rect', x, y, w, h, cls, fill });
    const line = (x1, y1, x2, y2, cls, dash) => it.push({ t: 'line', x1, y1, x2, y2, cls, dash });
    const text = (x, y, s, size, opts = {}) => it.push(Object.assign({ t: 'text', x, y, s, size }, opts));
    // Öffnungssymbol: Das Dreieck öffnet sich zur Anschlag-/Bandseite, die Spitze zeigt zur Griffseite.
    const sym = (x, y, w, h, kind) => {
      const L = () => { line(x, y, x + w, y + h / 2, 'sym', true); line(x, y + h, x + w, y + h / 2, 'sym', true); }; // Bänder links
      const R = () => { line(x + w, y, x, y + h / 2, 'sym', true); line(x + w, y + h, x, y + h / 2, 'sym', true); }; // Bänder rechts
      const K = () => { line(x, y + h, x + w / 2, y, 'sym', true); line(x + w, y + h, x + w / 2, y, 'sym', true); }; // Kipp: Bänder unten
      if (kind === 'D-L') L();
      if (kind === 'D-R') R();
      if (kind === 'DK-L') { L(); K(); }
      if (kind === 'DK-R') { R(); K(); }
      if (kind === 'K') K();
      if (kind === 'F') text(x + w / 2, y + h / 2, 'FV', Math.min(w, h) * 0.16, { anchor: 'middle', cls: 'symt' });
      if (kind === 'S') { line(x + w * 0.2, y + h / 2, x + w * 0.8, y + h / 2, 'sym'); line(x + w * 0.8, y + h / 2, x + w * 0.7, y + h / 2 - w * 0.07, 'sym'); line(x + w * 0.8, y + h / 2, x + w * 0.7, y + h / 2 + w * 0.07, 'sym'); }
    };
    let minY = 0, maxY = H;
    if (o.type === 'door') {
      const f = Math.max(40, B * 0.06);
      rect(0, 0, B, H, 'frame', 'frame');
      if (isPass(o)) {
        rect(f, f, B - 2 * f, H - f, 'open', 'open');
        text(B / 2, H / 2, 'Durchgang', B * 0.1, { anchor: 'middle', cls: 'boxt' });
        line(-B * 0.15, H, B * 1.15, H, 'floor');
      }
      if (!isPass(o)) {
      rect(f, f, B - 2 * f, H - f, 'leaf', 'leaf');
      const hingeLeft = o.din === 'L';
      const hx = hingeLeft ? f - 6 : B - f - 6;
      [0.12, 0.5, 0.86].forEach((p) => rect(hx, f + (H - f) * p - 40, 12, 80, 'hinge', 'hinge'));
      const gx = hingeLeft ? B - f - 70 : f + 40;
      line(gx, H * 0.53, gx + 30, H * 0.53, 'handle');
      if (o.doorType === 'Schiebetür') sym(f, f, B - 2 * f, H - f, 'S');
      else sym(f, f, B - 2 * f, H - f, hingeLeft ? 'D-L' : 'D-R');
      line(-B * 0.15, H, B * 1.15, H, 'floor');
      }
    } else {
      let top = 0;
      if (o.shutter === 'Aufsatzkasten' || o.shutter === 'Vorbaukasten' || o.shutter === 'bestehender Kasten' || o.shutter === 'Raffstore') {
        const k = Math.min(250, H * 0.16);
        rect(0, -k, B, k, 'box', 'box');
        text(B / 2, -k / 2, o.shutter === 'Raffstore' ? 'Raffstore' : 'Rollladen', Math.min(k * 0.42, B * 0.08), { anchor: 'middle', cls: 'boxt' });
        minY = -k;
        top = 0;
      }
      const f = Math.max(40, Math.min(B, H) * 0.06);
      rect(0, top, B, H, 'frame', 'frame');
      let y0 = top + f;
      const innerH = H - 2 * f;
      let sashH = innerH;
      if (o.transom) {
        const tH = Math.min(isNum(o.transomH) ? o.transomH : innerH * 0.25, innerH * 0.6);
        rect(f, y0, B - 2 * f, tH, 'glass', 'glass');
        sym(f, y0, B - 2 * f, tH, 'K');
        y0 += tH + f / 2;
        sashH = innerH - tH - f / 2;
      }
      const n = Math.max(1, Math.min(3, o.sashes || 1));
      const sw = (B - 2 * f - (n - 1) * (f / 2)) / n;
      for (let i = 0; i < n; i++) {
        const x = f + i * (sw + f / 2);
        rect(x, y0, sw, sashH, 'glass', 'glass');
        sym(x + sw * 0.06, y0 + sashH * 0.04, sw * 0.88, sashH * 0.92, o.sashTypes[i]);
      }
      if (isNum(o.parapet) && o.parapet > 0) {
        const p = Math.min(o.parapet, H * 1.1);
        line(-B * 0.15, H + p, B * 1.15, H + p, 'floor');
        maxY = H + p;
        if (withDims) {
          line(B + B * 0.08, H, B + B * 0.08, H + p, 'dim');
          text(B + B * 0.12, H + p / 2, `Brüstung ${mm(o.parapet)}`, Math.max(B, H) * 0.035, { anchor: 'middle', rot: -90, cls: 'dimt' });
        }
      } else if (o.balcony) {
        line(-B * 0.15, H, B * 1.15, H, 'floor');
      }
    }
    const fs = Math.max(B, H) * 0.045;
    if (withDims) {
      const yb = maxY + fs * 1.6;
      line(0, yb, B, yb, 'dim');
      line(0, yb - fs * 0.4, 0, yb + fs * 0.4, 'dim');
      line(B, yb - fs * 0.4, B, yb + fs * 0.4, 'dim');
      text(B / 2, yb - fs * 0.35, isNum(c.W) ? mm(c.W) : 'Breite ?', fs, { anchor: 'middle', cls: 'dimt' });
      const xl = -fs * 1.6;
      line(xl, 0, xl, H, 'dim');
      line(xl - fs * 0.4, 0, xl + fs * 0.4, 0, 'dim');
      line(xl - fs * 0.4, H, xl + fs * 0.4, H, 'dim');
      text(xl - fs * 0.35, H / 2, isNum(c.H) ? mm(c.H) : 'Höhe ?', fs, { anchor: 'middle', rot: -90, cls: 'dimt' });
    }
    const pad = fs * 2.6;
    return { items: it, minX: -pad - (withDims ? fs : 0), maxX: B + pad + (o.type === 'window' && isNum(o.parapet) ? B * 0.12 : 0), minY: minY - fs, maxY: maxY + (withDims ? fs * 2.4 : fs) };
  }

  function toSvg(sh, cls = 'picto') {
    const w = sh.maxX - sh.minX, h = sh.maxY - sh.minY;
    const sw = Math.max(w, h) / 220; // Linienstärke relativ
    const parts = sh.items.map((e) => {
      if (e.t === 'rect') return `<rect class="p-${e.cls}" x="${e.x}" y="${e.y}" width="${e.w}" height="${e.h}" stroke-width="${sw * (e.cls === 'frame' ? 2.2 : 1.3)}"/>`;
      if (e.t === 'line') return `<line class="p-${e.cls}" x1="${e.x1}" y1="${e.y1}" x2="${e.x2}" y2="${e.y2}" stroke-width="${sw * (e.cls === 'floor' ? 2 : e.cls === 'handle' ? 4 : 1.2)}"${e.dash ? ` stroke-dasharray="${sw * 6} ${sw * 4}"` : ''}/>`;
      const tr = e.rot ? ` transform="rotate(${e.rot} ${e.x} ${e.y})"` : '';
      return `<text class="p-${e.cls || 'txt'}" x="${e.x}" y="${e.y}" font-size="${e.size}" text-anchor="${e.anchor || 'start'}" dominant-baseline="middle"${tr}>${esc(e.s)}</text>`;
    });
    return `<svg class="${cls}" viewBox="${sh.minX} ${sh.minY} ${w} ${h}" preserveAspectRatio="xMidYMid meet">${parts.join('')}</svg>`;
  }

  function toPdf(doc, sh, box) {
    const w = sh.maxX - sh.minX, h = sh.maxY - sh.minY;
    const s = Math.min(box.w / w, box.h / h);
    const ox = box.x + (box.w - w * s) / 2 - sh.minX * s, oy = box.y + (box.h - h * s) / 2 - sh.minY * s;
    const X = (x) => ox + x * s, Y = (y) => oy + y * s;
    const fills = { frame: [235, 238, 244], leaf: [248, 249, 252], glass: [226, 236, 252], box: [214, 218, 226], hinge: [60, 64, 72], open: [255, 255, 255] };
    sh.items.forEach((e) => {
      if (e.t === 'rect') {
        doc.setDrawColor(40, 44, 52); doc.setLineWidth(e.cls === 'frame' ? 0.5 : 0.3);
        const f = fills[e.fill];
        if (f) { doc.setFillColor(...f); doc.rect(X(e.x), Y(e.y), e.w * s, e.h * s, 'FD'); } else doc.rect(X(e.x), Y(e.y), e.w * s, e.h * s);
      } else if (e.t === 'line') {
        if (e.cls === 'dim') { doc.setDrawColor(110, 115, 125); doc.setLineWidth(0.2); }
        else if (e.cls === 'floor') { doc.setDrawColor(40, 44, 52); doc.setLineWidth(0.5); }
        else if (e.cls === 'handle') { doc.setDrawColor(40, 44, 52); doc.setLineWidth(0.9); }
        else { doc.setDrawColor(47, 91, 234); doc.setLineWidth(0.25); }
        if (e.dash && doc.setLineDashPattern) doc.setLineDashPattern([1.2, 0.9], 0);
        doc.line(X(e.x1), Y(e.y1), X(e.x2), Y(e.y2));
        if (e.dash && doc.setLineDashPattern) doc.setLineDashPattern([], 0);
      } else {
        const size = Math.max(6, Math.min(11, (e.size * s) / 0.3528));
        doc.setFont('helvetica', e.cls === 'dimt' ? 'bold' : 'normal');
        doc.setFontSize(size);
        doc.setTextColor(e.cls === 'symt' ? 47 : 30, e.cls === 'symt' ? 91 : 32, e.cls === 'symt' ? 234 : 38);
        const opts = { align: e.anchor === 'middle' ? 'center' : 'left', baseline: 'middle' };
        if (e.rot) {
          const tw = doc.getTextWidth(e.s);
          doc.text(e.s, X(e.x) + size * 0.3528 * 0.35, Y(e.y) + tw / 2, { angle: 90 });
        } else doc.text(e.s, X(e.x), Y(e.y), opts);
      }
    });
  }

  // ---------------------------------------------------------------- Fotos (IndexedDB)
  const Photos = {
    cache: new Map(),
    _db: null,
    open() {
      if (this._db) return this._db;
      this._db = new Promise((res, rej) => {
        if (!window.indexedDB) { rej(new Error('kein IndexedDB')); return; }
        const r = indexedDB.open('raumaufmass-photos', 1);
        r.onupgradeneeded = () => r.result.createObjectStore('photos');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      return this._db;
    },
    async tx(mode, fn) {
      const db = await this.open();
      return new Promise((res, rej) => {
        const t = db.transaction('photos', mode);
        const st = t.objectStore('photos');
        const out = fn(st);
        t.oncomplete = () => res(out && 'result' in out ? out.result : undefined);
        t.onerror = () => rej(t.error);
      });
    },
    async put(id, data) { this.cache.set(id, data); await this.tx('readwrite', (s) => s.put(data, id)); },
    async get(id) {
      if (this.cache.has(id)) return this.cache.get(id);
      const v = await this.tx('readonly', (s) => s.get(id));
      if (v) this.cache.set(id, v);
      return v;
    },
    async del(id) { this.cache.delete(id); await this.tx('readwrite', (s) => s.delete(id)); },
    async keys() { return (await this.tx('readonly', (s) => s.getAllKeys())) || []; },
  };
  async function preload(P) {
    const ids = (P.openings || []).flatMap((o) => o.photos || []);
    await Promise.all(ids.map((id) => Photos.get(id).catch(() => null)));
  }
  async function gc(db) {
    try {
      const used = new Set(Object.values(db.projects).flatMap((p) => (p.openings || []).flatMap((o) => o.photos || [])));
      const keys = await Photos.keys();
      await Promise.all(keys.filter((k) => !used.has(k)).map((k) => Photos.del(k)));
    } catch (e) { /* ohne IndexedDB: nichts zu tun */ }
  }
  function resizeImage(file, max = 1600) {
    return new Promise((res, rej) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.round(img.naturalWidth * k);
        c.height = Math.round(img.naturalHeight * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Bild konnte nicht gelesen werden')); };
      img.src = url;
    });
  }

  // ---------------------------------------------------------------- Liste in der Übersicht
  function renderList() {
    const items = list();
    if (!items.length) {
      return `<div class="empty-state"><div class="big-icon">🚪</div><h2>Noch keine Türen oder Fenster</h2><p>Lege Positionen an und miss die Rohbauöffnungen.</p></div>
        <div class="op-add"><button class="btn primary big" data-oact="add" data-type="door">＋ Tür</button><button class="btn primary big" data-oact="add" data-type="window">＋ Fenster</button></div>`;
    }
    const groups = new Map();
    items.slice().sort((a, b) => a.pos.localeCompare(b.pos, 'de', { numeric: true })).forEach((o) => {
      const k = roomName(o) || 'Ohne Raum';
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(o);
    });
    let html = '';
    groups.forEach((arr, k) => {
      html += `<h3 class="op-group">${esc(k)}</h3><div class="op-list">`;
      html += arr.map((o) => {
        const c = calc(o);
        const size = isNum(c.W) && isNum(c.H) ? `${mm(c.W)} × ${mm(c.H)}` : 'Maße fehlen';
        const warn = c.checks.some((x) => x.lvl === 'warn');
        const extra = o.type === 'window' && isNum(c.orderW) ? `Bestellmaß ${mm(c.orderW)} × ${mm(c.orderH)}` : o.type === 'door' && c.norm ? `Norm ${c.norm.w} × ${c.norm.h}` : '';
        return `<div class="op-card" role="button" tabindex="0" data-oact="open" data-id="${o.id}">
          <div class="op-pic">${toSvg(shapes(o, false), 'picto small')}</div>
          <div class="op-body">
            <div class="op-title"><span class="op-pos">${esc(o.pos)}</span> ${typeName(o)}${o.qty > 1 ? ` <span class="op-qty">× ${o.qty}</span>` : ''}</div>
            <div class="op-size">${size} <small>mm</small></div>
            <div class="op-spec">${esc(shortSpec(o))}</div>
            ${extra ? `<div class="op-spec">${extra}</div>` : ''}
            <div class="op-badges">${warn ? '<span class="badge warn">prüfen</span>' : isNum(c.W) && isNum(c.H) ? '<span class="badge ok">✓ gemessen</span>' : '<span class="badge">offen</span>'}${o.photos.length ? `<span class="badge">📷 ${o.photos.length}</span>` : ''}</div>
          </div>
          <button class="card-del" data-oact="del" data-id="${o.id}" aria-label="${esc(o.pos)} löschen" title="Löschen"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12M9 7V4h6v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
        </div>`;
      }).join('');
      html += '</div>';
    });
    return html + `<div class="op-add"><button class="btn big" data-oact="add" data-type="door">＋ Tür</button><button class="btn big" data-oact="add" data-type="window">＋ Fenster</button></div>`;
  }

  function totals() {
    const items = list();
    const doors = items.filter((o) => o.type === 'door').reduce((s, o) => s + (o.qty || 1), 0);
    const wins = items.filter((o) => o.type === 'window').reduce((s, o) => s + (o.qty || 1), 0);
    let sillIn = 0, sillOut = 0;
    items.forEach((o) => {
      if (o.type !== 'window') return;
      const c = calc(o);
      if (c.sillIn) sillIn += (c.sillIn.L / 1000) * (o.qty || 1);
      if (c.sillOut) sillOut += (c.sillOut.L / 1000) * (o.qty || 1);
    });
    return { doors, wins, sillIn, sillOut };
  }
  function totalsHtml() {
    const t = totals();
    return `<div class="tot-main compact"><span>Positionen</span><b>${t.doors} ${t.doors === 1 ? 'Tür' : 'Türen'} · ${t.wins} Fenster</b></div>
      <div class="tot-side"><div><b>${m2(t.sillIn)} m</b><span>FB innen</span></div><div><b>${m2(t.sillOut)} m</b><span>FB außen</span></div></div>`;
  }

  // ---------------------------------------------------------------- Editor
  const f = (k, v, attrs = '') => `data-of="${k}" ${attrs} value="${esc(v)}"`;
  const numIn = (k, v, ph = '', small = false, lbl = '') => `<label class="field"><span>${lbl}</span><input inputmode="decimal" autocomplete="off" class="m-in" data-of="${k}"${small ? ' data-small="1"' : ''} placeholder="${ph}" value="${mmIn(v)}"></label>`;
  const sel = (k, val, opts, lbl) => `<label class="field"><span>${lbl}</span><select data-of="${k}">${opts.map((x) => { const [v, t] = Array.isArray(x) ? x : [x, x]; return `<option value="${esc(v)}"${v === val ? ' selected' : ''}>${esc(t)}</option>`; }).join('')}</select></label>`;
  const txt = (k, val, lbl, ph = '') => `<label class="field"><span>${lbl}</span><input data-of="${k}" autocomplete="off" placeholder="${esc(ph)}" value="${esc(val || '')}"></label>`;
  const chk = (k, on, lbl) => `<label class="check"><input type="checkbox" data-of="${k}"${on ? ' checked' : ''}> ${lbl}</label>`;
  const seg = (k, val, opts) => `<div class="seg2" role="radiogroup">${opts.map(([v, t]) => `<button type="button" class="${String(v) === String(val) ? 'active' : ''}" data-oset="${k}" data-val="${v}">${t}</button>`).join('')}</div>`;

  function computedHtml(o) {
    const c = calc(o);
    const pills = c.checks.map((x) => `<div class="pill ${x.lvl === 'ok' ? 'okp' : x.lvl === 'warn' ? 'warnp' : ''}">${esc(x.t)}</div>`).join('');
    let main = '';
    if (isNum(c.W) && isNum(c.H)) {
      main = `<div class="op-main"><span>Rohbauöffnung (kleinstes Maß)</span><b>${mm(c.W)} × ${mm(c.H)} mm</b></div>`;
      if (o.type === 'door' && o.heightRef !== 'OFF') main += `<div class="op-main sub"><span>Höhe ab Fertigfußboden</span><b>${mm(c.Hoff)} mm</b></div>`;
      if (o.type === 'window' && isNum(c.orderW)) main += `<div class="op-main sub"><span>Bestellmaß Rahmen</span><b>${mm(c.orderW)} × ${mm(c.orderH)} mm</b></div>`;
      if (o.type === 'window' && isNum(c.totalW)) main += `<div class="op-main sub"><span>Gesamt inkl. Verbreiterungen</span><b>${mm(c.totalW)} × ${mm(c.totalH)} mm</b></div>`;
      if (isNum(o.outer.w) || isNum(o.outer.h)) main += `<div class="op-main sub"><span>Außenmaß</span><b>${mm(o.outer.w)} × ${mm(o.outer.h)} mm</b></div>`;
    } else main = `<div class="op-main"><span>Rohbauöffnung</span><b class="muted">Breite und Höhe messen</b></div>`;
    return main + pills;
  }

  function sillHtml(o) {
    const c = calc(o);
    const row = (lbl, r) => (r ? `<div class="sill-res"><span>${lbl}</span><b>${mm(r.L)} × ${isNum(r.T) ? mm(r.T) : '?'} mm</b></div>` : '');
    return row('Fensterbank innen (L × T)', c.sillIn) + row('Fensterbank außen (L × T)', c.sillOut) +
      (isNum(c.revealArea) ? `<div class="sill-res"><span>Laibungsfläche innen (Putz/Anstrich)</span><b>${m2(c.revealArea)} m²</b></div>` : '');
  }

  function renderEditor() {
    const o = cur();
    if (!o) { RA.go('overview'); return; }
    const isDoor = o.type === 'door';
    $('#openingTitle').textContent = `${o.pos} · ${typeName(o)}`;
    const rooms = [['', '– kein Raum –']].concat(RA.P.rooms.map((r) => [r.id, r.name]));
    const body = $('#openingBody');
    const scroll = body.scrollTop;
    const sashCards = isDoor ? '' : Array.from({ length: o.sashes }, (_, i) => sel(`sashTypes.${i}`, o.sashTypes[i], SASH_TYPES, o.sashes > 1 ? `Flügel ${i + 1}` : 'Öffnungsart')).join('');
    const photos = o.photos.map((id) => `<button class="ph" data-oact="photo" data-pid="${id}"><img data-pid="${id}" alt="Foto"></button>`).join('');
    body.innerHTML = `
      <div class="card op-preview">
        <div class="op-picture" data-oc="picto">${toSvg(shapes(o, true))}</div>
        <div class="op-hint">${isDoor ? 'Ansicht von der Öffnungsseite' : 'Ansicht von innen'}</div>
        <div data-oc="computed">${computedHtml(o)}</div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Allgemein</h3></div>
        <div class="grid2">
          <label class="field"><span>Position</span><input data-of="pos" autocomplete="off" value="${esc(o.pos)}"></label>
          <label class="field"><span>Anzahl gleiche</span><input data-of="qty" inputmode="numeric" value="${o.qty}"></label>
          ${sel('roomId', o.roomId, rooms, 'Raum')}
          ${txt('location', o.location, 'Ort / Bezeichnung', isDoor ? 'z. B. Flur → Bad' : 'z. B. Südseite links')}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Rohbauöffnung</h3><span class="hint" style="margin:0">mm · cm · m (Laser)</span></div>
        <p class="hint">An drei Stellen messen – das kleinste Maß zählt. Eingabe in mm (885), cm (88,5) oder m vom Laser (0,885). Mit Enter zum nächsten Feld.</p>
        <div class="m-grid">
          <span class="m-lbl">Breite</span>
          ${numIn('w.0', o.w[0], 'oben', false, 'oben')}${numIn('w.1', o.w[1], 'Mitte', false, 'Mitte')}${numIn('w.2', o.w[2], 'unten', false, 'unten')}
          <span class="m-lbl">Höhe</span>
          ${numIn('h.0', o.h[0], 'links', false, 'links')}${numIn('h.1', o.h[1], 'Mitte', false, 'Mitte')}${numIn('h.2', o.h[2], 'rechts', false, 'rechts')}
          <span class="m-lbl">Diag.</span>
          ${numIn('diag.0', o.diag[0], '↘', false, 'LO → RU')}${numIn('diag.1', o.diag[1], '↙', false, 'RO → LU')}<span></span>
          <span class="m-lbl">Außen</span>
          ${numIn('outer.w', o.outer.w, 'Breite', false, 'Breite')}${numIn('outer.h', o.outer.h, 'Höhe', false, 'Höhe')}<span></span>
        </div>
        <p class="hint" style="margin-top:8px">Diagonalen: LO → RU = links oben nach rechts unten. Außenmaß: Öffnung auf der Außen- bzw. Gegenseite, z. B. wegen Verbreiterungen oder Anschlag.</p>
        ${isDoor ? `
          <div class="grid2" style="margin-top:10px">
            ${sel('heightRef', o.heightRef, HREFS, 'Höhe gemessen')}
            ${o.heightRef === 'RFB' ? numIn('floorBuild', o.floorBuild, 'z. B. 80', true, 'Fußbodenaufbau (mm)') : '<span></span>'}
            ${numIn('wall.0', o.wall[0], 'z. B. 115', false, 'Wandstärke links')}
            ${numIn('wall.1', o.wall[1], 'z. B. 115', false, 'Wandstärke rechts')}
          </div>` : `
          <div class="grid2" style="margin-top:10px">
            ${numIn('parapet', o.parapet, 'z. B. 900', false, 'Brüstungshöhe ab OFF')}
            ${sel('mount', o.mount, MOUNTS, 'Einbausituation')}
          </div>`}
      </div>

      ${isDoor ? `
      <div class="card">
        <div class="card-head"><h3>Ausführung</h3></div>
        <div class="grid2">
          ${sel('frame', o.frame, FRAMES, 'Zarge')}
          ${isPass(o) ? '<span></span>' : sel('doorType', o.doorType, DOOR_TYPES, 'Türart')}
        </div>
        ${isPass(o) ? '<p class="hint" style="margin-top:8px">Durchgangszarge: Zarge ohne Türblatt – kein Anschlag und kein Schloss nötig.</p>' : `
        <div class="field" style="margin-top:10px"><span>Anschlag</span>${seg('din', o.din, [['L', 'DIN links'], ['R', 'DIN rechts']])}</div>
        <p class="hint">DIN links: Von der Seite gesehen, zu der die Tür aufgeht, sitzen die Bänder links.</p>
        <div class="field"><span>Aufschlag</span>${seg('openIn', o.openIn ? '1' : '0', [['1', 'in den Raum'], ['0', 'aus dem Raum']])}</div>`}
        <div class="grid2" style="margin-top:10px">
          ${isPass(o) ? '' : sel('lock', o.lock, LOCKS, 'Schloss')}
          ${txt('finish', o.finish, 'Oberfläche / Farbe', isPass(o) ? 'z. B. Weißlack' : 'z. B. Weißlack, Glasausschnitt')}
        </div>
      </div>` : `
      <div class="card">
        <div class="card-head"><h3>Ausführung</h3></div>
        <div class="field"><span>Flügel</span>${seg('sashes', o.sashes, [[1, '1-flügelig'], [2, '2-flügelig'], [3, '3-flügelig']])}</div>
        <div class="grid2" style="margin-top:10px">${sashCards}</div>
        <p class="hint">Anschlag links/rechts = Seite der Bänder, von innen gesehen.</p>
        ${chk('balcony', o.balcony, 'Balkon- bzw. Terrassentür (bodentief)')}
        ${chk('transom', o.transom, 'Oberlicht')}
        ${o.transom ? `<div class="grid2">${numIn('transomH', o.transomH, 'z. B. 400', false, 'Höhe Oberlicht')}</div>` : ''}
        <div class="grid2" style="margin-top:10px">
          ${sel('material', o.material, MATERIALS, 'Material')}
          ${sel('glazing', o.glazing, GLAZING, 'Verglasung')}
          ${txt('colorIn', o.colorIn, 'Farbe innen')}
          ${txt('colorOut', o.colorOut, 'Farbe außen')}
          ${sel('shutter', o.shutter, SHUTTERS, 'Rollladen / Sonnenschutz')}
          ${o.shutter !== 'kein' ? sel('shutterDrive', o.shutterDrive, DRIVES, 'Antrieb') : '<span></span>'}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Bestellmaß</h3></div>
        <p class="hint">Rahmenmaß = kleinstes Öffnungsmaß minus Fugen. Unten z. B. Fuge plus Fensterbank-Anschlussprofil.</p>
        <div class="grid3">
          ${numIn('gapSide', o.gapSide, '15', true, 'Fuge je Seite')}
          ${numIn('gapTop', o.gapTop, '15', true, 'Fuge oben')}
          ${numIn('gapBottom', o.gapBottom, '30', true, 'unten (inkl. Profil)')}
        </div>
        <div class="card-head" style="margin-top:14px"><h3>Verbreiterungen</h3>${isNum(o.outer.w) || isNum(o.outer.h) ? '<button class="btn small ghost" data-oact="extFromOuter">aus Außenmaß</button>' : ''}</div>
        <div class="grid4">
          ${numIn('ext.l', o.ext.l, '0', true, 'links')}
          ${numIn('ext.r', o.ext.r, '0', true, 'rechts')}
          ${numIn('ext.t', o.ext.t, '0', true, 'oben')}
          ${numIn('ext.b', o.ext.b, '0', true, 'unten')}
        </div>
        <p class="hint" style="margin-top:6px">Gesamtmaß = Rahmen + Verbreiterungen. „aus Außenmaß“ verteilt den Unterschied außen/innen auf links, rechts und oben.</p>
      </div>

      <div class="card">
        <div class="card-head"><h3>Fensterbänke &amp; Laibung</h3></div>
        ${chk('sillIn.on', o.sillIn.on, '<b>Fensterbank innen</b>')}
        ${o.sillIn.on ? `<div class="grid2">
          ${numIn('sillIn.reveal', o.sillIn.reveal, 'bis Rahmen', false, 'Laibungstiefe innen')}
          ${numIn('sillIn.front', o.sillIn.front, '20', true, 'Überstand vorne')}
          ${numIn('sillIn.side', o.sillIn.side, '20', true, 'seitlich je Seite (+)')}
          ${numIn('sillIn.insert', o.sillIn.insert, '0', true, 'Einschub unter Rahmen')}
          ${txt('sillIn.material', o.sillIn.material, 'Material innen', 'z. B. Naturstein, Werzalit')}
        </div>` : ''}
        ${chk('sillOut.on', o.sillOut.on, '<b>Fensterbank außen</b>')}
        ${o.sillOut.on ? `<div class="grid2">
          ${numIn('sillOut.reveal', o.sillOut.reveal, 'bis Rahmen', false, 'Laibungstiefe außen')}
          ${numIn('sillOut.front', o.sillOut.front, '40', true, 'Überstand vorne')}
          ${numIn('sillOut.side', o.sillOut.side, '15', true, 'Einputz je Seite')}
          ${numIn('sillOut.insert', o.sillOut.insert, '20', true, 'Einschub/Profil')}
          ${txt('sillOut.material', o.sillOut.material, 'Material außen', 'z. B. Alu, Granit')}
        </div>` : ''}
        <div data-oc="sill">${sillHtml(o)}</div>
      </div>`}

      <div class="card">
        <div class="card-head"><h3>Fotos</h3><span class="hint" style="margin:0">${o.photos.length} Foto${o.photos.length === 1 ? '' : 's'}</span></div>
        <div class="photo-grid">${photos}
          <label class="ph add"><input type="file" accept="image/*" capture="environment" data-ophoto="1" hidden><span>📷</span><small>Kamera</small></label>
          <label class="ph add"><input type="file" accept="image/*" multiple data-ophoto="1" hidden><span>🖼</span><small>Mediathek</small></label>
        </div>
      </div>

      <div class="card">
        <label class="field"><span>Bemerkung</span><textarea data-of="note" rows="3" placeholder="z. B. Sturz schief, alter Rahmen ausbauen, Putzschäden">${esc(o.note)}</textarea></label>
      </div>
      <div class="grid2">
        <button class="btn" data-oact="dup">Duplizieren</button>
        <button class="btn danger" data-oact="delCur">Löschen</button>
      </div>`;
    body.scrollTop = scroll;
    // Fotos nachladen
    body.querySelectorAll('img[data-pid]').forEach((img) => {
      Photos.get(img.dataset.pid).then((d) => { if (d) img.src = d; }).catch(() => {});
    });
  }

  function refreshComputed() {
    const o = cur();
    if (!o) return;
    const body = $('#openingBody');
    const pic = body.querySelector('[data-oc="picto"]');
    if (pic) pic.innerHTML = toSvg(shapes(o, true));
    const comp = body.querySelector('[data-oc="computed"]');
    if (comp) comp.innerHTML = computedHtml(o);
    const sill = body.querySelector('[data-oc="sill"]');
    if (sill) sill.innerHTML = sillHtml(o);
    $('#openingTitle').textContent = `${o.pos} · ${typeName(o)}`;
  }

  // Felder, die die Formularstruktur ändern → komplett neu zeichnen
  const STRUCT = new Set(['heightRef', 'transom', 'shutter', 'sillIn.on', 'sillOut.on', 'balcony', 'frame', 'outer.w', 'outer.h']);
  const SMALL_KEYS = new Set(['floorBuild', 'gapSide', 'gapTop', 'gapBottom', 'wall.0', 'wall.1', 'sillIn.reveal', 'sillOut.reveal', 'ext.l', 'ext.r', 'ext.t', 'ext.b',
    'sillIn.front', 'sillIn.side', 'sillIn.insert', 'sillOut.front', 'sillOut.side', 'sillOut.insert']);
  function setPath(o, path, v) {
    const ks = path.split('.');
    let t = o;
    for (let i = 0; i < ks.length - 1; i++) t = t[ks[i]];
    const last = ks[ks.length - 1];
    if (Array.isArray(t)) t[+last] = v; else t[last] = v;
  }

  function onChange(e) {
    const el = e.target;
    const o = cur();
    if (!o) return;
    if (el.dataset.ophoto) { addPhotos(o, el.files); el.value = ''; return; }
    const k = el.dataset.of;
    if (!k) return;
    let v;
    if (el.type === 'checkbox') v = el.checked;
    else if (el.classList.contains('m-in')) {
      v = parseMM(el.value, SMALL_KEYS.has(k) || el.dataset.small === '1');
      if (Number.isNaN(v) || (isNum(v) && (v < 0 || v > 20000))) { toast('Bitte eine gültige Länge eingeben (z. B. 885 oder 88,5 cm)'); el.value = ''; return; }
      el.value = mmIn(v);
    } else if (k === 'qty') v = Math.max(1, Math.round(Number(String(el.value).replace(',', '.')) || 1));
    else v = el.value;
    if (k === 'pos') v = String(v).trim() || o.pos;
    RA.snapshot();
    setPath(o, k, v);
    RA.persist();
    if (STRUCT.has(k)) renderEditor(); else refreshComputed();
  }

  async function addPhotos(o, files) {
    const arr = Array.from(files || []);
    if (!arr.length) return;
    toast(arr.length > 1 ? `${arr.length} Fotos werden gespeichert …` : 'Foto wird gespeichert …');
    for (const file of arr) {
      try {
        const data = await resizeImage(file);
        const id = 'ph_' + uid() + uid();
        await Photos.put(id, data);
        o.photos.push(id);
      } catch (err) {
        toast('Foto konnte nicht gespeichert werden');
      }
    }
    RA.persist();
    renderEditor();
  }

  function showPhoto(id) {
    const o = cur();
    const ov = document.createElement('div');
    ov.className = 'photo-viewer';
    ov.innerHTML = `<img alt="Foto"><div class="pv-bar"><button class="btn danger" data-pv="del">Foto löschen</button><button class="btn primary" data-pv="close">Schließen</button></div>`;
    document.body.appendChild(ov);
    Photos.get(id).then((d) => { if (d) ov.querySelector('img').src = d; });
    ov.addEventListener('click', (e) => {
      const a = e.target.dataset.pv;
      if (a === 'del' && o) {
        o.photos = o.photos.filter((x) => x !== id);
        RA.persist();
        Photos.del(id).catch(() => {});
        renderEditor();
      }
      if (a || e.target === ov) ov.remove();
    });
  }

  function add(type) {
    const P = RA.P;
    P.openings = P.openings || [];
    // Einstellungen der letzten Position gleicher Art übernehmen (Material, Fugen, Zarge …)
    const last = P.openings.filter((x) => x.type === type).slice(-1)[0];
    const o = defaults(type);
    if (last) {
      const keep = type === 'door'
        ? ['doorType', 'frame', 'lock', 'heightRef', 'floorBuild', 'finish', 'wall']
        : ['material', 'glazing', 'colorIn', 'colorOut', 'shutter', 'shutterDrive', 'mount', 'gapSide', 'gapTop', 'gapBottom', 'sillIn', 'sillOut'];
      keep.forEach((k) => { o[k] = JSON.parse(JSON.stringify(last[k])); });
      if (type === 'window') { o.sillIn.reveal = last.sillIn.reveal; o.sillOut.reveal = last.sillOut.reveal; }
    }
    o.pos = nextPos(type);
    ensure(o);
    const r = P.rooms.find((x) => x.id === P.activeRoom);
    if (r) o.roomId = r.id;
    RA.snapshot();
    P.openings.push(o);
    RA.persist();
    RA.ui.openingId = o.id;
    RA.go('opening');
    setTimeout(() => { const i = $('#openingBody [data-of="w.0"]'); if (i) i.focus(); }, 280);
  }

  function del(id, fromEditor) {
    const P = RA.P;
    const idx = (P.openings || []).findIndex((o) => o.id === id);
    if (idx < 0) return;
    const [removed] = P.openings.splice(idx, 1);
    RA.persist();
    if (fromEditor) RA.go('overview'); else RA.renderAll();
    toast(`${removed.pos} gelöscht`, 'Rückgängig', () => {
      P.openings.splice(Math.min(idx, P.openings.length), 0, removed);
      RA.persist();
      RA.renderAll();
    });
  }

  function dup() {
    const o = cur();
    if (!o) return;
    const c = ensure(JSON.parse(JSON.stringify(o)));
    c.id = uid();
    c.pos = nextPos(o.type);
    c.photos = [];
    RA.snapshot();
    RA.P.openings.push(c);
    RA.persist();
    RA.ui.openingId = c.id;
    renderEditor();
    toast(`Als ${c.pos} kopiert (ohne Fotos)`);
  }

  // ---------------------------------------------------------------- Ereignisse
  document.addEventListener('click', (e) => {
    const s = e.target.closest('[data-oset]');
    if (s) {
      const o = cur();
      if (!o) return;
      const k = s.dataset.oset;
      let v = s.dataset.val;
      if (k === 'sashes') v = +v;
      if (k === 'openIn') v = v === '1';
      RA.snapshot();
      o[k] = v;
      RA.persist();
      renderEditor();
      return;
    }
    const a = e.target.closest('[data-oact]');
    if (!a) return;
    const act = a.dataset.oact;
    if (act === 'add') add(a.dataset.type);
    if (act === 'open') { RA.ui.openingId = a.dataset.id; RA.go('opening'); }
    if (act === 'del') { e.stopPropagation(); del(a.dataset.id, false); }
    if (act === 'delCur') { const o = cur(); if (o) del(o.id, true); }
    if (act === 'dup') dup();
    if (act === 'extFromOuter') {
      const o = cur();
      if (!o) return;
      const c = calc(o);
      RA.snapshot();
      if (isNum(c.outerDW) && c.outerDW > 0) { o.ext.l = Math.round(c.outerDW / 2); o.ext.r = Math.round(c.outerDW - o.ext.l); }
      if (isNum(c.outerDH) && c.outerDH > 0) o.ext.t = Math.round(c.outerDH);
      RA.persist();
      renderEditor();
      toast('Verbreiterungen aus dem Außenmaß übernommen');
    }
    if (act === 'photo') showPhoto(a.dataset.pid);
  }, true);
  document.addEventListener('change', (e) => { if (e.target.closest('#openingBody')) onChange(e); });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.matches('#openingBody input.m-in')) {
      e.preventDefault();
      const ins = Array.from(document.querySelectorAll('#openingBody input.m-in'));
      const i = ins.indexOf(e.target);
      e.target.blur();
      const next = ins[i + 1];
      if (next) setTimeout(() => { next.focus(); next.select(); }, 30);
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.op-card[data-oact]')) { e.preventDefault(); e.target.click(); }
  });

  // ---------------------------------------------------------------- PDF
  function pdfPages(ctx) {
    const items = list().slice().sort((a, b) => a.pos.localeCompare(b.pos, 'de', { numeric: true }));
    if (!items.length) return;
    const { doc, M, PW } = ctx;
    doc.addPage();
    ctx.header('Türen & Fenster');
    const doors = items.filter((o) => o.type === 'door');
    const wins = items.filter((o) => o.type === 'window');
    if (doors.length) {
      ctx.heading('Türen');
      ctx.table([{ label: 'Pos', w: 14 }, { label: 'Raum / Ort', w: 38 }, { label: 'Stk', w: 10, align: 'right' }, { label: 'Rohbau B × H', w: 34, align: 'right' }, { label: 'Wand', w: 18, align: 'right' }, { label: 'DIN', w: 14 }, { label: 'Art / Zarge', w: 50 }],
        doors.map((o) => { const c = calc(o); return { cells: [o.pos, roomName(o) || '–', String(o.qty), isNum(c.W) ? `${mm(c.W)} × ${mm(c.Hoff ?? c.H)}` : '–', isNum(c.wallMin) ? (c.wallMax !== c.wallMin ? `${mm(c.wallMin)}–${mm(c.wallMax)}` : mm(c.wallMin)) : '–', isPass(o) ? '–' : o.din === 'L' ? 'links' : 'rechts', isPass(o) ? 'Durchgangszarge' : `${o.doorType}, ${o.frame}`] }; }), { rowH: 6 });
    }
    if (wins.length) {
      ctx.heading('Fenster');
      ctx.table([{ label: 'Pos', w: 14 }, { label: 'Raum / Ort', w: 34 }, { label: 'Stk', w: 10, align: 'right' }, { label: 'Rohbau B × H', w: 32, align: 'right' }, { label: 'Bestellmaß', w: 32, align: 'right' }, { label: 'Brüst.', w: 16, align: 'right' }, { label: 'Öffnung', w: 40 }],
        wins.map((o) => { const c = calc(o); return { cells: [o.pos, roomName(o) || '–', String(o.qty), isNum(c.W) ? `${mm(c.W)} × ${mm(c.H)}` : '–', isNum(c.orderW) ? `${mm(c.orderW)} × ${mm(c.orderH)}` : '–', isNum(o.parapet) ? mm(o.parapet) : '–', o.sashTypes.slice(0, o.sashes).join(' | ') + (o.transom ? ' + OL' : '')] }; }), { rowH: 6 });
      const sills = wins.filter((o) => o.sillIn.on || o.sillOut.on);
      if (sills.length) {
        ctx.heading('Fensterbänke (L × T in mm)');
        const t = totals();
        ctx.table([{ label: 'Pos', w: 18 }, { label: 'Stk', w: 10, align: 'right' }, { label: 'innen', w: 34, align: 'right' }, { label: 'Material innen', w: 34 }, { label: 'außen', w: 34, align: 'right' }, { label: 'Material außen', w: 48 }],
          sills.map((o) => { const c = calc(o); return { cells: [o.pos, String(o.qty), c.sillIn ? `${mm(c.sillIn.L)} × ${isNum(c.sillIn.T) ? mm(c.sillIn.T) : '?'}` : '–', o.sillIn.on ? o.sillIn.material : '', c.sillOut ? `${mm(c.sillOut.L)} × ${isNum(c.sillOut.T) ? mm(c.sillOut.T) : '?'}` : '–', o.sillOut.on ? o.sillOut.material : ''] }; })
            .concat([{ bold: true, cells: ['Summe', '', `${m2(t.sillIn)} m`, '', `${m2(t.sillOut)} m`, ''] }]), { rowH: 6 });
      }
    }
    // Detailblöcke
    items.forEach((o) => {
      const c = calc(o);
      const rows = [];
      const add = (k, v) => { if (v !== '' && v != null) rows.push([k, String(v)]); };
      add('Raum / Ort', [roomName(o), o.location && roomName(o) !== o.location ? o.location : ''].filter(Boolean).join(' – ') || '–');
      if (o.qty > 1) add('Anzahl', `${o.qty} Stück`);
      add('Breite o / m / u', o.w.map(mm).join(' / ') + ' mm');
      add('Höhe l / m / r', o.h.map(mm).join(' / ') + ' mm');
      if (isNum(o.diag[0]) || isNum(o.diag[1])) add('Diagonalen', `${mm(o.diag[0])} / ${mm(o.diag[1])} mm`);
      add('Maßgebend B × H', isNum(c.W) && isNum(c.H) ? `${mm(c.W)} × ${mm(c.H)} mm` : '–');
      if (isNum(o.outer.w) || isNum(o.outer.h)) add('Außenmaß B × H', `${mm(o.outer.w)} × ${mm(o.outer.h)} mm`);
      if (o.type === 'door') {
        add('Höhe gemessen', HREFS.find((x) => x[0] === o.heightRef)[1] + (o.heightRef === 'RFB' ? `, Aufbau ${mm(o.floorBuild)} mm` : ''));
        if (o.heightRef !== 'OFF') add('Höhe ab OFF', `${mm(c.Hoff)} mm`);
        add('Wandstärke', isNum(c.wallMin) ? `${mm(c.wallMin)}${c.wallMax !== c.wallMin ? ` – ${mm(c.wallMax)}` : ''} mm` : '–');
        add('Normmaß', c.norm ? `RRM ${c.norm.w} × ${c.norm.h}${isPass(o) ? '' : `, Türblatt ${c.norm.bw} × ${c.norm.bh}`}` : c.near ? `Sondermaß (nächste Norm ${c.near.w} × ${c.near.h})` : '–');
        if (isPass(o)) add('Zarge', 'Durchgangszarge, ohne Türblatt');
        else {
          add('Anschlag', `DIN ${o.din === 'L' ? 'links' : 'rechts'}, Aufschlag ${o.openIn ? 'in den Raum' : 'aus dem Raum'}`);
          add('Türart / Zarge', `${o.doorType} / ${o.frame}`);
          add('Schloss', o.lock);
        }
        add('Oberfläche', o.finish);
      } else {
        add('Bestellmaß Rahmen', isNum(c.orderW) ? `${mm(c.orderW)} × ${mm(c.orderH)} mm (Fugen ${mm(o.gapSide)}/${mm(o.gapTop)}/${mm(o.gapBottom)})` : '–');
        if (c.hasExt) add('Verbreiterungen', `links ${mm(o.ext.l)}, rechts ${mm(o.ext.r)}, oben ${mm(o.ext.t)}, unten ${mm(o.ext.b)} mm`);
        if (isNum(c.totalW)) add('Gesamtmaß inkl. Verbr.', `${mm(c.totalW)} × ${mm(c.totalH)} mm`);
        add('Brüstung ab OFF', isNum(o.parapet) ? `${mm(o.parapet)} mm` : '');
        add('Einbau', o.mount);
        add('Flügel / Öffnung', `${o.sashes}-flg.: ${o.sashTypes.slice(0, o.sashes).join(' | ')}${o.transom ? `, Oberlicht${isNum(o.transomH) ? ' ' + mm(o.transomH) + ' mm' : ''}` : ''}${o.balcony ? ', Balkontür' : ''}`);
        add('Material / Glas', `${o.material}, ${o.glazing}`);
        add('Farbe innen / außen', `${o.colorIn || '–'} / ${o.colorOut || '–'}`);
        add('Rollladen', o.shutter + (o.shutter !== 'kein' ? `, ${o.shutterDrive}` : ''));
        if (c.sillIn) add('Fensterbank innen', `${mm(c.sillIn.L)} × ${isNum(c.sillIn.T) ? mm(c.sillIn.T) : '?'} mm ${o.sillIn.material || ''}`);
        if (c.sillOut) add('Fensterbank außen', `${mm(c.sillOut.L)} × ${isNum(c.sillOut.T) ? mm(c.sillOut.T) : '?'} mm ${o.sillOut.material || ''}`);
        if (isNum(c.revealArea)) add('Laibung innen', `${m2(c.revealArea)} m²`);
      }
      add('Bemerkung', o.note);
      const photos = o.photos.map((id) => Photos.cache.get(id)).filter(Boolean);
      const rowH = 5.2;
      const tableH = rows.reduce((s, [, v]) => s + rowH * Math.max(1, doc.splitTextToSize(v, 92).length), 0);
      const blockH = 12 + Math.max(78, tableH) + (photos.length ? 52 : 0) + 6;
      ctx.ensure(blockH);
      let y = ctx.getY();
      doc.setDrawColor(215, 218, 224); doc.setLineWidth(0.2);
      doc.line(M, y, PW - M, y);
      y += 7;
      doc.setFont('helvetica', 'bold'); doc.setFontSize(13); doc.setTextColor(20, 22, 28);
      doc.text(`${o.pos}  ${typeName(o)}`, M, y);
      const warn = c.checks.filter((x) => x.lvl === 'warn').map((x) => x.t);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(180, 83, 9);
      if (warn.length) doc.text(doc.splitTextToSize(warn.join(' '), 110), PW - M, y - 2.5, { align: 'right' });
      y += 4;
      toPdf(doc, shapes(o, true), { x: M, y, w: 70, h: 78 });
      let ty = y + 2;
      rows.forEach(([k, v]) => {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(95, 100, 112);
        doc.text(k, M + 76, ty + 3.4);
        doc.setFont('helvetica', 'bold'); doc.setTextColor(20, 22, 28);
        const lines = doc.splitTextToSize(v, 92);
        doc.text(lines, M + 116, ty + 3.4);
        ty += rowH * Math.max(1, lines.length);
      });
      y = Math.max(y + 80, ty + 2);
      if (photos.length) {
        let x = M;
        photos.slice(0, 4).forEach((d) => {
          try {
            const p = doc.getImageProperties(d);
            const ratio = p.width / p.height;
            let h = 48, w = h * ratio;
            if (w > 60) { w = 60; h = w / ratio; }
            if (x + w > PW - M) return;
            doc.addImage(d, 'JPEG', x, y, w, h);
            x += w + 3;
          } catch (err) { /* Bild überspringen */ }
        });
        if (photos.length > 4) { doc.setFontSize(8); doc.setTextColor(95, 100, 112); doc.text(`+ ${photos.length - 4} weitere Fotos`, x, y + 4); }
        y += 52;
      }
      ctx.setY(y + 4);
    });
  }

  function pdfSummaryLine() {
    const t = totals();
    if (!t.doors && !t.wins) return '';
    return `Türen: ${t.doors}   ·   Fenster: ${t.wins}${t.sillIn ? `   ·   Fensterbank innen ${m2(t.sillIn)} m` : ''}${t.sillOut ? `   ·   außen ${m2(t.sillOut)} m` : ''}`;
  }

  // ---------------------------------------------------------------- Export / Import
  async function exportPhotos(P) {
    const out = {};
    for (const id of (P.openings || []).flatMap((o) => o.photos || [])) {
      const d = Photos.cache.get(id) || (await Photos.get(id).catch(() => null));
      if (d) out[id] = d;
    }
    return out;
  }
  async function importPhotos(map) {
    for (const [id, d] of Object.entries(map || {})) await Photos.put(id, d).catch(() => {});
  }

  return {
    normalize, renderList, totalsHtml, renderEditor, pdfPages, pdfSummaryLine,
    preload, gc, exportPhotos, importPhotos, photoCache: Photos.cache, calc, parseMM, shapes, toSvg,
  };
};
