(() => {
  "use strict";

  const KEY = "dayboard.roadmap.v1";
  const RUNS = 1000;
  const CONF = 0.85;
  const DAY = 86400000;
  const root = document.querySelector("#rm-root");
  if (!root) return;

  const uid = () => Math.random().toString(36).slice(2, 9);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const toIdx = (y, m, d) => Math.floor(Date.UTC(y, m, d) / DAY);
  const fromIdx = i => new Date(i * DAY);
  const iso = i => fromIdx(i).toISOString().slice(0, 10);
  const parseIso = s => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || ""); return m ? toIdx(+m[1], +m[2] - 1, +m[3]) : null; };
  const now = new Date();
  const todayIdx = toIdx(now.getFullYear(), now.getMonth(), now.getDate());

  const months = [];
  for (let i = 0; i < 12; i++) {
    const y = now.getFullYear() + Math.floor((now.getMonth() + i) / 12);
    const m = (now.getMonth() + i) % 12;
    const start = toIdx(y, m, 1);
    const end = toIdx(y, m + 1, 1);
    months.push({
      key: `${y}-${String(m + 1).padStart(2, "0")}`,
      label: fromIdx(start).toLocaleDateString("pl-PL", { month: "short", year: "2-digit", timeZone: "UTC" }),
      start, end,
    });
  }
  const H0 = months[0].start;
  const H1 = months[11].end;
  const isWork = d => { const w = fromIdx(d).getUTCDay(); return w !== 0 && w !== 6; };
  const workdays = months.map(m => { let n = 0; for (let d = m.start; d < m.end; d++) if (isWork(d)) n++; return n || 1; });

  function sample() {
    const t1 = uid(), t2 = uid(), t3 = uid(), i1 = uid(), i2 = uid(), i3 = uid();
    const full = (comps, n) => Object.fromEntries(comps.map(c => [c, Object.fromEntries(months.map(m => [m.key, n]))]));
    return {
      comps: ["Backend", "Frontend", "QA"],
      teams: [
        { id: t1, name: "Zespół Alfa", comps: ["Backend", "QA"], cap: full(["Backend", "QA"], 30) },
        { id: t2, name: "Zespół Beta", comps: ["Frontend", "QA"], cap: full(["Frontend", "QA"], 25) },
        { id: t3, name: "Zespół Gamma", comps: ["Backend", "Frontend"], cap: full(["Backend", "Frontend"], 20) },
      ],
      inits: [
        { id: i1, name: "Nowy system płatności", teams: [t1, t2], comps: ["Backend", "Frontend", "QA"],
          est: { [t1]: { min: 30, max: 50, start: "", fixed: false, due: "" }, [t2]: { min: 20, max: 35, start: "", fixed: false, due: "" } } },
        { id: i2, name: "Portal klienta", teams: [t2, t3], comps: ["Frontend", "Backend"],
          est: { [t2]: { min: 40, max: 70, start: "", fixed: false, due: "" }, [t3]: { min: 25, max: 45, start: "", fixed: false, due: "" } } },
      ],
    };
  }

  function load() {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved !== null) {
        const p = JSON.parse(saved);
        if (p && Array.isArray(p.comps) && Array.isArray(p.teams) && Array.isArray(p.inits)) return p;
      }
    } catch { /* fall through to sample */ }
    return sample();
  }
  let S = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch { /* storage unavailable */ } };
  const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) && n >= 0 ? n : d; };
  let selTeam = null;
  let result = null;

  /* ---------- Monte Carlo ---------- */
  function buildItems() {
    const items = [];
    S.inits.forEach((init, ii) => init.teams.forEach(tid => {
      const team = S.teams.find(t => t.id === tid);
      const e = init.est[tid];
      if (!team || !e) return;
      let req = init.comps.filter(c => team.comps.includes(c));
      if (!req.length) req = team.comps.slice();
      const sd = parseIso(e.start);
      items.push({
        init, team, e, req, ii,
        start: Math.max(sd === null ? H0 : sd, H0),
        due: e.fixed ? parseIso(e.due) : null,
        min: num(e.min), max: Math.max(num(e.max), num(e.min)),
      });
    }));
    // fixed-date items get capacity first, then initiative order
    return items.sort((a, b) => (b.e.fixed - a.e.fixed) || (a.ii - b.ii));
  }

  function simulate() {
    const items = buildItems();
    const base = {};
    S.teams.forEach(t => {
      base[t.id] = {};
      t.comps.forEach(c => {
        const a = new Float64Array(H1 - H0);
        months.forEach((m, mi) => {
          const per = num(t.cap?.[c]?.[m.key]) / workdays[mi];
          for (let d = m.start; d < m.end; d++) if (isWork(d)) a[d - H0] = per;
        });
        base[t.id][c] = a;
      });
    });
    const n = items.length;
    const fin = items.map(() => new Float64Array(RUNS));
    const sta = items.map(() => new Float64Array(RUNS));
    const initFin = {};
    S.inits.forEach(i => { initFin[i.id] = new Float64Array(RUNS); });
    const byInit = {};
    items.forEach((it, k) => (byInit[it.init.id] = byInit[it.init.id] || []).push(k));

    for (let r = 0; r < RUNS; r++) {
      const rem = items.map(it => {
        const eff = it.min + Math.random() * (it.max - it.min);
        return it.req.map(c => ({ c, left: eff / it.req.length }));
      });
      const done = new Array(n).fill(false);
      const fr = new Float64Array(n).fill(Infinity);
      const sr = new Float64Array(n).fill(Infinity);
      let open = items.filter((it, k) => { if (it.max <= 0) { done[k] = true; fr[k] = sr[k] = it.start; return false; } return it.req.length > 0; }).length;
      const used = {};
      for (let d = H0; d < H1 && open > 0; d++) {
        if (!isWork(d)) continue;
        const di = d - H0;
        for (const tid in base) { used[tid] = used[tid] || {}; for (const c in base[tid]) used[tid][c] = base[tid][c][di]; }
        for (let k = 0; k < n; k++) {
          const it = items[k];
          if (done[k] || d < it.start) continue;
          const pool = used[it.team.id];
          let allDone = true;
          for (const x of rem[k]) {
            if (x.left <= 1e-9) continue;
            const take = Math.min(x.left, pool[x.c] || 0);
            if (take > 0) { x.left -= take; pool[x.c] -= take; if (sr[k] === Infinity) sr[k] = d; }
            if (x.left > 1e-9) allDone = false;
          }
          if (allDone) { done[k] = true; fr[k] = d; open--; }
        }
      }
      for (let k = 0; k < n; k++) { fin[k][r] = fr[k]; sta[k][r] = sr[k]; }
      S.inits.forEach(init => {
        const ks = byInit[init.id] || [];
        initFin[init.id][r] = ks.length ? Math.max(...ks.map(k => fr[k])) : Infinity;
      });
    }
    const pct = (arr, p) => { const a = Array.from(arr).sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.ceil(p * a.length) - 1)]; };
    return {
      items: items.map((it, k) => ({
        it, start: pct(sta[k], 0.5), p50: pct(fin[k], 0.5), p85: pct(fin[k], CONF),
      })),
      inits: S.inits.map(i => ({ init: i, p50: pct(initFin[i.id], 0.5), p85: pct(initFin[i.id], CONF) })),
    };
  }

  /* ---------- Rendering ---------- */
  const fmt = d => (Number.isFinite(d) ? iso(d) : "poza horyzontem");
  const compBoxes = (list, checked, attr) => S.comps.length
    ? S.comps.map(c => `<label class="cb"><input type="checkbox" ${attr} data-c="${esc(c)}" ${checked.includes(c) ? "checked" : ""}> ${esc(c)}</label>`).join("")
    : '<span class="hint">Najpierw dodaj kompetencje.</span>';

  function render() {
    if (!S.teams.some(t => t.id === selTeam)) selTeam = S.teams[0]?.id || null;
    result = S.inits.length && S.teams.length ? simulate() : null;
    root.innerHTML = [secComps(), secTeams(), secInits(), secEst(), secCap(), secGantt()].join("");
    save();
  }

  const secComps = () => `<div class="rm-card"><h3>1. Kompetencje</h3>
    <div class="row">${S.comps.map(c => `<span class="chip">${esc(c)}<button type="button" data-act="del-comp" data-c="${esc(c)}" aria-label="Usuń ${esc(c)}">×</button></span>`).join("") || '<span class="hint">Brak kompetencji</span>'}</div>
    <form class="row" data-form="add-comp"><input type="text" name="n" placeholder="Nowa kompetencja" maxlength="40" required aria-label="Nazwa kompetencji"><button class="button button-secondary" type="submit">Dodaj</button></form></div>`;

  const secTeams = () => `<div class="rm-card"><h3>2. Zespoły</h3>
    ${S.teams.map(t => `<div class="item"><div class="row"><strong>${esc(t.name)}</strong><button class="x" type="button" data-act="del-team" data-t="${t.id}" aria-label="Usuń zespół">🗑</button></div>
      <div class="row">${compBoxes(S.comps, t.comps, `data-act="team-comp" data-t="${t.id}"`)}</div></div>`).join("")}
    <form class="row item" data-form="add-team"><input type="text" name="n" placeholder="Nazwa zespołu" maxlength="60" required aria-label="Nazwa zespołu"><button class="button button-secondary" type="submit">Dodaj zespół</button></form></div>`;

  const secInits = () => `<div class="rm-card"><h3>3. Inicjatywy</h3>
    ${S.inits.length < 2 ? '<p class="warn">Dodaj co najmniej 2 inicjatywy.</p>' : ""}
    ${S.inits.map(i => `<div class="item"><div class="row"><strong>${esc(i.name)}</strong>
      <button class="x" type="button" data-act="up" data-i="${i.id}" aria-label="Wyżej (wyższy priorytet)">↑</button><button class="x" type="button" data-act="down" data-i="${i.id}" aria-label="Niżej">↓</button>
      <button class="x" type="button" data-act="del-init" data-i="${i.id}" aria-label="Usuń inicjatywę">🗑</button></div>
      <div class="row"><span class="hint">Zespoły:</span>${S.teams.map(t => `<label class="cb"><input type="checkbox" data-act="init-team" data-i="${i.id}" data-t="${t.id}" ${i.teams.includes(t.id) ? "checked" : ""}> ${esc(t.name)}</label>`).join("")}</div>
      <div class="row"><span class="hint">Kompetencje:</span>${compBoxes(S.comps, i.comps, `data-act="init-comp" data-i="${i.id}"`)}</div></div>`).join("")}
    <form class="row item" data-form="add-init"><input type="text" name="n" placeholder="Nazwa inicjatywy" maxlength="120" required aria-label="Nazwa inicjatywy"><button class="button button-secondary" type="submit">Dodaj inicjatywę</button></form>
    <p class="hint">Kolejność = priorytet przy przydziale capacity (elementy fixed date mają zawsze pierwszeństwo).</p></div>`;

  function secEst() {
    const rows = S.inits.flatMap(i => i.teams.map(tid => {
      const t = S.teams.find(x => x.id === tid); const e = i.est[tid];
      if (!t || !e) return "";
      const a = `data-i="${i.id}" data-t="${tid}"`;
      const bad = e.max < e.min ? ' style="border-color:#b42318"' : "";
      return `<tr><td>${esc(i.name)}</td><td>${esc(t.name)}</td>
        <td><input type="number" min="0" step="1" value="${e.min}" data-act="est" data-f="min" ${a} aria-label="Min dni"></td>
        <td><input type="number" min="0" step="1" value="${e.max}" data-act="est" data-f="max" ${a}${bad} aria-label="Max dni"></td>
        <td><input type="date" value="${esc(e.start)}" data-act="est" data-f="start" ${a} aria-label="Data startu"></td>
        <td><input type="checkbox" ${e.fixed ? "checked" : ""} data-act="est" data-f="fixed" ${a} aria-label="Fixed date"></td>
        <td><input type="date" value="${esc(e.due)}" data-act="est" data-f="due" ${a} ${e.fixed ? "" : "disabled"} aria-label="Termin"></td></tr>`;
    })).join("");
    return `<div class="rm-card"><h3>4. Estymaty zespołów (osobodni pracy)</h3>
      <p class="hint">Min/max w dniach pracy; Monte Carlo (${RUNS} przebiegów, rozkład jednostajny min–max) uwzględnia capacity zespołu. Data startu pusta = dziś. Fixed date: element startuje w podanym dniu z pierwszeństwem do capacity, a termin jest oznaczany na czerwono, gdy P85 go przekracza.</p>
      <div class="scroll"><table><thead><tr><th>Inicjatywa</th><th>Zespół</th><th>Min</th><th>Max</th><th>Start</th><th>Fixed date</th><th>Termin</th></tr></thead><tbody>${rows || '<tr><td colspan="7">Zaznacz zespoły w inicjatywach.</td></tr>'}</tbody></table></div></div>`;
  }

  function secCap() {
    const t = S.teams.find(x => x.id === selTeam);
    let body = '<p class="hint">Dodaj zespół.</p>';
    if (t) {
      body = `<div class="row"><select data-act="sel-team" aria-label="Zespół">${S.teams.map(x => `<option value="${x.id}" ${x.id === t.id ? "selected" : ""}>${esc(x.name)}</option>`).join("")}</select></div>
        <div class="scroll"><table><thead><tr><th>Kompetencja</th>${months.map(m => `<th>${m.label}</th>`).join("")}<th></th></tr></thead><tbody>
        ${t.comps.map(c => `<tr><td>${esc(c)}</td>${months.map(m => `<td><input type="number" min="0" step="1" value="${num(t.cap?.[c]?.[m.key])}" data-act="cap" data-t="${t.id}" data-c="${esc(c)}" data-m="${m.key}" aria-label="${esc(c)} ${m.label}"></td>`).join("")}
        <td><button class="button button-secondary" type="button" data-act="fill" data-t="${t.id}" data-c="${esc(c)}">Wypełnij wg 1. mies.</button></td></tr>`).join("") || '<tr><td>Zespół nie ma kompetencji.</td></tr>'}
        </tbody></table></div>`;
    }
    return `<div class="rm-card"><h3>5. Capacity zespołów — kalendarz na 12 miesięcy (dni pracy w miesiącu)</h3>${body}</div>`;
  }

  function secGantt() {
    if (!result) return '<div class="rm-card"><h3>Gantt</h3><p class="hint">Dodaj zespoły i inicjatywy.</p></div>';
    const total = H1 - H0;
    const pos = d => `${((d - H0) / total) * 100}%`;
    const clampEnd = d => Math.min(Number.isFinite(d) ? d + 1 : H1, H1);
    const head = `<div class="g-head"><div class="g-label"></div><div class="g-track g-months">${months.map(m => `<span style="width:${((m.end - m.start) / total) * 100}%">${m.label}</span>`).join("")}</div></div>`;
    const today = todayIdx >= H0 && todayIdx < H1 ? `<i class="g-today" style="left:${pos(todayIdx)}"></i>` : "";
    const bar = (s, e, cls, title) => `<i class="g-bar ${cls}" title="${esc(title)}" style="left:${pos(s)};width:${Math.max(((e - s) / total) * 100, 0.4)}%"></i>`;
    const warnings = [];
    const lines = result.inits.map(r => {
      const its = result.items.filter(x => x.it.init.id === r.init.id);
      const starts = its.map(x => x.start).filter(Number.isFinite);
      const s = starts.length ? Math.min(...starts) : H0;
      const initRow = `<div class="g-row init"><div class="g-label" title="${esc(r.init.name)}">${esc(r.init.name)} — P85: ${fmt(r.p85)}</div>
        <div class="g-track">${today}${bar(s, clampEnd(r.p85), "init-bar", `${r.init.name}: P85 ${fmt(r.p85)}`)}</div></div>`;
      const itemRows = its.map(x => {
        const { it } = x;
        const late = it.due !== null && !(x.p85 <= it.due);
        if (late) warnings.push(`${r.init.name} / ${it.team.name}: P85 ${fmt(x.p85)} po terminie ${iso(it.due)}`);
        if (!it.req.length) warnings.push(`${it.team.name} nie ma kompetencji — brak prognozy dla „${r.init.name}”.`);
        const s0 = Number.isFinite(x.start) ? x.start : it.start;
        const cls = late ? "late" : it.e.fixed ? "fixed" : "";
        const title = `${it.team.name}: start ~${fmt(x.start)}, P50 ${fmt(x.p50)}, P85 ${fmt(x.p85)}`;
        const body = Number.isFinite(x.p50) ? bar(s0, clampEnd(x.p50), cls, title) : "";
        const tail = bar(Number.isFinite(x.p50) ? clampEnd(x.p50) : s0, clampEnd(x.p85), "tail", title);
        const due = it.due !== null && it.due >= H0 && it.due < H1 ? `<i class="g-due" title="Termin ${iso(it.due)}" style="left:${pos(it.due)}"></i>` : "";
        return `<div class="g-row item"><div class="g-label" title="${esc(title)}">${esc(it.team.name)}${it.e.fixed ? " 📌" : ""} — P85: ${fmt(x.p85)}</div><div class="g-track">${today}${due}${tail}${body}</div></div>`;
      }).join("");
      return initRow + itemRows;
    }).join("");
    return `<div class="rm-card"><h3>6. Roadmapa (Gantt) — prognoza Monte Carlo, ${Math.round(CONF * 100)}% pewności</h3>
      ${warnings.length ? `<p class="warn">${[...new Set(warnings)].map(esc).join("<br>")}</p>` : ""}
      <div class="scroll"><div class="gantt">${head}${lines}</div></div>
      <div class="legend"><span>■ P50 (mediana)</span><span>▨ do P85</span><span style="color:#0b7a4b">■ fixed date</span><span style="color:#b42318">■ po terminie</span><span style="color:#e8590c">| dziś</span><span>Czerwona kreska = termin</span></div></div>`;
  }

  /* ---------- Events ---------- */
  const toggle = (arr, v, on) => { const i = arr.indexOf(v); if (on && i < 0) arr.push(v); if (!on && i >= 0) arr.splice(i, 1); };

  root.addEventListener("submit", ev => {
    ev.preventDefault();
    const f = ev.target.dataset.form;
    const name = ev.target.elements.n.value.trim();
    if (!name) return;
    if (f === "add-comp") { if (!S.comps.includes(name)) S.comps.push(name); }
    if (f === "add-team") { const t = { id: uid(), name, comps: [], cap: {} }; S.teams.push(t); selTeam = t.id; }
    if (f === "add-init") S.inits.push({ id: uid(), name, teams: [], comps: [], est: {} });
    render();
  });

  root.addEventListener("click", ev => {
    const b = ev.target.closest("button[data-act]");
    if (!b) return;
    const { act, c, t, i } = b.dataset;
    if (act === "del-comp") {
      S.comps = S.comps.filter(x => x !== c);
      S.teams.forEach(x => { x.comps = x.comps.filter(y => y !== c); delete x.cap[c]; });
      S.inits.forEach(x => { x.comps = x.comps.filter(y => y !== c); });
    } else if (act === "del-team") {
      S.teams = S.teams.filter(x => x.id !== t);
      S.inits.forEach(x => { x.teams = x.teams.filter(y => y !== t); delete x.est[t]; });
    } else if (act === "del-init") {
      S.inits = S.inits.filter(x => x.id !== i);
    } else if (act === "up" || act === "down") {
      const k = S.inits.findIndex(x => x.id === i), j = k + (act === "up" ? -1 : 1);
      if (j >= 0 && j < S.inits.length) [S.inits[k], S.inits[j]] = [S.inits[j], S.inits[k]];
    } else if (act === "fill") {
      const team = S.teams.find(x => x.id === t);
      const v = num(team.cap[c]?.[months[0].key]);
      months.forEach(m => { team.cap[c][m.key] = v; });
    } else return;
    render();
  });

  root.addEventListener("change", ev => {
    const el = ev.target;
    const { act, c, t, i, f, m } = el.dataset;
    if (!act) return;
    const team = S.teams.find(x => x.id === t);
    const init = S.inits.find(x => x.id === i);
    if (act === "team-comp") {
      toggle(team.comps, c, el.checked);
      if (el.checked) { team.cap[c] = team.cap[c] || Object.fromEntries(months.map(mm => [mm.key, 20])); }
    } else if (act === "init-comp") toggle(init.comps, c, el.checked);
    else if (act === "init-team") {
      toggle(init.teams, t, el.checked);
      if (el.checked && !init.est[t]) init.est[t] = { min: 5, max: 10, start: "", fixed: false, due: "" };
    } else if (act === "est") {
      const e = init.est[t];
      if (f === "fixed") e.fixed = el.checked;
      else if (f === "min" || f === "max") e[f] = num(el.value);
      else e[f] = el.value;
    } else if (act === "cap") {
      team.cap[c] = team.cap[c] || {};
      team.cap[c][m] = num(el.value);
    } else if (act === "sel-team") selTeam = el.value;
    render();
  });

  render();
})();
