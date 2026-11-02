import { ENV_LABEL, ALL, filterScenes, facets, groupByLocation, characterSheets, productionCast, summarizeProduction } from './core/production.js';

/* Estado da aba (só vive na tela; não vai para o arquivo Fountain). Sobrevive às re-renderizações. */
const state = { env: ALL, location: ALL, period: ALL, group: false, character: '' };
let sheets = new Map();
let cast = [];  // elenco de cada cena (mesmo índice de `scenes`)
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

/** Personagens da cena: com fala em destaque; sem fala em cinza/itálico ("?" = nunca fala no roteiro). */
function castCell(td, c) {
    td.className = 'cast';
    if (!c || (!c.speaking.length && !c.silent.length)) { td.textContent = '—'; return; }
    const add = (text, cls, title) => {
        const sp = document.createElement('span');
        sp.textContent = text;
        if (cls) sp.className = cls;
        if (title) sp.title = title;
        if (td.childNodes.length) td.append(', ');
        td.append(sp);
    };
    for (const n of c.speaking) add(n, 'cs', 'Com fala');
    for (const n of c.silent) add(n.name + (n.known ? '' : '?'), 'cn', n.known ? 'Sem fala nesta cena' : 'Sem fala: nome em maiúsculas na ação, mas não fala em nenhuma cena (confira)');
}

/* ───────── resumo geral (painel; calculado sobre o roteiro inteiro) ───────── */
function bars(title, rows, label, key, max) {
    const box = document.createElement('div');
    box.className = 'sumCard';
    const h = document.createElement('h4');
    h.textContent = title;
    box.append(h);
    for (const r of rows) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'sumRow' + (state[key] === r.key ? ' on' : '');
        row.title = `Filtrar a tabela: ${label(r.key)}`;
        const name = Object.assign(document.createElement('span'), { className: 'n', textContent: label(r.key) });
        const bar = document.createElement('span');
        bar.className = 'bar';
        const fill = document.createElement('i');
        fill.style.width = `${Math.max(4, (r.count / max) * 100)}%`;
        bar.append(fill);
        const num = Object.assign(document.createElement('span'), { className: 'c', textContent: r.count });
        row.append(name, bar, num);
        row.onclick = () => { state[key] = state[key] === r.key ? ALL : r.key; renderProduction(lastScenes, lastGoto); };
        box.append(row);
    }
    return box;
}

function renderSummary(scenes) {
    const body = $('#sumBody');
    body.textContent = '';
    if (!scenes.length) { body.append(Object.assign(document.createElement('div'), { className: 'prodEmpty', textContent: 'Sem cenas para resumir.' })); return; }
    const sum = summarizeProduction(scenes, cast);
    const max = Math.max(...sum.env.map((r) => r.count), ...sum.period.map((r) => r.count), ...sum.location.map((r) => r.count));

    const total = document.createElement('div');
    total.className = 'sumCard sumTotal';
    total.append(Object.assign(document.createElement('strong'), { textContent: sum.total }),
        document.createTextNode(sum.total === 1 ? ' cena' : ' cenas'),
        Object.assign(document.createElement('small'), { textContent: `${plural(sum.location.length, 'locação', 'locações')} · ${plural(sum.characters.length, 'personagem', 'personagens')}` }));

    const grid = document.createElement('div');
    grid.className = 'sumGrid';
    grid.append(
        total,
        bars('Interior / exterior', sum.env, (k) => ENV_LABEL[k], 'env', max),
        bars('Período', sum.period, (k) => (k === '—' ? 'sem período' : k), 'period', max),
        bars('Cenas por locação', sum.location, (k) => k || '(sem locação)', 'location', max),
    );

    const chars = document.createElement('div');
    chars.className = 'sumCard sumChars';
    chars.append(Object.assign(document.createElement('h4'), { textContent: 'Personagens' }));
    if (!sum.characters.length) chars.append(Object.assign(document.createElement('div'), { className: 'prodEmpty', textContent: 'Nenhum personagem identificado.' }));
    else {
        const t = document.createElement('table');
        const hr = t.createTHead().insertRow();
        for (const h of ['Nome', 'Cenas com fala', 'Cenas sem fala'])
            hr.append(Object.assign(document.createElement('th'), { textContent: h }));
        const tb = t.createTBody();
        for (const c of sum.characters) {
            const tr = tb.insertRow();
            tr.insertCell().textContent = c.name + (c.guess ? '?' : '');
            tr.cells[0].title = c.guess ? 'Nome em maiúsculas na ação que não fala em nenhuma cena (confira)' : '';
            tr.insertCell().textContent = c.speaking || '—';
            tr.insertCell().textContent = c.silent || '—';
        }
        const wrap = document.createElement('div');
        wrap.className = 'sumScroll';
        wrap.append(t);
        chars.append(wrap);
    }
    body.append(grid, chars);
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
    castCell(tr.insertCell(), cast[sc.index]);
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

    /* personagens com fala (sempre sobre o roteiro inteiro, na ordem original) */
    sheets = characterSheets(scenes);
    cast = productionCast(scenes);
    renderSummary(scenes);
    if (!sheets.has(state.character)) state.character = '';
    const csel = $('#cSel');
    csel.textContent = '';
    csel.append(new Option(sheets.size ? 'Escolha o personagem…' : 'Nenhum personagem com fala', ''));
    for (const [name, c] of sheets) csel.append(new Option(`${name} (${plural(c.speeches, 'fala', 'falas')} · ${plural(c.scenes.length, 'cena', 'cenas')})`, name));
    csel.value = state.character;
    $('#cDoc').disabled = !state.character;
    const active = state.env || state.location || state.period;
    $('#fClear').disabled = !active;
    $('#fDoc').disabled = !filtered.length;

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
    for (const h of ['Cena', 'Ambiente', 'Localização', 'Período', 'Personagens'])
        head.append(Object.assign(document.createElement('th'), { textContent: h }));
    if (state.group) {
        for (const g of groupByLocation(filtered)) {
            const body = table.createTBody();
            const row = body.insertRow();
            row.className = 'grp';
            const th = document.createElement('th');
            th.colSpan = 5;
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

/** Filtros ativos (cópia) e callback do botão que gera a ordem de filmagem. */
export const currentFilters = () => ({ env: state.env, location: state.location, period: state.period });
export const onShootingOrder = (fn) => { $('#fDoc').onclick = fn; };

/** Folha de falas do personagem escolhido (ou null) e callback do botão. */
export const selectedCharacter = () => sheets.get(state.character) ?? null;
export const onCharacterSheet = (fn) => { $('#cDoc').onclick = fn; };
$('#cSel').onchange = (e) => { state.character = e.target.value; $('#cDoc').disabled = !state.character; };

/** Elenco (com e sem fala) de uma cena, para os documentos. */
export const castOf = (scene) => cast[scene.index] ?? { speaking: [], silent: [] };
