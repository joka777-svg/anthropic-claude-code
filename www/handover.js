/* Raumaufmaß – Abnahmeprotokoll mit Unterschrift (Finger/Stift) und PDF.
 * Wird von app.js mit window.HandoverModule(RA) gestartet.
 */
'use strict';
window.HandoverModule = function (RA) {
  const { $, esc, uid, toast } = RA;

  const RESULTS = [
    ['ok', 'Abnahme ohne Mängel'],
    ['defects', 'Abnahme mit Mängeln (siehe Mängelliste)'],
    ['refused', 'Abnahme verweigert'],
  ];
  const DEFAULT_LEGAL = 'Der Auftraggeber hat die oben genannten Leistungen besichtigt. Mit seiner Unterschrift erklärt er die Abnahme im festgestellten Umfang. '
    + 'Aufgeführte Mängel werden vom Auftragnehmer innerhalb der genannten Fristen beseitigt. Mit der Abnahme beginnt die Gewährleistungsfrist.';

  const settings = () => { RA.db.settings = RA.db.settings || {}; return RA.db.settings; };
  const dateDE = (d) => (d ? new Date(d + 'T12:00:00').toLocaleDateString('de-DE') : '');
  const timeDE = (iso) => (iso ? new Date(iso).toLocaleString('de-DE', { dateStyle: 'medium', timeStyle: 'short' }) : '');

  function get() {
    const P = RA.P;
    if (!P.handover) {
      P.handover = {
        date: new Date().toISOString().slice(0, 10),
        place: P.address || '',
        client: P.client || '',
        contractor: settings().company || P.author || '',
        scope: '',
        result: 'ok',
        refuseReason: '',
        defects: [],
        remarks: '',
        legal: DEFAULT_LEGAL,
        sigClient: '', sigClientName: P.client || '', sigClientAt: '',
        sigContractor: '', sigContractorName: P.author || '', sigContractorAt: '',
        attachAufmass: true,
      };
    }
    const h = P.handover;
    if (!Array.isArray(h.defects)) h.defects = [];
    return h;
  }
  const locked = () => !!get().sigClient;

  /** Kurzfassung der Leistungen aus dem Aufmaß */
  function scopeFromAufmass() {
    const P = RA.P;
    const pc = RA.calcProject();
    const lines = [];
    const rooms = pc.rooms.filter((x) => x.r.points.length >= 3);
    if (rooms.length) {
      lines.push(`Bodenbelag: ${RA.fmt(pc.net)} m² in ${rooms.length} ${rooms.length === 1 ? 'Raum' : 'Räumen'} (${rooms.map((x) => x.r.name).join(', ')})`);
      lines.push(`Sockelleisten: ${RA.fmt(pc.skirting)} m`);
    }
    const ops = P.openings || [];
    const doors = ops.filter((o) => o.type === 'door').reduce((s, o) => s + (o.qty || 1), 0);
    const wins = ops.filter((o) => o.type === 'window').reduce((s, o) => s + (o.qty || 1), 0);
    if (doors) lines.push(`Türen: ${doors} Stück (${ops.filter((o) => o.type === 'door').map((o) => o.pos).join(', ')})`);
    if (RA.OP && RA.OP.workSummary) RA.OP.workSummary().forEach((w) => lines.push(`${w.label}: ${w.count} Stück (${w.pos.join(', ')})`));
    if (wins) lines.push(`Fenster: ${wins} Stück (${ops.filter((o) => o.type === 'window').map((o) => o.pos).join(', ')})`);
    return lines.join('\n') || 'Leistungen laut Auftrag';
  }

  function status() {
    const h = RA.P.handover;
    if (!h) return { text: 'noch nicht angelegt', cls: '' };
    if (h.sigClient && h.sigContractor) return { text: `unterschrieben am ${timeDE(h.sigClientAt)}`, cls: 'ok' };
    if (h.sigClient) return { text: 'Kunde hat unterschrieben – Unterschrift Auftragnehmer fehlt', cls: 'warn' };
    return { text: 'noch nicht unterschrieben', cls: 'warn' };
  }

  function cardHtml() {
    const s = status();
    return `<div class="card handover-card" role="button" tabindex="0" data-hact="open">
      <div class="hc-icon">✍️</div>
      <div class="hc-body"><b>Abnahmeprotokoll</b><span class="badge ${s.cls}">${esc(s.text)}</span></div>
      <span class="chev">›</span>
    </div>`;
  }

  // ---------------------------------------------------------------- Formular
  const dis = () => (locked() ? ' disabled' : '');
  function sigBlock(key, label, h) {
    const img = h[key];
    const nameKey = key + 'Name';
    const at = h[key + 'At'];
    const lockedName = key === 'sigClient' ? locked() : false;
    return `<div class="sig-block">
      <div class="sig-head"><b>${label}</b>${at ? `<small>${esc(timeDE(at))}</small>` : ''}</div>
      ${img
        ? `<div class="sig-pad signed"><img src="${img}" alt="Unterschrift ${label}"></div>`
        : `<canvas class="sig-pad" data-sig="${key}" aria-label="Hier unterschreiben"></canvas><div class="sig-hint">Hier mit dem Finger unterschreiben</div>`}
      <div class="sig-foot">
        <input data-hf="${nameKey}" autocomplete="off" placeholder="${esc((key === 'sigClient' ? h.client : h.contractor) || 'Name in Druckbuchstaben')}" value="${esc(h[nameKey] || '')}"${lockedName ? ' disabled' : ''}>
        <button class="btn small ghost danger" data-hact="clearSig" data-key="${key}">${img ? 'Unterschrift löschen' : 'Leeren'}</button>
      </div>
    </div>`;
  }

  function render() {
    const h = get();
    const body = $('#handoverBody');
    const scroll = body.scrollTop;
    const lock = locked();
    const defects = h.defects.map((d, i) => `<div class="defect" data-k="${d.id}">
        <div class="defect-nr">${i + 1}</div>
        <div class="defect-fields">
          <textarea data-hf="defect.${d.id}.text" rows="2" placeholder="Beschreibung des Mangels"${dis()}>${esc(d.text)}</textarea>
          <div class="grid2">
            <input data-hf="defect.${d.id}.where" autocomplete="off" placeholder="Raum / Ort" value="${esc(d.where)}"${dis()}>
            <input type="date" data-hf="defect.${d.id}.due" value="${esc(d.due)}"${dis()} aria-label="Frist">
          </div>
        </div>
        ${lock ? '' : `<button class="icon-btn" data-hact="delDefect" data-id="${d.id}" aria-label="Mangel löschen">✕</button>`}
      </div>`).join('');
    body.innerHTML = `
      ${lock ? `<div class="pill okp lock-pill">🔒 Vom Kunden unterschrieben – das Protokoll ist gesperrt.
        <button class="btn small" data-hact="unlock">Bearbeiten</button></div>` : ''}

      <div class="card">
        <div class="card-head"><h3>Allgemein</h3></div>
        <div class="grid2">
          <label class="field"><span>Abnahme am</span><input type="date" data-hf="date" value="${esc(h.date)}"${dis()}></label>
          <label class="field"><span>Ort / Baustelle</span><input data-hf="place" autocomplete="off" value="${esc(h.place)}"${dis()}></label>
          <label class="field"><span>Auftraggeber (Kunde)</span><input data-hf="client" autocomplete="off" value="${esc(h.client)}"${dis()}></label>
          <label class="field"><span>Auftragnehmer (Firma)</span><input data-hf="contractor" autocomplete="off" placeholder="deine Firma" value="${esc(h.contractor)}"${dis()}></label>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><h3>Abgenommene Leistungen</h3>${lock ? '' : '<button class="btn small ghost" data-hact="scope">aus Aufmaß</button>'}</div>
        <textarea data-hf="scope" rows="4" placeholder="z. B. Verlegung Vinylboden inkl. Sockelleisten im EG"${dis()}>${esc(h.scope)}</textarea>
      </div>

      <div class="card">
        <div class="card-head"><h3>Ergebnis</h3></div>
        ${RESULTS.map(([v, t]) => `<label class="check radio"><input type="radio" name="hresult" data-hf="result" value="${v}"${h.result === v ? ' checked' : ''}${dis()}> ${t}</label>`).join('')}
        ${h.result === 'refused' ? `<label class="field" style="margin-top:6px"><span>Grund der Verweigerung</span><textarea data-hf="refuseReason" rows="2"${dis()}>${esc(h.refuseReason)}</textarea></label>` : ''}
      </div>

      ${h.result !== 'ok' ? `<div class="card">
        <div class="card-head"><h3>Mängelliste</h3><span class="hint" style="margin:0">${h.defects.length} ${h.defects.length === 1 ? 'Mangel' : 'Mängel'}</span></div>
        ${defects || '<p class="hint">Noch keine Mängel eingetragen.</p>'}
        ${lock ? '' : '<button class="btn block" data-hact="addDefect">＋ Mangel hinzufügen</button>'}
      </div>` : ''}

      <div class="card">
        <label class="field"><span>Bemerkungen</span><textarea data-hf="remarks" rows="3" placeholder="z. B. Restarbeiten, Pflegehinweise übergeben"${dis()}>${esc(h.remarks)}</textarea></label>
        <label class="field" style="margin-top:10px"><span>Abnahmetext (steht über den Unterschriften)</span><textarea data-hf="legal" rows="4"${dis()}>${esc(h.legal)}</textarea></label>
      </div>

      <div class="card">
        <div class="card-head"><h3>Unterschriften</h3></div>
        ${sigBlock('sigClient', 'Auftraggeber / Kunde', h)}
        ${sigBlock('sigContractor', 'Auftragnehmer', h)}
      </div>

      <div class="card">
        <label class="check"><input type="checkbox" data-hf="attachAufmass"${h.attachAufmass ? ' checked' : ''}> Komplettes Aufmaß an das Protokoll anhängen</label>
        <button class="btn primary big block" data-hact="pdf" style="margin-top:8px">Protokoll als PDF</button>
      </div>`;
    body.scrollTop = scroll;
    body.querySelectorAll('canvas[data-sig]').forEach(setupPad);
  }

  // ---------------------------------------------------------------- Unterschriftsfeld
  function setupPad(canvas) {
    const key = canvas.dataset.sig;
    const ctx = canvas.getContext('2d');
    const dpr = Math.max(1, Math.min(3, window.devicePixelRatio || 1));
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr);
    canvas.height = Math.round(r.height * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, r.width, r.height);
    ctx.strokeStyle = '#111827';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    let drawing = false, last = null, mid = null, strokes = 0;
    const pos = (e) => { const b = canvas.getBoundingClientRect(); return { x: e.clientX - b.left, y: e.clientY - b.top }; };
    canvas.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      drawing = true;
      last = mid = pos(e);
      ctx.beginPath(); ctx.arc(last.x, last.y, 1.2, 0, Math.PI * 2); ctx.fillStyle = '#111827'; ctx.fill();
      const hint = canvas.nextElementSibling;
      if (hint && hint.classList.contains('sig-hint')) hint.style.visibility = 'hidden';
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!drawing) return;
      e.preventDefault();
      const p = pos(e);
      const m = { x: (last.x + p.x) / 2, y: (last.y + p.y) / 2 };
      ctx.beginPath();
      ctx.moveTo(mid.x, mid.y);
      ctx.quadraticCurveTo(last.x, last.y, m.x, m.y);
      ctx.stroke();
      last = p; mid = m;
    });
    const end = () => {
      if (!drawing) return;
      drawing = false;
      strokes++;
      const h = get();
      h[key] = canvas.toDataURL('image/jpeg', 0.9);
      if (!h[key + 'At'] || strokes === 1) h[key + 'At'] = new Date().toISOString();
      RA.persist();
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    canvas.addEventListener('pointerleave', end);
  }

  // ---------------------------------------------------------------- Eingaben
  const STRUCT = new Set(['result']);
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (!el.closest || !el.closest('#handoverBody')) return;
    const k = el.dataset.hf;
    if (!k) return;
    const h = get();
    const v = el.type === 'checkbox' ? el.checked : el.value;
    if (k.startsWith('defect.')) {
      const [, id, f] = k.split('.');
      const d = h.defects.find((x) => x.id === id);
      if (d) d[f] = v;
    } else {
      h[k] = v;
      if (k === 'contractor' && v.trim()) settings().company = v.trim();
    }
    RA.persist();
    if (STRUCT.has(k)) render();
  });

  document.addEventListener('click', (e) => {
    const a = e.target.closest('[data-hact]');
    if (!a) return;
    const act = a.dataset.hact;
    const h = get();
    if (act === 'open') { RA.go('handover'); return; }
    if (act === 'scope') {
      if (h.scope.trim() && !confirm('Den vorhandenen Text durch die Leistungen aus dem Aufmaß ersetzen?')) return;
      h.scope = scopeFromAufmass(); RA.persist(); render(); return;
    }
    if (act === 'addDefect') {
      h.defects.push({ id: uid(), text: '', where: '', due: '' });
      RA.persist(); render();
      setTimeout(() => { const t = document.querySelector(`#handoverBody [data-hf="defect.${h.defects[h.defects.length - 1].id}.text"]`); if (t) t.focus(); }, 50);
      return;
    }
    if (act === 'delDefect') { h.defects = h.defects.filter((d) => d.id !== a.dataset.id); RA.persist(); render(); return; }
    if (act === 'clearSig') {
      const key = a.dataset.key;
      if (h[key] && !confirm('Unterschrift wirklich löschen?')) return;
      h[key] = ''; h[key + 'At'] = '';
      RA.persist(); render(); return;
    }
    if (act === 'unlock') {
      if (!confirm('Zum Bearbeiten wird die Unterschrift des Kunden gelöscht. Der Kunde muss danach neu unterschreiben. Fortfahren?')) return;
      h.sigClient = ''; h.sigClientAt = '';
      RA.persist(); render(); return;
    }
    if (act === 'pdf') { exportPdf(); }
  });
  document.addEventListener('keydown', (e) => {
    if ((e.key === 'Enter' || e.key === ' ') && e.target.matches('.handover-card[data-hact]')) { e.preventDefault(); e.target.click(); }
  });

  // ---------------------------------------------------------------- PDF
  /** Zeichnet das Protokoll ab der aktuellen Seite (beginnt oben). */
  function drawProtocol(doc) {
    const h = get();
    const P = RA.P;
    const PW = 210, PH = 297, M = 16;
    const accent = [47, 91, 234], grey = [95, 100, 112], ink = [20, 22, 28];
    const font = (size, style = 'normal', color = ink) => { doc.setFont('helvetica', style); doc.setFontSize(size); doc.setTextColor(...color); };
    let y = 0;
    const newPage = () => { doc.addPage(); y = M; };
    const ensure = (need) => { if (y + need > PH - 18) newPage(); };
    const para = (text, size = 10, style = 'normal', color = ink, lh = 4.6) => {
      font(size, style, color);
      doc.splitTextToSize(String(text || ''), PW - 2 * M).forEach((ln) => { ensure(lh + 1); doc.text(ln, M, y); y += lh; });
    };
    const heading = (t) => { ensure(14); y += 3; font(12, 'bold'); doc.text(t, M, y); y += 6; };

    doc.setFillColor(...accent); doc.rect(0, 0, PW, 4, 'F');
    y = 20;
    font(22, 'bold'); doc.text('Abnahmeprotokoll', M, y);
    font(10, 'normal', grey); doc.text(dateDE(h.date), PW - M, y, { align: 'right' });
    y += 12;

    const info = [['Projekt', P.name], ['Auftraggeber', h.client], ['Ort / Baustelle', h.place], ['Auftragnehmer', h.contractor], ['Abnahme am', dateDE(h.date)]].filter((x) => x[1]);
    info.forEach(([k, v]) => {
      font(10, 'bold', grey); doc.text(k, M, y);
      font(11, 'normal');
      const ls = doc.splitTextToSize(String(v), PW - 2 * M - 42);
      doc.text(ls, M + 42, y);
      y += 6 * ls.length;
    });

    heading('Abgenommene Leistungen');
    para(h.scope || 'Leistungen laut Auftrag', 10.5);

    heading('Ergebnis der Abnahme');
    RESULTS.forEach(([v, t]) => {
      ensure(7);
      doc.setDrawColor(...ink); doc.setLineWidth(0.35);
      doc.rect(M, y - 3.6, 4.2, 4.2);
      if (h.result === v) {
        doc.setLineWidth(0.6);
        doc.line(M + 0.8, y - 1.6, M + 1.8, y - 0.3);
        doc.line(M + 1.8, y - 0.3, M + 3.6, y - 3.0);
      }
      font(10.5, h.result === v ? 'bold' : 'normal');
      doc.text(t, M + 7, y);
      y += 6.5;
    });
    if (h.result === 'refused' && h.refuseReason) { font(10, 'bold', grey); doc.text('Grund:', M, y); y += 5; para(h.refuseReason); }

    if (h.result !== 'ok') {
      heading('Mängelliste');
      const list = h.defects.filter((d) => (d.text || '').trim());
      if (!list.length) para('Keine Mängel eingetragen.', 10, 'normal', grey);
      else {
        const cols = [{ l: 'Nr.', w: 10 }, { l: 'Beschreibung', w: 102 }, { l: 'Raum / Ort', w: 38 }, { l: 'Frist', w: 28 }];
        ensure(12);
        doc.setFillColor(238, 240, 244); doc.rect(M, y - 4.5, PW - 2 * M, 6.5, 'F');
        font(9, 'bold', grey);
        let x = M + 2; cols.forEach((c) => { doc.text(c.l, x, y); x += c.w; });
        y += 6;
        list.forEach((d, i) => {
          font(10);
          const ls = doc.splitTextToSize(d.text, cols[1].w - 4);
          const rowH = Math.max(1, ls.length) * 4.6 + 2;
          ensure(rowH + 2);
          let xx = M + 2;
          doc.text(String(i + 1), xx, y); xx += cols[0].w;
          doc.text(ls, xx, y); xx += cols[1].w;
          doc.text(doc.splitTextToSize(d.where || '–', cols[2].w - 3), xx, y); xx += cols[2].w;
          doc.text(d.due ? dateDE(d.due) : '–', xx, y);
          y += rowH;
          doc.setDrawColor(215, 218, 224); doc.setLineWidth(0.2); doc.line(M, y - 3.5, PW - M, y - 3.5);
        });
      }
    }

    if ((h.remarks || '').trim()) { heading('Bemerkungen'); para(h.remarks); }

    // Abnahmetext + Unterschriften zusammenhalten
    const legalLines = doc.splitTextToSize(h.legal || '', PW - 2 * M).length;
    ensure(10 + legalLines * 4.4 + 62);
    y += 4;
    para(h.legal, 9.5, 'normal', grey, 4.4);
    y += 6;
    const boxW = (PW - 2 * M - 10) / 2, boxH = 30;
    [['sigClient', 'Auftraggeber / Kunde'], ['sigContractor', 'Auftragnehmer']].forEach(([key, label], i) => {
      const x = M + i * (boxW + 10);
      const img = h[key];
      if (img) {
        try {
          const p = doc.getImageProperties(img);
          const ratio = p.width / p.height;
          let w = boxW, hh = w / ratio;
          if (hh > boxH) { hh = boxH; w = hh * ratio; }
          doc.addImage(img, 'JPEG', x, y + (boxH - hh), w, hh);
        } catch (err) { /* Bild überspringen */ }
      }
      doc.setDrawColor(...ink); doc.setLineWidth(0.4);
      doc.line(x, y + boxH + 1, x + boxW, y + boxH + 1);
      font(9, 'normal', grey);
      doc.text(`${h.place ? h.place.split(',')[0] + ', ' : ''}${dateDE(h.date)}`, x, y + boxH + 5.5);
      font(10, 'bold');
      doc.text(h[key + 'Name'] || (key === 'sigClient' ? h.client : h.contractor) || label, x, y + boxH + 10.5);
      font(8.5, 'normal', grey);
      doc.text(label + (h[key + 'At'] ? ` · unterschrieben ${timeDE(h[key + 'At'])}` : ' · nicht unterschrieben'), x, y + boxH + 15);
    });
    y += boxH + 20;
    return doc;
  }

  function exportPdf() {
    const h = get();
    if (!window.jspdf) { toast('PDF-Modul nicht geladen – bitte die App mit Internet neu öffnen'); return; }
    if (!h.sigClient && !confirm('Der Kunde hat noch nicht unterschrieben. PDF trotzdem erstellen?')) return;
    try {
      let doc;
      if (h.attachAufmass) {
        doc = RA.buildPdf({ prefix: drawProtocol });
      } else {
        const { jsPDF } = window.jspdf;
        doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
        const clean = (t) => String(t).replace(/[−]/g, '-').replace(/[^\x00-\xFF–—‘-„•…€]/g, '?');
        const raw = doc.text.bind(doc);
        doc.text = (t, ...rest) => raw(Array.isArray(t) ? t.map(clean) : clean(t), ...rest);
        drawProtocol(doc);
        const n = doc.getNumberOfPages();
        for (let i = 1; i <= n; i++) {
          doc.setPage(i);
          doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor(95, 100, 112);
          doc.setDrawColor(215, 218, 224); doc.setLineWidth(0.2); doc.line(16, 285, 194, 285);
          doc.text(`Abnahmeprotokoll · ${RA.P.name}`, 16, 289.5);
          doc.text(`Seite ${i} von ${n}`, 194, 289.5, { align: 'right' });
        }
        doc.setProperties({ title: `Abnahmeprotokoll ${RA.P.name}`, creator: 'Raumaufmaß' });
      }
      const name = RA.fileBase().replace(/^Aufmass_/, 'Abnahme_') + '.pdf';
      RA.deliverFile(doc.output('blob'), name, 'application/pdf');
    } catch (err) {
      console.error(err);
      toast('PDF konnte nicht erstellt werden');
    }
  }

  return { render, cardHtml, drawProtocol, exportPdf, scopeFromAufmass };
};
