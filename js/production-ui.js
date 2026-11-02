import { ENV_LABEL, ALL, filterScenes, facets, groupByLocation } from './core/production.js';

/* Estado da aba (só vive na tela; não vai para o arquivo Fountain). Sobrevive às re-renderizações. */
const state = { env: ALL, location: ALL, period: ALL, group: false };
let lastScenes = [], lastGoto = () => {};

const $ = (s) => document.querySelector(s);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function fillSelect(sel, allLabel, entries, current, label = (v) => v) {
    sel.textContent = '';
    sel.append(new Option(allLabel, ALL));
    for (const [value, n] of entries) sel.append(new Option(`${label(value)} (${n})`, value));
    sel.value = current;
}

/** Remove do estado filtros cujo valor deixou de existir (ex.: cena editada). */
function sanitize(f) {
    const valid = { env: [...f.env.keys()], location: f.location.map((e) => e[0]), period: f.period.map((e) => e[0]) };
    for (const key of Object.keys(valid))
        if (state[key] && !valid[key].includes(state[key])) state[key] = ALL;
}

function sceneRow(body, sc) {
    const tr = body.insertRow();
    tr.title = sc.heading;
    const cells = [[sc.number, 'num'], [ENV_LABEL[sc.env], ''], [sc.location, 'loc'], [sc.period || '—', '']];
    for (const [text, cls] of cells) {
        const td = tr.insertCell();
        td.textContent = text;
        if (cls) td.className = cls;
    }
    tr.onclick = () => lastGoto(sc.line);
}

/** Desenha a aba Produção: filtros + tabela de cenas. Somente leitura (não altera o roteiro). */
export function renderProduction(scenes, onGoto) {
    lastScenes = scenes;
    lastGoto = onGoto;
    // 2 passadas: primeiro limpa valores obsoletos, depois calcula as contagens com o estado válido
    let f = facets(scenes, state);
    sanitize(f);
    f = facets(scenes, state);

    fillSelect($('#fEnv'), 'Todos', ['int', 'ext', 'mixed', 'other'].filter((k) => f.env.has(k)).map((k) => [k, f.env.get(k)]), state.env, (k) => ENV_LABEL[k]);
    fillSelect($('#fLoc'), 'Todas', f.location, state.location);
    fillSelect($('#fPer'), 'Todos', f.period, state.period);
    $('#fGroup').checked = state.group;
    const filtered = filterScenes(scenes, state);
    const active = state.env || state.location || state.period;
    $('#fClear').disabled = !active;

    $('#prodCount').textContent = active && scenes.length
        ? `${plural(filtered.length, 'cena', 'cenas')} de ${scenes.length}`
        : plural(scenes.length, 'cena', 'cenas');

    const box = $('#prodTable');
    box.textContent = '';
    if (!filtered.length) {
        const p = document.createElement('div');
        p.className = 'prodEmpty';
        p.textContent = scenes.length
            ? 'Nenhuma cena corresponde aos filtros.'
            : 'Nenhuma cena encontrada. Escreva um cabeçalho como “INT. SALA - DIA” no roteiro.';
        box.append(p);
        return;
    }
    const table = document.createElement('table');
    const head = table.createTHead().insertRow();
    for (const h of ['Cena', 'Ambiente', 'Localização', 'Período'])
        head.append(Object.assign(document.createElement('th'), { textContent: h }));
    if (state.group) {
        for (const g of groupByLocation(filtered)) {
            const body = table.createTBody();
            const row = body.insertRow();
            row.className = 'grp';
            const th = document.createElement('th');
            th.colSpan = 4;
            th.textContent = `${g.location} — ${plural(g.scenes.length, 'cena', 'cenas')}`;
            row.append(th);
            for (const sc of g.scenes) sceneRow(body, sc);
        }
    } else {
        const body = table.createTBody();
        for (const sc of filtered) sceneRow(body, sc);
    }
    box.append(table);
}

/* eventos dos filtros: atualizam o estado e redesenham com as últimas cenas conhecidas */
const rerender = () => renderProduction(lastScenes, lastGoto);
$('#fEnv').onchange = (e) => { state.env = e.target.value; rerender(); };
$('#fLoc').onchange = (e) => { state.location = e.target.value; rerender(); };
$('#fPer').onchange = (e) => { state.period = e.target.value; rerender(); };
$('#fGroup').onchange = (e) => { state.group = e.target.checked; rerender(); };
$('#fClear').onclick = () => { state.env = state.location = state.period = ALL; rerender(); };

/** Cenas atualmente visíveis (com os filtros aplicados) — usado pelos documentos de produção. */
export const visibleScenes = () => filterScenes(lastScenes, state);
