/* ComprePrep MIA — single-page study app (no build step, works from file://) */
(function () {
  'use strict';

  const QB = window.QB || { subjects: [], questions: [], concepts: {}, meta: {} };
  const GUIDES = window.QB_GUIDES || {};
  const Q = QB.questions;
  const byId = new Map(Q.map(q => [q.id, q]));
  const SUBJ = new Map(QB.subjects.map(s => [s.id, s]));
  const LET = 'ABCDEFGH';
  const main = document.getElementById('main');
  const modalRoot = document.getElementById('modal-root');
  const tooltip = document.getElementById('tooltip');

  // ---------------------------------------------------------------- utils
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);
  const sum = arr => arr.reduce((x, y) => x + y, 0);
  function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  function fmtClock(sec) { sec = Math.max(0, Math.round(sec)); const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60; return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0'); }
  function fmtDur(sec) { sec = Math.round(sec); const m = Math.floor(sec / 60), s = sec % 60; return m ? `${m}m ${s}s` : `${s}s`; }
  function fmtDate(ts) { const d = new Date(ts); return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) + ', ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }); }
  const qsOf = sid => Q.filter(q => q.s === sid);
  const subjName = sid => (SUBJ.get(sid) || { name: sid }).name;
  const subjShort = sid => (SUBJ.get(sid) || { short: sid }).short;
  const qLabel = q => `${subjShort(q.s)} Q${parseInt(q.id.split('-')[1], 10)}`;
  function conceptTitle(c) {
    if (QB.concepts[c] && QB.concepts[c].t) return QB.concepts[c].t;
    return String(c || '').replace(/^[a-z]+-/, '').replace(/-/g, ' ').replace(/\b\w/g, m => m.toUpperCase());
  }
  const conceptCount = {};
  Q.forEach(q => { conceptCount[q.c] = (conceptCount[q.c] || 0) + 1; });

  // ---------------------------------------------------------------- markdown-lite
  function inline(s) {
    const codes = [];
    s = String(s).replace(/`([^`\n]+)`/g, (_, c) => { codes.push(c); return '\u0000' + (codes.length - 1) + '\u0000'; });
    s = esc(s);
    s = s.replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/(^|[\s(\[])\*(?=\S)([^*\n]*?\S)\*(?=[\s).,;:!?\]]|$)/g, '$1<em>$2</em>');
    s = s.replace(/_\{([^{}\n]*)\}/g, '<sub>$1</sub>').replace(/\^\{([^{}\n]*)\}/g, '<sup>$1</sup>');
    s = s.replace(/\u0000(\d+)\u0000/g, (_, i) => '<code>' + esc(codes[+i]) + '</code>');
    return s;
  }
  function mdBlocks(t) {
    t = t.replace(/^\n+|\n+$/g, '');
    if (!t.trim()) return '';
    let html = '', para = [], list = null;
    const flushP = () => { if (para.length) { html += '<p>' + para.map(inline).join('<br>') + '</p>'; para = []; } };
    const flushL = () => {
      if (!list) return;
      const start = list.t === 'ol' && list.start !== 1 ? ` start="${list.start}"` : '';
      html += `<${list.t}${start}>` + list.items.map(x => '<li>' + inline(x) + '</li>').join('') + `</${list.t}>`;
      list = null;
    };
    for (const ln of t.split('\n')) {
      let m;
      if ((m = ln.match(/^\s*[-•]\s+(.*)$/))) { flushP(); if (!list || list.t !== 'ul') { flushL(); list = { t: 'ul', items: [] }; } list.items.push(m[1]); }
      else if ((m = ln.match(/^\s*(\d+)[.)]\s+(.*)$/))) { flushP(); if (!list || list.t !== 'ol') { flushL(); list = { t: 'ol', items: [], start: +m[1] }; } list.items.push(m[2]); }
      else if (!ln.trim()) { flushP(); flushL(); }
      else { flushL(); para.push(ln); }
    }
    flushP(); flushL();
    return html;
  }
  function md(src) {
    if (!src) return '';
    const parts = String(src).split(/```([a-zA-Z0-9+#-]*)[ \t]*\n?([\s\S]*?)```/g);
    let out = '';
    for (let i = 0; i < parts.length; i += 3) {
      out += mdBlocks(parts[i]);
      if (i + 2 < parts.length) out += '<pre><code>' + esc(parts[i + 2].replace(/\n$/, '')) + '</code></pre>';
    }
    return out;
  }
  function mdOpt(src) {
    src = String(src == null ? '' : src);
    if (src.includes('```')) return md(src);
    return src.split('\n').map(inline).join('<br>');
  }
  const plain = s => String(s || '').replace(/```[a-z]*\n?/g, ' ').replace(/[`*]|_\{|\^\{|\}/g, '').replace(/\s+/g, ' ').trim();

  // ---------------------------------------------------------------- storage
  const STORE_KEY = 'compreprep-mia-v1';
  let S = load();
  function load() {
    let d = {};
    try { d = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') || {}; } catch (e) { d = {}; }
    return normalize(d);
  }
  function normalize(d) {
    if (!d || typeof d !== 'object') d = {};
    d.att = d.att || {}; d.bm = d.bm || {}; d.read = d.read || {}; d.mocks = Array.isArray(d.mocks) ? d.mocks : [];
    d.settings = Object.assign({ theme: 'auto', scoring: 'either' }, d.settings || {});
    if (typeof d.att !== 'object' || Array.isArray(d.att)) d.att = {};
    d.mocks = d.mocks.filter(m => m && /^m[0-9a-z]+$/.test(m.id) && Array.isArray(m.qids) && m.ans && typeof m.ans === 'object' && typeof m.score === 'number' && typeof m.max === 'number');
    if (d.mock && !(Array.isArray(d.mock.qids) && d.mock.qids.length && d.mock.qids.every(id => byId.has(id)) && d.mock.ans && typeof d.mock.ans === 'object')) delete d.mock;
    if (d.practice && !(Array.isArray(d.practice.qids) && d.practice.qids.every(id => byId.has(id)) && d.practice.answers && typeof d.practice.answers === 'object')) delete d.practice;
    if (!['either', 'key', 'corrected'].includes(d.settings.scoring)) d.settings.scoring = 'either';
    if (!['auto', 'light', 'dark'].includes(d.settings.theme)) d.settings.theme = 'auto';
    return d;
  }
  function save() { try { localStorage.setItem(STORE_KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable: keep in memory */ } }

  // ---------------------------------------------------------------- scoring
  function acceptable(q) {
    if (q.k == null || q.k === q.a) return new Set([q.a]);
    const mode = S.settings.scoring;
    if (mode === 'key') return new Set([q.k]);
    if (mode === 'corrected') return new Set([q.a]);
    return new Set([q.a, q.k]);
  }
  const isCorrect = (q, i) => acceptable(q).has(i);
  const okOf = (q, c) => !!q && c != null && isCorrect(q, c);
  // re-score a stored mock result with the current scoring setting
  function rescore(m) {
    const res = {}; let correct = 0, wrong = 0;
    m.qids.forEach(i => { const q = byId.get(i), a = m.ans[i]; res[i] = (a == null || !q) ? null : isCorrect(q, a); if (res[i] === true) correct++; else if (res[i] === false) wrong++; });
    return Object.assign({}, m, { res, correct, wrong, unanswered: m.qids.length - correct - wrong, score: Math.max(0, correct - wrong * (m.neg || 0)) });
  }
  function record(q, choice, ok) {
    const r = S.att[q.id] || (S.att[q.id] = { n: 0, c: 0 });
    r.n++; if (ok) r.c++;
    r.last = choice; r.ok = ok; r.t = Date.now();
  }
  function statsFor(qs) {
    let att = 0, ok = 0;
    for (const q of qs) { const r = S.att[q.id]; if (r) { att++; if (okOf(q, r.last)) ok++; } }
    return { total: qs.length, att, ok, wrong: att - ok };
  }

  // ---------------------------------------------------------------- shared UI bits
  const ICON_BM = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-6-4.5L6 21z" fill="currentColor" fill-opacity=".15" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>';
  function bmButton(q) {
    const on = !!S.bm[q.id];
    return `<button class="bm ${on ? 'on' : ''}" data-act="bm" data-id="${q.id}" aria-pressed="${on}" title="Save for later (S)">${ICON_BM}<span>${on ? 'Saved' : 'Save'}</span></button>`;
  }
  function qBadges(q, noSubj) {
    let b = noSubj ? '' : `<span class="badge subj">${esc(subjShort(q.s))}</span>`;
    if (q.c) b += `<a class="badge" href="#/study/${q.s}/${encodeURIComponent(q.c)}" title="Open this topic in the study guide">${esc(conceptTitle(q.c))}</a>`;
    if (q.gen) b += '<span class="badge mark" title="Written for this site to cover a syllabus area with no bank questions">Extra practice</span>';
    else if (q.k == null) b += '<span class="badge warn" title="The bank gives no answer key for this section; the answer was worked out">No official key</span>';
    if (q.ka === false) b += '<span class="badge warn" title="The official key looks wrong — see the note">Key flagged</span>';
    if (q.var) b += '<span class="badge mark" title="The combined PDF words this question differently, see the explanation">Variant wording</span>';
    if (q.dup) b += `<span class="badge" title="This question appears more than once in the bank">Repeat of ${esc(qLabel(byId.get(q.dup) || { s: q.s, id: q.dup }))}</span>`;
    return b;
  }
  // source PDFs live in ../materials relative to this site
  const pdfHref = (file, page) => `../materials/${encodeURIComponent(file)}#page=${encodeURIComponent(page)}`;
  function srcLine(q) {
    const bits = [];
    if (q.gen) bits.push('Extra practice question (not from the bank)');
    else {
      bits.push(`Source: <a href="${pdfHref(q.src, q.pg)}" target="_blank" rel="noopener" title="Open the PDF at this page">${esc(q.src)} · Q${esc(q.sq)} · p.${esc(q.pg)} ↗</a>`);
      if (q.also) bits.push(`Also in <a href="${pdfHref(q.also.src, q.also.pg)}" target="_blank" rel="noopener" title="Open the PDF at this page">${esc(q.also.src)} (${esc(q.also.sec)} Q${esc(q.also.q)}, p.${esc(q.also.pg)}) ↗</a>`);
    }
    if (q.c) bits.push(`<a href="#/study/${q.s}/${encodeURIComponent(q.c)}">Study: ${esc(conceptTitle(q.c))} →</a>`);
    return `<div class="srcline">${bits.join('<span aria-hidden="true">·</span>')}</div>`;
  }
  function keyNote(q) {
    if (q.ka === false) {
      return `<div class="keynote"><b>Answer-key note.</b> ${md(q.kn || '')}<div class="small">Official key: <b>${LET[q.k]}</b> · Technically correct: <b>${LET[q.a]}</b> · Scoring: ${scoringLabel()}</div></div>`;
    }
    if (q.k == null && !q.gen) return '<div class="keynote"><b>No official key.</b> This section of the bank came without answers, so this answer was worked out from first principles.</div>';
    return '';
  }
  function variantBox(q) {
    const v = q.var; if (!v) return '';
    const sameQ = plain(v.q).toLowerCase() === plain(q.q).toLowerCase();
    return `<div class="variant"><div class="variant-h">Another version of this question: <a href="${pdfHref(v.src, v.pg)}" target="_blank" rel="noopener">${esc(v.src)} (${esc(v.sec)} Q${esc(v.n)}, p.${esc(v.pg)}) ↗</a></div>
      ${sameQ ? '' : `<div class="variant-q">${md(v.q)}</div>`}
      <ol class="variant-opts">${v.o.map((o, i) => `<li class="${i === v.a ? 'ok' : ''}"><b>${LET[i]}.</b> <span>${mdOpt(o)}</span>${i === v.a ? ' <span class="tag">✓ answer in this version</span>' : ''}</li>`).join('')}</ol>
      <div class="variant-note">${md(v.note)}</div></div>`;
  }
  function scoringLabel() {
    return { either: 'either answer accepted', key: 'official key only', corrected: 'corrected answer only' }[S.settings.scoring];
  }
  function optionTags(q, i, chosen, reveal) {
    if (!reveal) return '';
    const tags = [];
    const flagged = q.k != null && q.k !== q.a;
    if (i === q.a) tags.push(flagged ? '✓ Technically correct' : '✓ Correct');
    if (flagged && i === q.k) tags.push('Official key');
    if (chosen === i) tags.push(isCorrect(q, i) ? 'Your answer' : (i === q.a ? 'Your answer (not the official key)' : '✗ Your answer'));
    return tags.length ? `<span class="tag">${tags.join(' · ')}</span>` : '';
  }
  function optionClass(q, i, chosen, reveal) {
    if (!reveal) return chosen === i ? 'selected' : '';
    const c = [];
    if (i === q.a) c.push('correct');
    else if (q.k != null && q.k !== q.a && i === q.k) c.push('keyed');
    if (chosen === i && i !== q.a && !isCorrect(q, i)) c.push('wrong');
    return c.join(' ');
  }
  function verdictText(q, chosen, ok) {
    const flagged = q.k != null && q.k !== q.a;
    if (ok) {
      if (!flagged) return 'Correct';
      return chosen === q.k ? `Correct per the official key. The technically correct answer is ${LET[q.a]}` : `Correct. Note the official key says ${LET[q.k]}`;
    }
    if (!flagged) return `Not quite. The answer is ${LET[q.a]}`;
    if (S.settings.scoring === 'key') return `Not quite. The official key is ${LET[q.k]} (technically correct: ${LET[q.a]})`;
    return `Not quite. The answer is ${LET[q.a]} (official key: ${LET[q.k]})`;
  }

  // tooltip (charts)
  function showTip(el, x, y) {
    const t = el.getAttribute('data-tip'); if (!t) return;
    tooltip.innerHTML = t; tooltip.hidden = false;
    const r = tooltip.getBoundingClientRect();
    let left = x + 14, top = y + 14;
    if (left + r.width > window.innerWidth - 8) left = x - r.width - 14;
    if (top + r.height > window.innerHeight - 8) top = y - r.height - 14;
    tooltip.style.left = Math.max(8, left) + 'px'; tooltip.style.top = Math.max(8, top) + 'px';
  }
  const hideTip = () => { tooltip.hidden = true; };
  document.addEventListener('mousemove', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) showTip(el, e.clientX, e.clientY); else hideTip(); });
  document.addEventListener('focusin', e => { const el = e.target.closest && e.target.closest('[data-tip]'); if (el) { const r = el.getBoundingClientRect(); showTip(el, r.left + r.width / 2, r.top + r.height / 2); } });
  document.addEventListener('focusout', hideTip);
  window.addEventListener('scroll', hideTip, { passive: true });

  function barChart(rows) {
    // rows: [{label, value (0-100) | null, sub, tip}]
    const summary = rows.map(r => `${r.label} ${r.value == null ? 'not attempted' : r.value + '% ' + (r.sub || '')}`).join('; ');
    return `<div class="barchart" role="img" aria-label="${esc('Accuracy: ' + summary)}">${rows.map(r => `
      <div class="lbl">${esc(r.label)}</div>
      <div class="track" tabindex="0" data-tip="${esc(r.tip)}">${!r.value ? '' : `<div class="bar" style="width:${Math.max(0, Math.min(100, r.value))}%"></div>`}</div>
      <div class="val">${r.value == null ? '<span class="muted">—</span>' : `${r.value}% <span class="muted">${esc(r.sub || '')}</span>`}</div>`).join('')}
      <div aria-hidden="true"></div><div class="ticks" aria-hidden="true">${[0, 25, 50, 75, 100].map(v => `<span style="left:${v}%">${v}%</span>`).join('')}</div><div aria-hidden="true"></div>
    </div>`;
  }

  function lineChart(points) {
    // points: [{y: 0-100, tip, label}]
    const W = 640, H = 210, L = 36, R = 16, T = 14, B = 26;
    const n = points.length;
    const xs = i => (n === 1 ? L + (W - L - R) / 2 : L + (i * (W - L - R)) / (n - 1));
    const ys = v => T + (1 - v / 100) * (H - T - B);
    let g = '';
    [0, 25, 50, 75, 100].forEach(v => { g += `<line class="${v === 0 ? 'baseline' : 'gridline'}" x1="${L}" x2="${W - R}" y1="${ys(v)}" y2="${ys(v)}"/><text x="${L - 8}" y="${ys(v) + 4}" text-anchor="end">${v}</text>`; });
    const path = points.map((p, i) => `${i ? 'L' : 'M'}${xs(i).toFixed(1)},${ys(p.y).toFixed(1)}`).join(' ');
    let dots = '';
    points.forEach((p, i) => {
      dots += `<circle class="hit" cx="${xs(i)}" cy="${ys(p.y)}" r="14" data-tip="${esc(p.tip)}" tabindex="0"/><circle class="dot" cx="${xs(i)}" cy="${ys(p.y)}" r="4.5"/>`;
      if (n <= 12 || i === 0 || i === n - 1) dots += `<text x="${xs(i)}" y="${H - 8}" text-anchor="middle">${esc(p.label)}</text>`;
    });
    const last = points[n - 1];
    const lastLbl = `<text x="${xs(n - 1)}" y="${ys(last.y) - 12}" text-anchor="middle" style="fill:var(--text);font-weight:650">${last.y}%</text>`;
    return `<div class="linechart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Mock test score trend">${g}<path class="ln" d="${path}"/>${dots}${lastLbl}</svg></div>`;
  }

  // modal
  let lastFocus = null;
  function openModal(html, onMount) {
    if (modalRoot.hidden) lastFocus = document.activeElement;
    modalRoot.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-h">${html.replace('<h2>', '<h2 id="modal-h">')}</div>`;
    modalRoot.hidden = false;
    const first = $('button, input, select, a', modalRoot);
    if (first) first.focus();
    if (onMount) onMount($('.modal', modalRoot));
  }
  function closeModal() { modalRoot.hidden = true; modalRoot.innerHTML = ''; if (lastFocus && lastFocus.focus && document.contains(lastFocus)) lastFocus.focus(); lastFocus = null; }
  modalRoot.addEventListener('click', e => { if (e.target === modalRoot) closeModal(); });

  // ---------------------------------------------------------------- theme
  function applyTheme() {
    const t = S.settings.theme;
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  }
  function effectiveDark() {
    const t = S.settings.theme;
    if (t === 'dark') return true; if (t === 'light') return false;
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  // ---------------------------------------------------------------- router
  let timers = [];
  let observer = null;
  function stopTimers() { timers.forEach(clearInterval); timers = []; if (observer) { observer.disconnect(); observer = null; } }
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    const qi = h.indexOf('?');
    const path = qi >= 0 ? h.slice(0, qi) : h;
    const params = new URLSearchParams(qi >= 0 ? h.slice(qi + 1) : '');
    return { parts: path.split('/').filter(Boolean).map(decodeURIComponent), params };
  }
  const routes = { '': viewHome, study: viewStudy, practice: viewPractice, bank: viewBank, mock: viewMock, review: viewReview, search: viewSearch };
  function route() {
    const { parts, params } = parseHash();
    const key = parts[0] || '';
    const fn = routes[key] || viewHome;
    $$('.mainnav a').forEach(a => { const on = a.dataset.nav === (key || 'home'); a.classList.toggle('active', on); if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    hideTip();
    // study guide: in-page navigation without re-render
    if (key === 'study' && parts[1] && main.dataset.view === 'study:' + parts[1]) { scrollToConcept(parts[2]); return; }
    if (S.mock && S.mock.deadline && Date.now() >= S.mock.deadline && !(key === 'mock' && parts[1] === 'run')) { stopTimers(); finishMock(true); return; }
    stopTimers();
    fn(parts.slice(1), params);
    if (!(key === 'study' && parts[2])) window.scrollTo(0, 0);
  }
  function rerender() { const y = window.scrollY; main.dataset.view = ''; route(); window.scrollTo(0, y); }
  function go(hash) { if (location.hash === hash) route(); else location.hash = hash; }
  window.addEventListener('hashchange', route);

  // ---------------------------------------------------------------- HOME
  function viewHome() {
    main.dataset.view = 'home';
    const all = Q, bank = Q.filter(q => !q.gen);
    const st = statsFor(all);
    const mocks = S.mocks.map(rescore);
    const best = mocks.length ? Math.max(...mocks.map(m => pct(m.score, m.max))) : null;
    const conceptIds = Object.keys(QB.concepts);
    const readN = conceptIds.filter(c => S.read[c]).length;
    const P = S.practice && !S.practice.done ? S.practice : null;
    const flagged = Q.filter(q => q.ka === false).length;

    const cards = QB.subjects.map(s => {
      const qs = qsOf(s.id), t = statsFor(qs);
      const cs = conceptIds.filter(c => QB.concepts[c].s === s.id);
      const rd = cs.filter(c => S.read[c]).length;
      return `<article class="subj-card">
        <div class="top"><div class="mono-badge" aria-hidden="true">${esc(s.short)}</div>
          <div><h3>${esc(s.name)}</h3><div class="meta">${qs.length} questions${s.note ? ' · ' + esc(s.note) : ''}</div></div></div>
        <div>
          <div class="meter" title="${t.att} of ${t.total} attempted">${t.att ? `<span class="good" style="width:${pct(t.ok, t.total)}%"></span>` : ''}${t.wrong ? `<span class="bad" style="width:${pct(t.wrong, t.total)}%"></span>` : ''}</div>
          <div class="stats-row" style="margin-top:6px"><span>${t.att}/${t.total} tried</span><span>${t.att ? pct(t.ok, t.att) + '% right' : '—'}</span><span>${cs.length ? `${rd}/${cs.length} topics read` : ''}</span></div>
        </div>
        <div class="actions">
          <a class="btn sm" href="#/study/${s.id}">Study</a>
          <a class="btn sm" href="#/practice/start?s=${s.id}">Practice</a>
          <a class="btn sm" href="#/bank/${s.id}">Q&amp;A</a>
        </div>
      </article>`;
    }).join('');

    const rows = QB.subjects.map(s => {
      const t = statsFor(qsOf(s.id));
      return { label: s.short, value: t.att ? pct(t.ok, t.att) : null, sub: t.att ? `(${t.ok}/${t.att})` : '', tip: `<b>${esc(s.name)}</b><br>${t.att ? `${pct(t.ok, t.att)}% correct on latest attempts<br>${t.ok} right · ${t.wrong} wrong · ${t.total - t.att} not tried` : 'Not attempted yet'}` };
    });

    // weakest concepts
    const cstat = {};
    for (const q of Q) { const r = S.att[q.id]; if (!r) continue; const c = cstat[q.c] || (cstat[q.c] = { att: 0, ok: 0, s: q.s }); c.att++; if (okOf(q, r.last)) c.ok++; }
    const weak = Object.entries(cstat).filter(([, v]) => v.att >= 3 && v.ok < v.att).sort((a, b) => a[1].ok / a[1].att - b[1].ok / b[1].att || b[1].att - a[1].att).slice(0, 6);
    const weakHtml = weak.length ? `<div class="list">${weak.map(([c, v]) => `<div class="list-row"><div class="t"><div class="n">${esc(conceptTitle(c))}</div><div class="d">${esc(subjShort(v.s))} · ${pct(v.ok, v.att)}% right (${v.ok}/${v.att})</div></div>
        <div class="btn-row"><a class="btn sm ghost" href="#/study/${v.s}/${encodeURIComponent(c)}">Revise</a><a class="btn sm" href="#/practice/start?s=${v.s}&c=${encodeURIComponent(c)}">Practice</a></div></div>`).join('')}</div>`
      : `<div class="empty small" style="padding:18px 8px"><p>Answer a few questions and your weakest topics will show up here.</p><a class="btn sm primary" href="#/practice/start?all=1&o=shuffle&n=20">Try 20 random questions</a></div>`;

    const recent = mocks.slice(-3).reverse();
    main.innerHTML = `
      <div class="hero">
        <div class="hero-main">
          <div class="eyebrow">CSE1907 · Comprehensive Examination</div>
          <h1>Prepare for the comprehensive exam</h1>
          <p>${bank.length} bank questions from the 2022 &amp; 2023 batches, each with its answer and an explanation${all.length > bank.length ? `, plus ${all.length - bank.length} extra Data Science practice questions` : ''}. There's a study guide for every syllabus area, topic-wise practice and timed mock tests.${flagged ? ` <a href="#/review/flagged">${flagged} answer keys were flagged</a> as wrong in the PDFs.` : ''}</p>
          <div class="btn-row" style="margin-top:14px">
            ${P ? `<a class="btn primary" href="#/practice/run">Resume practice (${Object.keys(P.answers).length}/${P.qids.length})</a>` : '<a class="btn primary" href="#/practice">Start practising</a>'}
            ${S.mock ? '<a class="btn" href="#/mock/run">Resume mock test</a>' : '<a class="btn" href="#/mock">Take a mock test</a>'}
            <a class="btn ghost" href="#/study">Open study guide</a>
          </div>
        </div>
        <div class="hero-side">
          <div class="stat"><div class="k">Attempted</div><div class="v">${st.att}</div><div class="s">of ${all.length} questions</div></div>
          <div class="stat"><div class="k">Accuracy</div><div class="v">${st.att ? pct(st.ok, st.att) + '%' : '—'}</div><div class="s">${st.att ? `${st.ok} right · ${st.wrong} to fix` : 'latest attempt per question'}</div></div>
          <div class="stat"><div class="k">Mock tests</div><div class="v">${mocks.length}</div><div class="s">${best != null ? `best ${best}%` : 'none taken yet'}</div></div>
          <div class="stat"><div class="k">Guide topics read</div><div class="v">${readN}</div><div class="s">of ${conceptIds.length} topics</div></div>
        </div>
      </div>

      <div class="section-title"><h2>Subjects</h2><span class="muted small">Syllabus order</span></div>
      <div class="subj-grid">${cards}</div>

      <div class="grid cols-2" style="margin-top:22px">
        <section class="card"><div class="card-title"><h2>Accuracy by subject</h2><span class="muted small">latest attempt</span></div>${barChart(rows)}</section>
        <section class="card"><div class="card-title"><h2>Focus next</h2><span class="muted small">weakest topics</span></div>${weakHtml}</section>
      </div>
      ${recent.length ? `<section class="card" style="margin-top:16px"><div class="card-title"><h2>Recent mock tests</h2><a class="btn sm ghost" href="#/mock">All results</a></div>
        <div class="list">${recent.map(m => `<div class="list-row"><div class="t"><div class="n">${esc(m.title)} — ${pct(m.score, m.max)}%</div><div class="d">${fmtDate(m.date)} · ${m.correct} right, ${m.wrong} wrong, ${m.unanswered} skipped · ${fmtDur(m.dur)}</div></div><a class="btn sm" href="#/mock/result/${esc(m.id)}">Review</a></div>`).join('')}</div></section>` : ''}
    `;
  }

  // ---------------------------------------------------------------- STUDY
  function viewStudy(parts) {
    const sid = parts[0];
    if (!sid || !SUBJ.has(sid)) return studyIndex();
    main.dataset.view = 'study:' + sid;
    const html = GUIDES[sid];
    const opts = QB.subjects.map(s => `<option value="${s.id}" ${s.id === sid ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    main.innerHTML = `
      <div class="study-layout">
        <aside class="study-nav" id="study-nav" aria-label="Guide contents">
          <select class="subj-select" data-change="study-subject" aria-label="Choose subject">${opts}</select>
          <button class="btn sm toc-toggle" data-act="toc-toggle" aria-expanded="false">Contents</button>
          <p class="study-progress" id="study-progress"></p>
          <ol id="study-toc"></ol>
          <div class="btn-row" style="margin-top:14px">
            <a class="btn sm" href="#/practice/start?s=${sid}">Practise ${esc(subjShort(sid))}</a>
            <a class="btn sm ghost" href="#/bank/${sid}">Q&amp;A bank</a>
          </div>
        </aside>
        <article class="guide" id="guide">${html || `<div class="guide-missing"><h2>${esc(subjName(sid))}</h2><p class="muted">The study guide for this subject is not available.</p></div>`}</article>
      </div>`;
    const art = $('#guide');
    const toc = [];
    $$('section', art).forEach(sec => {
      let id = null, kind = null;
      if (sec.classList.contains('concept') && sec.dataset.concept) { id = sec.dataset.concept; kind = 'concept'; }
      else if (sec.classList.contains('overview')) { id = 'overview'; kind = 'overview'; }
      else if (sec.classList.contains('revision')) { id = 'revision'; kind = 'revision'; }
      if (!id) return;
      sec.id = 'g-' + id;
      const h2 = $('h2', sec);
      const title = h2 ? h2.textContent.trim() : conceptTitle(id);
      if (kind === 'concept' && h2) {
        const n = conceptCount[id] || 0;
        const tools = document.createElement('div');
        tools.className = 'concept-tools';
        tools.innerHTML = `${n ? `<a class="btn sm primary" href="#/practice/start?s=${sid}&c=${encodeURIComponent(id)}">Practise ${n} question${n > 1 ? 's' : ''}</a><a class="btn sm" href="#/bank/${sid}?c=${encodeURIComponent(id)}">See Q&amp;A</a>` : '<span class="muted small">No bank questions on this topic. It is still in the syllabus.</span>'}
          <button class="btn sm ghost" data-act="read" data-c="${esc(id)}" aria-pressed="${!!S.read[id]}">${S.read[id] ? '✓ Read' : 'Mark as read'}</button>`;
        h2.after(tools);
      }
      toc.push({ id, kind, title });
    });
    linkQuestionIds(art);
    $('#study-toc').innerHTML = toc.map(t => `<li><a href="#/study/${sid}/${encodeURIComponent(t.id)}" data-sec="${esc(t.id)}">${t.kind === 'concept' ? `<span class="tick ${S.read[t.id] ? 'on' : ''}" data-tick="${esc(t.id)}"></span>` : '<span class="tick" style="border-style:dotted"></span>'}<span>${esc(t.title)}</span>${t.kind === 'concept' && conceptCount[t.id] ? `<span class="qn">${conceptCount[t.id]}q</span>` : ''}</a></li>`).join('');
    updateStudyProgress(sid);
    // scroll-spy
    if ('IntersectionObserver' in window) {
      observer = new IntersectionObserver(entries => {
        entries.forEach(en => {
          if (en.isIntersecting) {
            const id = en.target.id.slice(2);
            $$('#study-toc a').forEach(a => a.classList.toggle('active', a.dataset.sec === id));
          }
        });
      }, { rootMargin: '-90px 0px -70% 0px' });
      $$('section[id^="g-"]', art).forEach(s => observer.observe(s));
    }
    if (parts[1]) setTimeout(() => scrollToConcept(parts[1], true), 30);
  }
  // turn question ids mentioned in guides (e.g. "os-022") into links to that question
  function linkQuestionIds(root) {
    const re = /\b(?:os|cn|dsa|dbms|dl|cao|ml|bigdata|toc|web|ds)-\d{3}\b/g;
    const has = /\b(?:os|cn|dsa|dbms|dl|cao|ml|bigdata|toc|web|ds)-\d{3}\b/;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: n => (has.test(n.nodeValue) && !n.parentElement.closest('a, pre, code, button')) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT,
    });
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(n => {
      const frag = document.createDocumentFragment(); const v = n.nodeValue; let last = 0;
      v.replace(re, (m, off) => {
        frag.appendChild(document.createTextNode(v.slice(last, off)));
        const q = byId.get(m);
        if (q) { const a = document.createElement('a'); a.href = `#/bank/${q.s}?q=${m}`; a.textContent = m; a.title = 'Open ' + qLabel(q); frag.appendChild(a); }
        else frag.appendChild(document.createTextNode(m));
        last = off + m.length; return m;
      });
      frag.appendChild(document.createTextNode(v.slice(last)));
      n.parentNode.replaceChild(frag, n);
    });
  }
  function scrollToConcept(id, instant) {
    const nav = $('#study-nav');
    if (nav) { nav.classList.remove('open'); const tg = $('.toc-toggle', nav); if (tg) tg.setAttribute('aria-expanded', 'false'); }
    if (!id) { window.scrollTo(0, 0); return; }
    const el = document.getElementById('g-' + id);
    if (el) {
      const off = (($('.topbar') || {}).offsetHeight || 64) + 12;
      const y = el.getBoundingClientRect().top + window.scrollY - off;
      const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      window.scrollTo({ top: y, behavior: instant || reduce ? 'auto' : 'smooth' });
    }
  }
  function updateStudyProgress(sid) {
    const cs = Object.keys(QB.concepts).filter(c => QB.concepts[c].s === sid);
    const rd = cs.filter(c => S.read[c]).length;
    const el = $('#study-progress'); if (el) el.textContent = cs.length ? `${rd} of ${cs.length} topics marked as read` : '';
  }
  function studyIndex() {
    main.dataset.view = 'study-index';
    main.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">Study guide</div><h1>Pick a subject</h1><p>Concise notes for every syllabus area, with formulas, worked examples, exam traps and a last-minute revision list. Every topic links to its practice questions.</p></div></div>
      <div class="subj-grid">${QB.subjects.map(s => {
        const cs = Object.keys(QB.concepts).filter(c => QB.concepts[c].s === s.id);
        const rd = cs.filter(c => S.read[c]).length;
        return `<a class="subj-card" href="#/study/${s.id}" style="color:inherit;text-decoration:none">
          <div class="top"><div class="mono-badge" aria-hidden="true">${esc(s.short)}</div><div><h3>${esc(s.name)}</h3><div class="meta">${cs.length} topics · ${qsOf(s.id).length} questions</div></div></div>
          <div class="meter"><span class="good" style="width:${pct(rd, cs.length)}%"></span></div>
          <div class="stats-row"><span>${rd}/${cs.length} topics read</span><span style="color:var(--accent-ink);font-weight:600">Open guide →</span></div>
        </a>`;
      }).join('')}</div>`;
  }

  // ---------------------------------------------------------------- PRACTICE
  const ps = { subjects: new Set(QB.subjects.filter(s => s.id !== 'ds').map(s => s.id)), concepts: new Set(), filter: 'all', order: 'seq', count: 'all' };
  function poolFor(cfg) {
    let qs = cfg.ids ? cfg.ids.map(id => byId.get(id)).filter(Boolean)
      : Q.filter(q => cfg.subjects.has(q.s) && (!cfg.concepts.size || cfg.concepts.has(q.c)));
    switch (cfg.filter) {
      case 'new': qs = qs.filter(q => !S.att[q.id]); break;
      case 'wrong': qs = qs.filter(q => S.att[q.id] && !okOf(q, S.att[q.id].last)); break;
      case 'bm': qs = qs.filter(q => S.bm[q.id]); break;
      case 'flagged': qs = qs.filter(q => q.ka === false || (q.k == null && !q.gen)); break;
    }
    return qs;
  }
  function startPractice(cfg, title) {
    let qs = poolFor(cfg);
    if (cfg.order === 'shuffle') qs = shuffle(qs);
    if (cfg.count !== 'all') qs = qs.slice(0, +cfg.count);
    if (!qs.length) { openModal(`<h2>No questions match</h2><p>No questions match those filters. Try widening them.</p><div class="btn-row"><button class="btn primary" data-act="modal-close">OK</button></div>`); return false; }
    S.practice = { qids: qs.map(q => q.id), i: 0, answers: {}, res: {}, title: title || 'Practice', started: Date.now() };
    save();
    location.replace('#/practice/run');
    return true;
  }
  function viewPractice(parts, params) {
    const sub = parts[0];
    if (sub === 'start') {
      const cfg = { subjects: new Set(), concepts: new Set(), filter: params.get('f') || 'all', order: params.get('o') || 'seq', count: params.get('n') || 'all' };
      if (params.get('ids')) cfg.ids = params.get('ids').split(',');
      if (params.get('all')) QB.subjects.forEach(s => cfg.subjects.add(s.id));
      (params.get('s') || '').split(',').filter(Boolean).forEach(s => cfg.subjects.add(s));
      (params.get('c') || '').split(',').filter(Boolean).forEach(c => cfg.concepts.add(c));
      let title = params.get('t');
      if (!title) {
        if (cfg.concepts.size === 1) title = conceptTitle([...cfg.concepts][0]);
        else if (cfg.subjects.size === 1) title = subjName([...cfg.subjects][0]);
        else title = 'Mixed practice';
      }
      if (!startPractice(cfg, title)) { location.replace('#/practice'); }
      return;
    }
    if (sub === 'run') return practiceRun();
    if (sub === 'done') return practiceDone();
    practiceSetup();
  }
  function practiceSetup() {
    main.dataset.view = 'practice-setup';
    const P = S.practice && !S.practice.done ? S.practice : null;
    const pool = poolFor(ps);
    const n = ps.count === 'all' ? pool.length : Math.min(pool.length, +ps.count);
    const single = ps.subjects.size === 1 ? [...ps.subjects][0] : null;
    const concepts = single ? [...new Set(qsOf(single).map(q => q.c))].filter(Boolean) : [];
    const seg = (name, val, items) => `<div class="seg" role="group">${items.map(([v, l]) => `<button data-act="ps" data-k="${name}" data-v="${v}" aria-pressed="${val === v}">${l}</button>`).join('')}</div>`;
    main.innerHTML = `
      <div class="setup">
        <div class="page-head"><div><div class="eyebrow">Practice</div><h1>Practise with instant feedback</h1><p>Answer one question at a time. You see the answer, an explanation and a link to the topic right away.</p></div></div>
        ${P ? `<div class="card" style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div><b>Unfinished session:</b> ${esc(P.title)} · ${Object.keys(P.answers).length}/${P.qids.length} answered</div><div class="btn-row"><button class="btn ghost sm" data-act="ps-discard">Discard</button><a class="btn primary sm" href="#/practice/run">Resume</a></div></div>` : ''}
        <div class="card">
          <div class="field"><div class="label">Subjects</div>
            <div class="chips">${QB.subjects.map(s => `<button class="chip" data-act="ps-subj" data-v="${s.id}" aria-pressed="${ps.subjects.has(s.id)}">${esc(s.short)} <span class="count">${qsOf(s.id).length}</span></button>`).join('')}</div>
            <div class="btn-row"><button class="btn sm ghost" data-act="ps-subj-all">Select all</button><button class="btn sm ghost" data-act="ps-subj-none">Clear</button></div>
          </div>
          ${single ? `<div class="field"><div class="label">Topics in ${esc(subjName(single))} <span class="hint">(none selected = all topics)</span></div>
            <div class="chips">${concepts.map(c => `<button class="chip" data-act="ps-concept" data-v="${esc(c)}" aria-pressed="${ps.concepts.has(c)}">${esc(conceptTitle(c))} <span class="count">${conceptCount[c] || 0}</span></button>`).join('')}</div></div>` : '<p class="hint muted small" style="margin-top:-6px">Select a single subject to filter by topic.</p>'}
          <div class="opt-row">
            <div class="field"><div class="label">Show</div>${seg('filter', ps.filter, [['all', 'All'], ['new', 'Not tried'], ['wrong', 'Got wrong'], ['bm', 'Saved'], ['flagged', 'Key issues']])}</div>
            <div class="field"><div class="label">Order</div>${seg('order', ps.order, [['seq', 'Bank order'], ['shuffle', 'Shuffled']])}</div>
            <div class="field"><div class="label">How many</div>${seg('count', ps.count, [['10', '10'], ['20', '20'], ['50', '50'], ['all', 'All']])}</div>
          </div>
          <div class="setup-actions"><span><span class="pool-count">${n}</span> question${n === 1 ? '' : 's'} <span class="muted">(${pool.length} match)</span></span>
            <button class="btn primary lg" data-act="ps-start" ${n ? '' : 'disabled'}>Start practice →</button></div>
        </div>
      </div>`;
  }
  function practiceRun() {
    const P = S.practice;
    if (!P || !P.qids.length) { location.replace('#/practice'); return; }
    if (P.done) { location.replace('#/practice/done'); return; }
    main.dataset.view = 'practice-run';
    P.i = Math.max(0, Math.min(P.i, P.qids.length - 1));
    const q = byId.get(P.qids[P.i]);
    if (!q) { P.qids.splice(P.i, 1); save(); return practiceRun(); }
    const chosen = P.answers[q.id];
    const reveal = chosen != null;
    const answered = Object.keys(P.answers).length;
    const right = Object.keys(P.answers).filter(id => okOf(byId.get(id), P.answers[id])).length;
    const ok = reveal && isCorrect(q, chosen);
    main.innerHTML = `
      <div class="practice-wrap">
        <div class="practice-top">
          <a class="btn sm ghost" href="#/practice">← Setup</a>
          <span class="pos">${P.i + 1} / ${P.qids.length}</span>
          <div class="meter" title="${answered} answered"><span style="width:${pct(answered, P.qids.length)}%"></span></div>
          <span class="small muted">${right}/${answered} right</span>
        </div>
        <article class="qcard">
          <div class="qhead">${qBadges(q)}<span class="spacer"></span><span class="small">${esc(qLabel(q))}</span>${bmButton(q)}</div>
          <div class="qtext">${md(q.q)}</div>
          <div class="opts" role="group" aria-label="Options">
            ${q.o.map((o, i) => `<button class="opt ${optionClass(q, i, chosen, reveal)}" data-act="choose" data-i="${i}" ${reveal ? 'disabled' : ''}><span class="L">${LET[i]}</span><span class="T">${mdOpt(o)}</span>${optionTags(q, i, chosen, reveal)}</button>`).join('')}
          </div>
          ${reveal ? `<div class="feedback ${ok ? 'ok' : 'no'}" aria-live="polite">
            <div class="verdict"><span class="ic">${ok ? '✓' : '✗'}</span>${verdictText(q, chosen, ok)}</div>
            <div class="explain">${md(q.e) || '<p class="muted">No explanation available.</p>'}</div>
            ${keyNote(q)}${variantBox(q)}${srcLine(q)}
          </div>` : ''}
        </article>
        <div class="practice-nav">
          <button class="btn" data-act="p-prev" ${P.i === 0 ? 'disabled' : ''}>← Previous</button>
          <div class="btn-row">
            <button class="btn ghost" data-act="p-finish">Finish</button>
            ${P.i < P.qids.length - 1 ? `<button class="btn ${reveal ? 'primary' : ''}" data-act="p-next" id="p-next">${reveal ? 'Next →' : 'Skip →'}</button>` : `<button class="btn primary" data-act="p-finish" id="p-next">See summary</button>`}
          </div>
        </div>
        <p class="kbd-hint">Keys: <kbd>A</kbd>–<kbd>D</kbd> or <kbd>1</kbd>–<kbd>4</kbd> answer · <kbd>→</kbd> next · <kbd>←</kbd> previous · <kbd>S</kbd> save</p>
      </div>`;
    if (!reveal && document.activeElement === document.body) { const c = $('.qcard', main); if (c) { c.setAttribute('tabindex', '-1'); c.focus({ preventScroll: true }); } }
  }
  function practiceChoose(i) {
    const P = S.practice; if (!P) return;
    const q = byId.get(P.qids[P.i]);
    if (!q || P.answers[q.id] != null || i >= q.o.length) return;
    const ok = isCorrect(q, i);
    P.answers[q.id] = i; P.res[q.id] = ok;
    record(q, i, ok); save();
    const st = $('#sr-status'); if (st) st.textContent = verdictText(q, i, ok);
    practiceRun();
    const nx = $('#p-next'); if (nx) nx.focus({ preventScroll: true });
  }
  function practiceDone() {
    const P = S.practice;
    if (!P) { location.replace('#/practice'); return; }
    main.dataset.view = 'practice-done';
    if (!P.done) { location.replace('#/practice/run'); return; }
    const answered = Object.keys(P.answers);
    const right = answered.filter(id => okOf(byId.get(id), P.answers[id])).length;
    const wrongIds = answered.filter(id => !okOf(byId.get(id), P.answers[id]));
    const skipped = P.qids.filter(id => P.answers[id] == null);
    main.innerHTML = `
      <div class="setup">
        <div class="page-head"><div><div class="eyebrow">Practice summary</div><h1>${esc(P.title)}</h1></div></div>
        <div class="grid cols-4" style="margin-bottom:16px">
          <div class="stat"><div class="k">Score</div><div class="v">${answered.length ? pct(right, answered.length) + '%' : '—'}</div><div class="s">${right}/${answered.length} answered right</div></div>
          <div class="stat"><div class="k">Correct</div><div class="v" style="color:var(--good-ink)">${right}</div></div>
          <div class="stat"><div class="k">Wrong</div><div class="v" style="color:var(--bad-ink)">${wrongIds.length}</div></div>
          <div class="stat"><div class="k">Skipped</div><div class="v">${skipped.length}</div></div>
        </div>
        <div class="btn-row" style="margin-bottom:18px">
          ${wrongIds.length ? `<a class="btn primary" href="#/practice/start?ids=${wrongIds.join(',')}&t=${encodeURIComponent('Retry: ' + P.title)}">Retry the ${wrongIds.length} I got wrong</a>` : ''}
          ${skipped.length ? `<a class="btn" href="#/practice/start?ids=${skipped.join(',')}&t=${encodeURIComponent('Skipped: ' + P.title)}">Do the ${skipped.length} skipped</a>` : ''}
          <a class="btn ghost" href="#/practice">New session</a>
        </div>
        ${wrongIds.length ? `<div class="section-title"><h2>Questions to review</h2></div><div class="bank-list">${wrongIds.map(id => bankItem(byId.get(id), { open: true, chosen: P.answers[id] })).join('')}</div>` : '<div class="card empty"><h3>Nothing to fix 🎉</h3><p>You got every answered question right.</p></div>'}
      </div>`;
  }

  // ---------------------------------------------------------------- Q&A BANK
  const bs = { hide: false, expand: true, filter: 'all', limit: 40 };
  function bankItem(q, opt) {
    opt = opt || {};
    const hide = opt.hide && !opt.revealed;
    const chosen = opt.chosen;
    return `<article class="qcard bank-item" id="q-${q.id}">
      <div class="qhead"><span class="qid">${esc(qLabel(q))}</span>${qBadges(q, true)}<span class="spacer"></span>${bmButton(q)}</div>
      <div class="qtext">${md(q.q)}</div>
      <div class="opts">${q.o.map((o, i) => `<div class="opt ${hide ? '' : optionClass(q, i, chosen, true)}"><span class="L">${LET[i]}</span><span class="T">${mdOpt(o)}</span>${hide ? '' : optionTags(q, i, chosen, true)}</div>`).join('')}</div>
      ${hide ? `<button class="btn sm reveal-btn" data-act="reveal" data-id="${q.id}">Show answer &amp; explanation</button>`
        : `<details class="exp" ${opt.open ? 'open' : ''}><summary>Explanation</summary><div class="explain">${md(q.e) || '<p class="muted">No explanation available.</p>'}</div>${keyNote(q)}${variantBox(q)}${srcLine(q)}</details>`}
    </article>`;
  }
  function bankList(sid, params) {
    const cParam = params.get('c') || '';
    const term = (params.get('q') || '').trim();
    let qs = sid === 'all' ? Q.slice() : qsOf(sid);
    if (cParam) qs = qs.filter(q => q.c === cParam);
    if (term && byId.has(term.toLowerCase())) qs = qs.filter(q => q.id === term.toLowerCase());
    else if (term) {
      const t = term.toLowerCase();
      qs = qs.filter(q => (q.q + '\n' + q.o.join('\n') + '\n' + (bs.hide ? '' : (q.e || '')) + '\n' + q.id + ' ' + qLabel(q)).toLowerCase().includes(t));
    }
    if (bs.filter === 'wrong') qs = qs.filter(q => S.att[q.id] && !okOf(q, S.att[q.id].last));
    if (bs.filter === 'bm') qs = qs.filter(q => S.bm[q.id]);
    if (bs.filter === 'flagged') qs = qs.filter(q => q.ka === false || (q.k == null && !q.gen));
    if (bs.filter === 'new') qs = qs.filter(q => !S.att[q.id]);
    return { qs, cParam, term };
  }
  function viewBank(parts, params) {
    const sid = parts[0] && (SUBJ.has(parts[0]) || parts[0] === 'all') ? parts[0] : 'all';
    main.dataset.view = 'bank:' + sid;
    bs.limit = 40;
    const { qs, cParam, term } = bankList(sid, params);
    const concepts = sid !== 'all' ? [...new Set(qsOf(sid).map(q => q.c))].filter(Boolean) : [];
    const segBtn = (k, v, l, cur) => `<button data-act="bs" data-k="${k}" data-v="${v}" aria-pressed="${String(cur) === String(v)}">${l}</button>`;
    main.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">Question &amp; answer bank</div><h1>${sid === 'all' ? 'All questions' : esc(subjName(sid))}</h1><p>Every question with its answer and explanation. Hide the answers to test yourself while browsing.</p></div>
        ${sid !== 'all' ? `<div class="btn-row"><a class="btn" href="#/study/${sid}">Study guide</a><a class="btn primary" href="#/practice/start?s=${sid}${cParam ? '&c=' + encodeURIComponent(cParam) : ''}">Practise these</a></div>` : ''}</div>
      <div class="subj-tabs">
        <a class="chip ${sid === 'all' ? 'on' : ''}" href="#/bank/all${term ? '?q=' + encodeURIComponent(term) : ''}">All <span class="count">${Q.length}</span></a>
        ${QB.subjects.map(s => `<a class="chip ${sid === s.id ? 'on' : ''}" href="#/bank/${s.id}${term ? '?q=' + encodeURIComponent(term) : ''}">${esc(s.short)} <span class="count">${qsOf(s.id).length}</span></a>`).join('')}
      </div>
      <div class="bank-tools">
        <div class="grow"><input class="input" type="search" placeholder="Search question text, options, explanations…" value="${esc(term)}" data-input="bank-search" aria-label="Search this list"></div>
        ${concepts.length ? `<select data-change="bank-concept" aria-label="Filter by topic"><option value="">All topics</option>${concepts.map(c => `<option value="${esc(c)}" ${c === cParam ? 'selected' : ''}>${esc(conceptTitle(c))} (${conceptCount[c] || 0})</option>`).join('')}</select>` : ''}
        <select data-change="bank-filter" aria-label="Filter">
          ${[['all', 'All questions'], ['new', 'Not tried yet'], ['wrong', 'I got wrong'], ['bm', 'Saved'], ['flagged', 'Key issues / no key']].map(([v, l]) => `<option value="${v}" ${bs.filter === v ? 'selected' : ''}>${l}</option>`).join('')}
        </select>
        <div class="seg">${segBtn('hide', false, 'Show answers', bs.hide)}${segBtn('hide', true, 'Hide answers', bs.hide)}</div>
        <div class="seg">${segBtn('expand', true, 'Expand all', bs.expand)}${segBtn('expand', false, 'Collapse', bs.expand)}</div>
      </div>
      <p class="muted small" id="bank-count">${qs.length} question${qs.length === 1 ? '' : 's'}${term ? ` matching “${esc(term)}”` : ''}</p>
      <div class="bank-list" id="bank-list"></div>
      <div class="load-more" id="bank-more"></div>`;
    renderBankItems(qs, term);
  }
  let bankCurrent = { qs: [], term: '' };
  function renderBankItems(qs, term) {
    bankCurrent = { qs, term };
    const list = $('#bank-list'); if (!list) return;
    const shown = qs.slice(0, bs.limit);
    list.innerHTML = shown.length ? shown.map(q => bankItem(q, { hide: bs.hide, open: bs.expand, revealed: revealed.has(q.id) })).join('')
      : '<div class="card empty"><h3>No questions found</h3><p>Try a different search or filter.</p></div>';
    if (term) highlight(list, term);
    const more = $('#bank-more');
    if (more) more.innerHTML = qs.length > bs.limit ? `<button class="btn" data-act="bank-more">Show more (${qs.length - bs.limit} left)</button>` : '';
  }
  const revealed = new Set();
  function highlight(root, term) {
    const t = term.toLowerCase(); if (!t) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, { acceptNode: n => (n.nodeValue.toLowerCase().includes(t) && !n.parentElement.closest('button, select, summary')) ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT });
    const nodes = []; while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach(n => {
      const frag = document.createDocumentFragment(); const v = n.nodeValue; let idx = 0, pos;
      const low = v.toLowerCase();
      while ((pos = low.indexOf(t, idx)) >= 0) {
        frag.appendChild(document.createTextNode(v.slice(idx, pos)));
        const m = document.createElement('mark'); m.className = 'hl'; m.textContent = v.slice(pos, pos + t.length); frag.appendChild(m);
        idx = pos + t.length;
      }
      frag.appendChild(document.createTextNode(v.slice(idx)));
      n.parentNode.replaceChild(frag, n);
    });
  }
  function viewSearch(parts, params) { location.replace('#/bank/all?q=' + encodeURIComponent(params.get('q') || '')); }

  // ---------------------------------------------------------------- MOCK TEST
  const PRESETS = [
    { id: 'full', t: 'Full mock', d: 'Questions from every subject, weighted by bank size', n: 100, m: 120 },
    { id: 'half', t: 'Half mock', d: 'A shorter mixed paper across all subjects', n: 50, m: 60 },
    { id: 'quick', t: 'Quick quiz', d: 'A 20-minute warm-up across subjects', n: 20, m: 20 },
    { id: 'subject', t: 'Subject test', d: 'One subject, timed', n: 25, m: 30 },
    { id: 'custom', t: 'Custom', d: 'Pick subjects, size, time and marking', n: 40, m: 45 },
  ];
  const ms = { preset: 'full', subjects: new Set(QB.subjects.map(s => s.id)), subject: 'os', n: 100, m: 120, dist: 'prop', prefer: 'any', neg: 0 };
  function viewMock(parts) {
    if (parts[0] === 'run') return mockRun();
    if (parts[0] === 'result' && parts[1]) return mockResult(parts[1]);
    mockSetup();
  }
  function mockSubjects() { return ms.preset === 'subject' ? [ms.subject] : [...ms.subjects]; }
  function mockSetup() {
    main.dataset.view = 'mock-setup';
    const subs = mockSubjects();
    const avail = sum(subs.map(s => qsOf(s).filter(q => !q.dup).length));
    const custom = ms.preset === 'custom';
    const scored = S.mocks.map(rescore);
    const hist = scored.slice().reverse();
    main.innerHTML = `
      <div class="setup" style="max-width:980px">
        <div class="page-head"><div><div class="eyebrow">Mock test</div><h1>Timed mock test</h1><p>Exam conditions: a question palette, mark-for-review, a countdown timer and no answers until you submit. You get a full review with explanations at the end.</p></div></div>
        ${S.mock ? `<div class="card" style="margin-bottom:16px;display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap"><div><b>Test in progress:</b> ${esc(S.mock.title)} · ${Object.keys(S.mock.ans).length}/${S.mock.qids.length} answered${S.mock.deadline ? ' · ' + fmtClock((S.mock.deadline - Date.now()) / 1000) + ' left' : ''}</div><div class="btn-row"><button class="btn ghost sm danger" data-act="mock-abandon">Abandon</button><a class="btn primary sm" href="#/mock/run">Resume</a></div></div>` : ''}
        <div class="card">
          <div class="field"><div class="label">Format</div>
            <div class="preset-grid">${PRESETS.map(p => `<button class="preset" data-act="mock-preset" data-v="${p.id}" aria-pressed="${ms.preset === p.id}"><span class="pt">${p.t}</span><span class="pd">${p.d}</span><span class="pm">${p.id === 'custom' ? 'You choose' : `${p.n} questions · ${p.m} min`}</span></button>`).join('')}</div>
          </div>
          ${ms.preset === 'subject' ? `<div class="field"><label for="ms-subject">Subject</label><select id="ms-subject" data-change="ms-subject">${QB.subjects.map(s => `<option value="${s.id}" ${ms.subject === s.id ? 'selected' : ''}>${esc(s.name)} (${qsOf(s.id).length})</option>`).join('')}</select></div>` : ''}
          ${custom ? `<div class="field"><div class="label">Subjects</div><div class="chips">${QB.subjects.map(s => `<button class="chip" data-act="ms-subj" data-v="${s.id}" aria-pressed="${ms.subjects.has(s.id)}">${esc(s.short)} <span class="count">${qsOf(s.id).length}</span></button>`).join('')}</div></div>` : ''}
          <div class="grid cols-3">
            <div class="field"><label for="ms-n">Questions</label><input id="ms-n" type="number" min="5" max="${avail}" value="${Math.min(ms.n, avail)}" data-change="ms-n" ${ms.preset === 'custom' || ms.preset === 'subject' ? '' : 'disabled'}><span class="hint">${avail} available</span></div>
            <div class="field"><label for="ms-m">Time limit (minutes)</label><input id="ms-m" type="number" min="0" max="600" value="${ms.m}" data-change="ms-m"><span class="hint">0 = untimed</span></div>
            <div class="field"><label for="ms-neg">Negative marking</label><select id="ms-neg" data-change="ms-neg">${[[0, 'None'], [0.25, '−0.25 per wrong'], [0.33, '−⅓ per wrong'], [0.5, '−0.5 per wrong']].map(([v, l]) => `<option value="${v}" ${+ms.neg === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
          </div>
          <div class="grid cols-2">
            ${ms.preset !== 'subject' ? `<div class="field"><div class="label">Spread across subjects</div><div class="seg"><button data-act="ms" data-k="dist" data-v="prop" aria-pressed="${ms.dist === 'prop'}">By bank size</button><button data-act="ms" data-k="dist" data-v="equal" aria-pressed="${ms.dist === 'equal'}">Equal</button></div></div>` : '<div></div>'}
            <div class="field"><div class="label">Question pool</div><div class="seg"><button data-act="ms" data-k="prefer" data-v="any" aria-pressed="${ms.prefer === 'any'}">Random</button><button data-act="ms" data-k="prefer" data-v="weak" aria-pressed="${ms.prefer === 'weak'}">Unseen &amp; weak first</button></div></div>
          </div>
          <div class="setup-actions"><span class="muted small">${ms.preset !== 'subject' && subs.includes('ds') ? 'Includes a few extra Data Science practice questions (not from the bank). ' : ''}Flagged answer keys: ${scoringLabel()} (change in Settings).</span>
            <button class="btn primary lg" data-act="mock-start" ${avail && !S.mock ? '' : 'disabled'}>${S.mock ? 'Finish the current test first' : 'Start test →'}</button></div>
        </div>
        <div class="section-title"><h2>Your results</h2>${hist.length ? `<span class="muted small">${hist.length} test${hist.length > 1 ? 's' : ''}</span>` : ''}</div>
        ${hist.length ? `
          ${hist.length >= 2 ? `<section class="card"><div class="card-title"><h3>Score trend (%)</h3><span class="muted small">oldest → newest</span></div>${lineChart(scored.slice(-20).map((m, i, arr) => ({ y: pct(m.score, m.max), label: '#' + (S.mocks.length - arr.length + i + 1), tip: `<b>${esc(m.title)}</b><br>${fmtDate(m.date)}<br>${pct(m.score, m.max)}% · ${m.correct}/${m.qids.length} right` })))}</section>` : ''}
          <section class="card"><div class="table-wrap"><table class="data"><thead><tr><th>Date</th><th>Test</th><th class="num">Qs</th><th class="num">Score</th><th class="num">%</th><th class="num">Time</th><th></th></tr></thead><tbody>
          ${hist.map(m => `<tr><td class="nowrap">${fmtDate(m.date)}</td><td>${esc(m.title)}</td><td class="num">${m.qids.length}</td><td class="num">${+m.score.toFixed(2)}/${esc(m.max)}</td><td class="num"><b>${pct(m.score, m.max)}%</b></td><td class="num">${fmtDur(m.dur)}</td><td><a class="btn sm" href="#/mock/result/${esc(m.id)}">Review</a></td></tr>`).join('')}
          </tbody></table></div></section>` : '<div class="card empty"><p>No mock tests yet. Your scores and a trend chart will show up here.</p></div>'}
      </div>`;
  }
  function allocate(subs, n, dist) {
    const pools = subs.map(s => qsOf(s).filter(q => !q.dup));
    const sizes = pools.map(p => p.length);
    n = Math.min(n, sum(sizes));
    const alloc = sizes.map(() => 0);
    let remaining = n;
    let active = subs.map((_, i) => i).filter(i => sizes[i] > 0);
    while (remaining > 0 && active.length) {
      const weights = active.map(i => (dist === 'equal' ? 1 : sizes[i] - alloc[i]));
      const W = sum(weights);
      const raw = active.map((i, k) => (remaining * weights[k]) / W);
      let given = 0;
      active.forEach((i, k) => { const add = Math.min(Math.floor(raw[k]), sizes[i] - alloc[i]); alloc[i] += add; given += add; });
      // largest remainders
      let left = remaining - given;
      const order = active.map((i, k) => [i, raw[k] - Math.floor(raw[k])]).sort((a, b) => b[1] - a[1]);
      for (const [i] of order) { if (left <= 0) break; if (alloc[i] < sizes[i]) { alloc[i]++; left--; } }
      remaining = n - sum(alloc);
      active = active.filter(i => alloc[i] < sizes[i]);
      if (given === 0 && left === remaining && remaining > 0 && !order.length) break;
    }
    return { pools, alloc };
  }
  function pickFrom(pool, k, prefer) {
    if (prefer !== 'weak') return shuffle(pool).slice(0, k);
    const rank = q => { const r = S.att[q.id]; if (!r) return 1; if (!okOf(q, r.last)) return 0; return 2; };
    return shuffle(pool).sort((a, b) => rank(a) - rank(b)).slice(0, k);
  }
  function startMock() {
    if (S.mock) return;
    const subs = mockSubjects();
    const preset = PRESETS.find(p => p.id === ms.preset);
    const { pools, alloc } = allocate(subs, +ms.n, ms.preset === 'subject' ? 'prop' : ms.dist);
    const qids = [];
    pools.forEach((p, i) => { pickFrom(p, alloc[i], ms.prefer).forEach(q => qids.push(q.id)); });
    if (!qids.length) return;
    const title = ms.preset === 'subject' ? `Subject test: ${subjShort(ms.subject)}` : preset.t;
    S.mock = { id: 'm' + Date.now().toString(36), title, qids, ans: {}, marked: {}, visited: {}, i: 0, start: Date.now(), deadline: +ms.m > 0 ? Date.now() + ms.m * 60000 : null, neg: +ms.neg, cfg: { preset: ms.preset, subjects: subs, n: qids.length, m: +ms.m } };
    S.mock.visited[qids[0]] = 1;
    save();
    go('#/mock/run');
  }
  function mockRun() {
    const M = S.mock;
    if (!M) { location.replace('#/mock'); return; }
    main.dataset.view = 'mock-run';
    if (M.deadline && Date.now() >= M.deadline) { finishMock(true); return; }
    const q = byId.get(M.qids[M.i]);
    M.visited[q.id] = 1;
    const chosen = M.ans[q.id];
    const nAns = Object.keys(M.ans).length, nMarked = Object.keys(M.marked).filter(k => M.marked[k]).length;
    const nVisitedNA = M.qids.filter(id => M.visited[id] && M.ans[id] == null).length;
    const sec = subjName(q.s);
    main.innerHTML = `
      <div class="exam-bar">
        <span class="title">${esc(M.title)}</span>
        <span class="muted small">Question ${M.i + 1} of ${M.qids.length}</span>
        <span class="spacer"></span>
        ${M.deadline ? `<span class="timer" id="timer" aria-live="off"><svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><circle cx="12" cy="13" r="8" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 9v4l2.5 2M9 2h6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg><span id="timer-t">${fmtClock((M.deadline - Date.now()) / 1000)}</span></span>` : `<span class="timer" title="Elapsed (untimed)"><span id="timer-t">${fmtClock((Date.now() - M.start) / 1000)}</span></span>`}
        <button class="btn primary sm" data-act="mock-submit">Submit test</button>
      </div>
      <div class="exam">
        <div>
          <article class="qcard">
            <div class="qhead"><b style="color:var(--text)">Question ${M.i + 1}</b><span class="badge subj">${esc(subjShort(q.s))}</span><span>${esc(sec)}</span><span class="spacer"></span>${M.marked[q.id] ? '<span class="badge mark">Marked for review</span>' : ''}</div>
            <div class="qtext">${md(q.q)}</div>
            <div class="opts" role="group" aria-label="Options">
              ${q.o.map((o, i) => `<button class="opt ${chosen === i ? 'selected' : ''}" aria-pressed="${chosen === i}" data-act="m-choose" data-i="${i}"><span class="L">${LET[i]}</span><span class="T">${mdOpt(o)}</span></button>`).join('')}
            </div>
          </article>
          <div class="exam-actions">
            <div class="grp"><button class="btn" data-act="m-prev" ${M.i === 0 ? 'disabled' : ''}>← Previous</button><button class="btn ghost" data-act="m-clear" ${chosen == null ? 'disabled' : ''}>Clear response</button></div>
            <div class="grp"><button class="btn" data-act="m-mark">${M.marked[q.id] ? 'Unmark' : 'Mark for review'} &amp; next</button><button class="btn primary" data-act="m-next">${M.i < M.qids.length - 1 ? 'Save &amp; next →' : 'Save'}</button></div>
          </div>
          <p class="kbd-hint">Keys: <kbd>A</kbd>–<kbd>D</kbd> select · <kbd>→</kbd> next · <kbd>←</kbd> previous · <kbd>M</kbd> mark for review</p>
        </div>
        <aside class="card palette" aria-label="Question palette">
          <div class="card-title"><h3>Question palette</h3></div>
          <div class="palette-sum"><span><b>${nAns}</b> answered · <b>${M.qids.length - nAns}</b> left</span><span><b>${nMarked}</b> marked for review · <b>${nVisitedNA}</b> seen, not answered</span></div>
          <div class="palette-grid">${M.qids.map((id, i) => {
            const cls = [M.ans[id] != null ? 'answered' : (M.visited[id] ? 'visited' : ''), M.marked[id] ? 'marked' : '', i === M.i ? 'current' : ''].join(' ');
            return `<button class="pq ${cls}" data-act="m-goto" data-i="${i}" aria-label="Question ${i + 1}${M.ans[id] != null ? ', answered' : ''}${M.marked[id] ? ', marked' : ''}">${i + 1}</button>`;
          }).join('')}</div>
          <div class="legend"><span><i class="answered"></i>Answered</span><span><i class="visited"></i>Not answered</span><span><i></i>Not visited</span><span><i class="marked"></i>Marked</span></div>
          <button class="btn primary" style="width:100%" data-act="mock-submit">Submit test</button>
        </aside>
      </div>`;
    save();
    const tick = () => {
      const el = $('#timer-t'); if (!el || !S.mock) return;
      if (S.mock.deadline) {
        const left = (S.mock.deadline - Date.now()) / 1000;
        el.textContent = fmtClock(left);
        const t = $('#timer'); if (t) t.classList.toggle('low', left <= 300);
        if (left <= 0) finishMock(true);
      } else el.textContent = fmtClock((Date.now() - S.mock.start) / 1000);
    };
    tick();
    if (!S.mock) return;
    timers.forEach(clearInterval);
    timers = [setInterval(tick, 1000)];
  }
  function mockGo(i) { const M = S.mock; if (!M) return; M.i = Math.max(0, Math.min(M.qids.length - 1, i)); M.visited[M.qids[M.i]] = 1; mockRun(); }
  function confirmSubmit() {
    const M = S.mock; if (!M) return;
    const nAns = Object.keys(M.ans).length, nMarked = Object.keys(M.marked).filter(k => M.marked[k]).length;
    openModal(`<h2>Submit the test?</h2>
      <p>You have answered <b>${nAns}</b> of ${M.qids.length} questions.${M.qids.length - nAns ? ` <b>${M.qids.length - nAns}</b> are unanswered.` : ''}${nMarked ? ` ${nMarked} are marked for review.` : ''}</p>
      <p class="muted small">You can't change answers after submitting.</p>
      <div class="btn-row"><button class="btn ghost" data-act="modal-close">Keep working</button><button class="btn primary" data-act="mock-confirm">Submit</button></div>`);
  }
  function finishMock(timeUp) {
    const M = S.mock; if (!M) return;
    stopTimers();
    let correct = 0, wrong = 0, unanswered = 0;
    const res = {};
    for (const id of M.qids) {
      const q = byId.get(id); const a = M.ans[id];
      if (a == null) { unanswered++; res[id] = null; continue; }
      const ok = isCorrect(q, a); res[id] = ok;
      if (ok) correct++; else wrong++;
      record(q, a, ok);
    }
    const max = M.qids.length;
    const score = Math.max(0, correct - wrong * (M.neg || 0));
    const end = Math.min(Date.now(), M.deadline || Infinity);
    const r = { id: M.id, title: M.title, date: M.start, dur: (end - M.start) / 1000, qids: M.qids, ans: M.ans, marked: M.marked, res, correct, wrong, unanswered, score, max, neg: M.neg || 0, timeUp: !!timeUp, limit: M.cfg.m };
    S.mocks.push(r);
    if (S.mocks.length > 60) S.mocks = S.mocks.slice(-60);
    delete S.mock;
    save(); closeModal();
    location.replace('#/mock/result/' + r.id);
    if (timeUp) setTimeout(() => openModal(`<h2>Time's up</h2><p>Your test was submitted automatically.</p><div class="btn-row"><button class="btn primary" data-act="modal-close">See results</button></div>`), 50);
  }
  let resFilter = 'all', resFor = null;
  function mockResult(id) {
    if (resFor !== id) { resFilter = 'all'; resFor = id; }
    let m = S.mocks.find(x => x.id === id);
    if (m) m = rescore(m);
    if (!m) { location.replace('#/mock'); return; }
    main.dataset.view = 'mock-result';
    const p = pct(m.score, m.max);
    const subs = [...new Set(m.qids.map(i => (byId.get(i) || {}).s).filter(Boolean))];
    const rows = subs.map(s => {
      const ids = m.qids.filter(i => byId.get(i) && byId.get(i).s === s);
      const ok = ids.filter(i => m.res[i] === true).length, wr = ids.filter(i => m.res[i] === false).length;
      return { label: subjShort(s), value: pct(ok, ids.length), sub: `(${ok}/${ids.length})`, tip: `<b>${esc(subjName(s))}</b><br>${ok} right · ${wr} wrong · ${ids.length - ok - wr} skipped` };
    });
    const missed = m.qids.filter(i => m.res[i] !== true);
    const filt = {
      all: m.qids, wrong: m.qids.filter(i => m.res[i] === false), skipped: m.qids.filter(i => m.res[i] == null),
      marked: m.qids.filter(i => m.marked && m.marked[i]), right: m.qids.filter(i => m.res[i] === true),
    };
    const list = filt[resFilter] || filt.all;
    const answeredN = m.correct + m.wrong;
    main.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">Mock test result${m.timeUp ? ' · auto-submitted' : ''}</div><h1>${esc(m.title)}</h1><p>${fmtDate(m.date)} · ${m.qids.length} questions · ${fmtDur(m.dur)}${m.limit ? ` of ${m.limit} min` : ''}${m.neg ? ` · −${m.neg} per wrong answer` : ''}</p></div>
        <div class="btn-row">${missed.length ? `<a class="btn primary" href="#/practice/start?ids=${missed.join(',')}&t=${encodeURIComponent('Missed in ' + m.title)}">Practise the ${missed.length} I missed</a>` : ''}<a class="btn" href="#/mock">New test</a></div></div>
      <div class="result-hero">
        <section class="card"><div class="k muted small">Score</div><div class="score-big">${+m.score.toFixed(2)}<small> / ${m.max}</small></div>
          <div class="verdict-line" style="color:${p >= 60 ? 'var(--good-ink)' : p >= 40 ? 'var(--warn-ink)' : 'var(--bad-ink)'}">${p}% · ${p >= 75 ? 'Excellent. Keep it up' : p >= 60 ? 'Good. Polish the weak spots' : p >= 40 ? 'Getting there. Review the misses' : 'Needs work. Revise the guides, then retry'}</div>
          <div class="grid cols-2" style="margin-top:14px;gap:10px">
            <div><div class="muted small">✓ Correct</div><div style="font-weight:700;font-size:1.3rem;color:var(--good-ink)">${m.correct}</div></div>
            <div><div class="muted small">✗ Wrong</div><div style="font-weight:700;font-size:1.3rem;color:var(--bad-ink)">${m.wrong}</div></div>
            <div><div class="muted small">– Skipped</div><div style="font-weight:700;font-size:1.3rem">${m.unanswered}</div></div>
            <div><div class="muted small">Accuracy (answered)</div><div style="font-weight:700;font-size:1.3rem">${answeredN ? pct(m.correct, answeredN) + '%' : '—'}</div></div>
          </div>
        </section>
        <section class="card"><div class="card-title"><h2>Score by subject</h2><span class="muted small">% correct of questions asked</span></div>${barChart(rows)}</section>
      </div>
      <div class="review-filter seg" role="group">${[['all', 'All', filt.all.length], ['wrong', 'Wrong', filt.wrong.length], ['skipped', 'Skipped', filt.skipped.length], ['marked', 'Marked', filt.marked.length], ['right', 'Correct', filt.right.length]].map(([v, l, n]) => `<button data-act="res-filter" data-v="${v}" aria-pressed="${resFilter === v}">${l} (${n})</button>`).join('')}</div>
      <div class="bank-list">${list.length ? list.map(i => {
        const q = byId.get(i); if (!q) return '';
        const a = m.ans[i]; const idx = m.qids.indexOf(i) + 1;
        const status = m.res[i] === true ? '<span class="ok">✓ Correct</span>' : m.res[i] === false ? '<span class="no">✗ Wrong</span>' : '<span class="muted">– Not answered</span>';
        return bankItem(q, { open: m.res[i] !== true, chosen: a }).replace('<div class="qhead">', `<div class="qhead"><span class="qid">Q${idx}</span>${status}`);
      }).join('') : '<div class="card empty"><p>Nothing in this filter.</p></div>'}</div>`;
  }

  // ---------------------------------------------------------------- REVIEW
  function viewReview(parts) {
    const tab = parts[0] || 'mistakes';
    main.dataset.view = 'review';
    const mistakes = Q.filter(q => S.att[q.id] && !okOf(q, S.att[q.id].last)).sort((a, b) => S.att[b.id].t - S.att[a.id].t);
    const saved = Q.filter(q => S.bm[q.id]);
    const flagged = Q.filter(q => q.ka === false);
    const nokey = Q.filter(q => q.k == null && !q.gen);
    const tabs = [['mistakes', 'Mistakes', mistakes], ['saved', 'Saved', saved], ['flagged', 'Flagged keys', flagged], ['nokey', 'No official key', nokey]];
    const cur = tabs.find(t => t[0] === tab) || tabs[0];
    const blurbs = {
      mistakes: 'Questions where your latest attempt was wrong. Get one right and it drops off this list.',
      saved: 'Questions you saved with the bookmark button.',
      flagged: 'Questions where the official answer key in the PDFs looks wrong. Each shows the official key, the technically correct answer and why. Change how these are scored in Settings.',
      nokey: 'Sections of the bank that came without an answer key (e.g. Theory of Computation). These answers were worked out for you, so double-check them against your notes.',
    };
    main.innerHTML = `
      <div class="page-head"><div><div class="eyebrow">Review</div><h1>Review &amp; revise</h1><p>${blurbs[cur[0]]}</p></div>
        ${cur[2].length ? `<a class="btn primary" href="#/practice/start?ids=${cur[2].map(q => q.id).join(',')}&o=shuffle&t=${encodeURIComponent(cur[1])}">Practise these ${cur[2].length}</a>` : ''}</div>
      <div class="subj-tabs">${tabs.map(([id, l, arr]) => `<a class="chip ${id === cur[0] ? 'on' : ''}" href="#/review/${id}">${l} <span class="count">${arr.length}</span></a>`).join('')}</div>
      <div class="bank-list">${cur[2].length ? cur[2].map(q => bankItem(q, { open: true, chosen: cur[0] === 'mistakes' ? S.att[q.id].last : undefined })).join('') : `<div class="card empty"><h3>Nothing here yet</h3><p>${cur[0] === 'mistakes' ? 'Questions you get wrong will collect here.' : cur[0] === 'saved' ? 'Use the Save button on any question to collect it here.' : 'Nothing to show.'}</p></div>`}</div>`;
  }

  // ---------------------------------------------------------------- SETTINGS
  function openSettings(msg) {
    const sc = S.settings.scoring;
    const nAtt = Object.keys(S.att).length;
    openModal(`<h2>Settings</h2>
      <div class="field"><div class="label">Theme</div><div class="seg">${[['auto', 'Auto'], ['light', 'Light'], ['dark', 'Dark']].map(([v, l]) => `<button data-act="set-theme" data-v="${v}" aria-pressed="${S.settings.theme === v}">${l}</button>`).join('')}</div></div>
      <div class="field"><div class="label">Scoring for flagged answer keys</div>
        <div class="seg">${[['either', 'Accept either'], ['key', 'Official key'], ['corrected', 'Corrected answer']].map(([v, l]) => `<button data-act="set-scoring" data-v="${v}" aria-pressed="${sc === v}">${l}</button>`).join('')}</div>
        <span class="hint">${Q.filter(q => q.ka === false).length} questions have an official key that looks wrong. In the real exam the examiners' key is what counts, so “Official key” trains you on what they expect. “Accept either” counts both as right.</span></div>
      <hr>
      <div class="field"><div class="label">Your progress</div><span class="hint">${nAtt} questions attempted · ${Object.keys(S.bm).length} saved · ${S.mocks.length} mock tests. Stored only in this browser.</span>
        <div class="btn-row"><button class="btn sm" data-act="export">Export progress</button><button class="btn sm" data-act="import-pick">Import progress</button><input id="import-file" type="file" accept="application/json,.json" hidden data-change="import"><button class="btn sm danger" data-act="reset">Reset all progress</button></div>
        ${msg ? `<p class="small" style="margin-top:6px">${msg}</p>` : ''}
      </div>
      <div class="btn-row"><button class="btn primary" data-act="modal-close">Done</button></div>`);
  }

  // ---------------------------------------------------------------- events
  const actions = {
    theme() { S.settings.theme = effectiveDark() ? 'light' : 'dark'; applyTheme(); save(); },
    settings() { openSettings(); },
    'modal-close'() { closeModal(); },
    'set-theme'(el) { S.settings.theme = el.dataset.v; applyTheme(); save(); openSettings(); },
    'set-scoring'(el) { S.settings.scoring = el.dataset.v; save(); openSettings(); rerender(); },
    'import-pick'() { const f = $('#import-file'); if (f) f.click(); },
    export() {
      const blob = new Blob([JSON.stringify(S, null, 1)], { type: 'application/json' });
      const a = document.createElement('a'); a.href = URL.createObjectURL(blob);
      a.download = 'compreprep-progress-' + new Date().toISOString().slice(0, 10) + '.json';
      document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    },
    reset(el) {
      if (el.dataset.armed) { const theme = S.settings.theme; S = normalize({ settings: { theme } }); save(); openSettings('Progress reset.'); rerender(); return; }
      el.dataset.armed = '1'; el.textContent = 'Click again to erase everything';
    },
    bm(el) {
      const id = el.dataset.id; if (S.bm[id]) delete S.bm[id]; else S.bm[id] = 1; save();
      $$(`.bm[data-id="${id}"]`).forEach(b => { const on = !!S.bm[id]; b.classList.toggle('on', on); b.setAttribute('aria-pressed', on); b.querySelector('span').textContent = on ? 'Saved' : 'Save'; });
    },
    read(el) {
      const c = el.dataset.c; if (S.read[c]) delete S.read[c]; else S.read[c] = 1; save();
      el.setAttribute('aria-pressed', !!S.read[c]); el.textContent = S.read[c] ? '✓ Read' : 'Mark as read';
      const t = $(`[data-tick="${CSS.escape(c)}"]`); if (t) t.classList.toggle('on', !!S.read[c]);
      const sid = (main.dataset.view || '').split(':')[1]; if (sid) updateStudyProgress(sid);
    },
    'toc-toggle'(el) { const nav = $('#study-nav'); nav.classList.toggle('open'); el.setAttribute('aria-expanded', nav.classList.contains('open')); },
    // practice setup
    ps(el) { ps[el.dataset.k] = el.dataset.v; practiceSetup(); },
    'ps-subj'(el) { const v = el.dataset.v; if (ps.subjects.has(v)) ps.subjects.delete(v); else ps.subjects.add(v); ps.concepts.clear(); practiceSetup(); },
    'ps-subj-all'() { QB.subjects.forEach(s => ps.subjects.add(s.id)); ps.concepts.clear(); practiceSetup(); },
    'ps-subj-none'() { ps.subjects.clear(); ps.concepts.clear(); practiceSetup(); },
    'ps-concept'(el) { const v = el.dataset.v; if (ps.concepts.has(v)) ps.concepts.delete(v); else ps.concepts.add(v); practiceSetup(); },
    'ps-start'() {
      let title = 'Practice';
      if (ps.subjects.size === 1) title = ps.concepts.size === 1 ? conceptTitle([...ps.concepts][0]) : subjName([...ps.subjects][0]);
      else title = 'Mixed practice';
      const extra = { all: '', new: ' · not tried', wrong: ' · mistakes', bm: ' · saved', flagged: ' · key issues' }[ps.filter];
      startPractice(ps, title + extra);
    },
    'ps-discard'() { delete S.practice; save(); practiceSetup(); },
    choose(el) { practiceChoose(+el.dataset.i); },
    'p-next'() { const P = S.practice; if (P && P.i < P.qids.length - 1) { P.i++; save(); practiceRun(); window.scrollTo(0, 0); } },
    'p-prev'() { const P = S.practice; if (P && P.i > 0) { P.i--; save(); practiceRun(); window.scrollTo(0, 0); } },
    'p-finish'() { if (S.practice) { S.practice.done = true; save(); } go('#/practice/done'); },
    // bank
    bs(el) { bs[el.dataset.k] = el.dataset.v === 'true'; route(); },
    reveal(el) { revealed.add(el.dataset.id); const q = byId.get(el.dataset.id); const card = $('#q-' + CSS.escape(q.id)); if (card) { card.outerHTML = bankItem(q, { open: true }); if (bankCurrent.term) highlight($('#q-' + CSS.escape(q.id)), bankCurrent.term); } },
    'bank-more'() { bs.limit += 60; renderBankItems(bankCurrent.qs, bankCurrent.term); },
    // mock
    'mock-preset'(el) {
      ms.preset = el.dataset.v; const p = PRESETS.find(x => x.id === ms.preset);
      ms.n = p.n; ms.m = p.m;
      if (ms.preset !== 'custom') ms.subjects = new Set(QB.subjects.map(s => s.id));
      mockSetup();
    },
    'ms-subj'(el) { const v = el.dataset.v; if (ms.subjects.has(v)) ms.subjects.delete(v); else ms.subjects.add(v); mockSetup(); },
    ms(el) { ms[el.dataset.k] = el.dataset.v; mockSetup(); },
    'mock-start'() { startMock(); },
    'mock-abandon'(el) { if (!el.dataset.armed) { el.dataset.armed = 1; el.textContent = 'Click again to abandon'; return; } delete S.mock; save(); mockSetup(); },
    'm-choose'(el) { const M = S.mock; if (!M) return; M.ans[M.qids[M.i]] = +el.dataset.i; mockRun(); },
    'm-clear'() { const M = S.mock; if (!M) return; delete M.ans[M.qids[M.i]]; mockRun(); },
    'm-next'() { const M = S.mock; if (!M) return; if (M.i < M.qids.length - 1) { mockGo(M.i + 1); window.scrollTo(0, 0); } else mockRun(); },
    'm-prev'() { const M = S.mock; if (M) { mockGo(M.i - 1); window.scrollTo(0, 0); } },
    'm-mark'() { const M = S.mock; if (!M) return; const id = M.qids[M.i]; if (M.marked[id]) delete M.marked[id]; else M.marked[id] = 1; if (M.i < M.qids.length - 1) mockGo(M.i + 1); else mockRun(); },
    'm-goto'(el) { mockGo(+el.dataset.i); },
    'mock-submit'() { confirmSubmit(); },
    'mock-confirm'() { finishMock(false); },
    'res-filter'(el) { resFilter = el.dataset.v; const y = window.scrollY; route(); window.scrollTo(0, y); },
  };
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el) return;
    const fn = actions[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el, e); }
  });

  const changes = {
    'study-subject'(el) { go('#/study/' + el.value); },
    'bank-concept'(el) { const { parts, params } = parseHash(); if (el.value) params.set('c', el.value); else params.delete('c'); location.hash = '#/bank/' + (parts[1] || 'all') + (params.toString() ? '?' + params : ''); },
    'bank-filter'(el) { bs.filter = el.value; route(); },
    'ms-subject'(el) { ms.subject = el.value; mockSetup(); },
    'ms-n'(el) { ms.n = Math.max(1, +el.value || 1); mockSetup(); },
    'ms-m'(el) { ms.m = Math.max(0, +el.value || 0); },
    'ms-neg'(el) { ms.neg = +el.value; },
    import(el) {
      const f = el.files && el.files[0]; if (!f) return;
      const rd = new FileReader();
      rd.onload = () => {
        try {
          const d = JSON.parse(rd.result);
          if (!d || typeof d !== 'object' || !('att' in d)) throw new Error('not a progress file');
          S = normalize(d); save(); applyTheme(); openSettings('Progress imported.'); rerender();
        } catch (err) { openSettings('Could not import: that file is not a ComprePrep progress export.'); }
      };
      rd.readAsText(f);
    },
  };
  document.addEventListener('change', e => { const el = e.target.closest('[data-change]'); if (el && changes[el.dataset.change]) changes[el.dataset.change](el, e); });

  let searchDebounce;
  document.addEventListener('input', e => {
    const el = e.target.closest('[data-input="bank-search"]'); if (!el) return;
    clearTimeout(searchDebounce);
    searchDebounce = setTimeout(() => {
      const { parts, params } = parseHash();
      if (el.value.trim()) params.set('q', el.value.trim()); else params.delete('q');
      const sid = parts[1] || 'all';
      const { qs, term } = bankList(sid, params);
      history.replaceState(null, '', '#/bank/' + sid + (params.toString() ? '?' + params : ''));
      bs.limit = 40;
      const c = $('#bank-count'); if (c) c.textContent = `${qs.length} question${qs.length === 1 ? '' : 's'}${term ? ` matching “${term}”` : ''}`;
      renderBankItems(qs, term);
    }, 180);
  });

  // clicking a study link whose hash is already current: hashchange won't fire, so scroll directly
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href^="#/study/"]');
    if (a && a.getAttribute('href') === location.hash && (main.dataset.view || '').startsWith('study:')) { e.preventDefault(); scrollToConcept(parseHash().parts[2]); }
  });

  document.addEventListener('submit', e => {
    const f = e.target.closest('[data-form="search"]'); if (!f) return;
    e.preventDefault();
    const q = f.q.value.trim();
    go('#/bank/all' + (q ? '?q=' + encodeURIComponent(q) : ''));
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !modalRoot.hidden) { closeModal(); return; }
    if (e.key === 'Tab' && !modalRoot.hidden) {
      const f = $$('button, [href], input:not([hidden]), select', modalRoot);
      if (f.length) {
        const first = f[0], last = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        else if (!modalRoot.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
      }
      return;
    }
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = (e.target.tagName || '').toLowerCase();
    if (tag === 'input' || tag === 'select' || tag === 'textarea' || !modalRoot.hidden) return;
    const v = main.dataset.view;
    const k = e.key.toLowerCase();
    const idx = '1234abcd'.indexOf(k);
    if (v === 'practice-run') {
      if (idx >= 0) { practiceChoose(idx % 4); e.preventDefault(); }
      else if (k === 'arrowright' || k === 'n' || (k === 'enter' && tag !== 'button')) { actions['p-next'](); e.preventDefault(); }
      else if (k === 'arrowleft' || k === 'p') { actions['p-prev'](); e.preventDefault(); }
      else if (k === 's') { const b = $('.qcard .bm'); if (b) actions.bm(b); }
    } else if (v === 'mock-run' && S.mock) {
      if (idx >= 0) { const i = idx % 4; const q = byId.get(S.mock.qids[S.mock.i]); if (q && i < q.o.length) { S.mock.ans[q.id] = i; mockRun(); } e.preventDefault(); }
      else if (k === 'arrowright') { actions['m-next'](); e.preventDefault(); }
      else if (k === 'arrowleft') { actions['m-prev'](); e.preventDefault(); }
      else if (k === 'm') { actions['m-mark'](); e.preventDefault(); }
    }
  });

  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (mq.addEventListener) mq.addEventListener('change', () => { if (S.settings.theme === 'auto') applyTheme(); });
  }

  // ---------------------------------------------------------------- boot
  applyTheme();
  if (!Q.length) {
    main.innerHTML = '<div class="card empty"><h3>Question data not found</h3><p>Make sure <code>data/questions.js</code> sits next to <code>index.html</code>.</p></div>';
    return;
  }
  route();
})();
