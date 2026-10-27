import { parse } from './core/parser.js';
import { defaultConfig } from './core/config.js';
import { createEditor, summarize, foldAll, unfoldAll } from './editor.js';
import { kvGet, kvSet, listDocs, saveDoc, deleteDoc, newId } from './storage.js';
const $ = (s) => document.querySelector(s);
const TEMPLATE = `Title: Novo roteiro
Credit: Escrito por
Author: Seu Nome
Draft date: ${new Date().toLocaleDateString('pt-BR')}

# Ato I

= Apresentação do mundo e do conflito.

INT. COZINHA - NOITE

Uma cozinha pequena. ANA (30) corta cebolas e chora, ou finge chorar. [[checar continuidade]]

ANA
(sem olhar)
Você voltou cedo.

CARLOS
O jantar não esperava ninguém.

CUT TO:

EXT. RUA - CONTÍNUO

A chuva *escorre* pelas janelas. **Ninguém** passa.

BRICK
Screw retirement.

STEEL ^
Screw retirement, tomorrow.

> FIM <
`;
/* ───────── estado ───────── */
let doc;
let cfg = { ...defaultConfig };
let ed;
let summary = { lineClass: new Map(), headings: [], characters: [], locations: [], times: [] };
let srcEls = [];
let timer = 0, saveTimer = 0, folded = false, pdfUrl = '';
/* ───────── pipeline de atualização ───────── */
function refresh() {
    const text = ed.getText();
    const parsed = parse(text, { ...cfg, print_dialogue_numbers: false }, true);
    summary = summarize(parsed);
    ed.setSummary(summary);
    const mp = $('#mainpage'); // mesmas classes do preview original: margens (innerpage) + números de cena
    mp.className = 'innerpage' + { left: ' numberonleft', right: ' numberonright', both: ' numberonleft numberonright' }[cfg.scenes_numbers];
    mp.innerHTML = parsed.scriptHtml;
    const tp = $('#titlepage_container');
    if (parsed.titleHtml) {
        tp.style.display = 'block';
        $('#titlepage').innerHTML = parsed.titleHtml;
    }
    else
        tp.style.display = 'none';
    srcEls = [...document.querySelectorAll('#workspace [id^="sourceline_"]')]
        .map(el => ({ line: +el.id.slice(11), el })).sort((a, b) => a.line - b.line);
    renderOutline(parsed);
    $('#status').textContent = `${parsed.properties.sceneNames.length} cenas · ${parsed.properties.characters.size} personagens`;
    syncPreview(ed.currentLine(), false);
}
const schedule = () => { clearTimeout(timer); timer = window.setTimeout(refresh, 200); };
function onChange() {
    schedule();
    $('#status').dataset.dirty = '1';
    clearTimeout(saveTimer);
    saveTimer = window.setTimeout(async () => { doc.text = ed.getText(); await saveDoc(doc); await kvSet('current', doc.id); delete $('#status').dataset.dirty; }, 700);
}
/* ───────── preview sincronizado ───────── */
let lastCur = null;
function syncPreview(line, scroll = true) {
    if (!srcEls.length)
        return;
    let lo = 0, hi = srcEls.length - 1, best = 0;
    while (lo <= hi) {
        const m = (lo + hi) >> 1;
        if (srcEls[m].line <= line) {
            best = m;
            lo = m + 1;
        }
        else
            hi = m - 1;
    }
    const el = srcEls[best].el;
    lastCur?.classList.remove('cur');
    el.classList.add('cur');
    lastCur = el;
    if (scroll && el.offsetParent)
        el.scrollIntoView({ block: 'center', behavior: 'smooth' });
}
$('#workspace').addEventListener('click', e => {
    const el = e.target.closest('[id^="sourceline_"]');
    if (el) {
        ed.goToLine(+el.id.slice(11));
        if (innerWidth < 960)
            setView('edit');
    }
});
// (O preview não encolhe mais a página: a fonte tem tamanho fixo e o texto quebra linha. Veja o fim de css/app.css.)
/* ───────── outline ───────── */
function renderOutline(parsed) {
    const tree = $('#outlineTree');
    tree.textContent = '';
    const showSyn = $('#oSyn').checked, showNote = $('#oNote').checked;
    let n = 0;
    const row = (parent, cls, text, line) => {
        const d = document.createElement('div');
        d.className = 'o ' + cls;
        d.textContent = text;
        d.dataset.line = String(line);
        parent.append(d);
    };
    const add = (parent, items) => {
        for (const it of items) {
            if (it.isnote) {
                if (showNote)
                    row(parent, 'nt', '✎ ' + it.text, it.range.start.line);
                continue;
            }
            const line = it.range.start.line;
            if (it.section) {
                row(parent, 'sec', it.text, line);
                if (showSyn)
                    for (const s of it.synopses ?? [])
                        row(parent, 'syn', s.synopsis, s.line);
                const c = document.createElement('div');
                c.className = 'oc';
                parent.append(c);
                add(c, it.children ?? []);
            }
            else {
                row(parent, 'scn', `${++n}. ${it.text}`, line);
                if (showSyn)
                    for (const s of it.synopses ?? [])
                        row(parent, 'syn', s.synopsis, s.line);
                if (showNote)
                    for (const s of it.notes ?? [])
                        row(parent, 'nt', '✎ ' + s.note, s.line);
            }
        }
    };
    add(tree, parsed.properties.structure);
}
$('#outlineTree').addEventListener('click', e => {
    const o = e.target.closest('.o');
    if (!o)
        return;
    ed.goToLine(+o.dataset.line);
    if (innerWidth < 960)
        setView('edit');
});
['#oSyn', '#oNote'].forEach(s => $(s).addEventListener('change', refresh));
/* ───────── vistas ───────── */
function setView(v) {
    document.body.dataset.v = v;
    document.querySelectorAll('#tabs [data-v]').forEach(b => b.classList.toggle('on', b.dataset.v === v));
}
document.querySelectorAll('#tabs [data-v]').forEach(b => b.onclick = () => setView(b.dataset.v));
$('#bFold').onclick = () => { folded ? unfoldAll(ed.view) : foldAll(ed.view); folded = !folded; };
/* ───────── documentos ───────── */
async function openDoc(d) {
    doc = d;
    $('#docName').value = d.name;
    ed.setText(d.text);
    await kvSet('current', d.id);
    refresh();
}
const titleOf = (t) => (t.match(/^\s*title:\s*(.+)$/im)?.[1] ?? '').trim();
async function newDoc(name, text) {
    const d = { id: newId(), name: name || titleOf(text) || 'Sem título', text, updated: Date.now() };
    await saveDoc(d);
    await openDoc(d);
}
$('#docName').addEventListener('change', async (e) => { doc.name = e.target.value || 'Sem título'; await saveDoc(doc); });
async function renderDocs() {
    const box = $('#docList');
    box.textContent = '';
    for (const d of await listDocs()) {
        const r = document.createElement('div');
        r.className = 'dr';
        const name = document.createElement('span');
        name.textContent = d.name;
        const when = document.createElement('small');
        when.textContent = new Date(d.updated).toLocaleDateString('pt-BR');
        const del = document.createElement('button');
        del.type = 'button';
        del.textContent = '✕';
        del.title = 'Excluir';
        name.onclick = async () => { await openDoc(d); $('#dlgDocs').close(); };
        del.onclick = async () => {
            await deleteDoc(d.id);
            if (d.id === doc.id) {
                const rest = await listDocs();
                rest.length ? await openDoc(rest[0]) : await newDoc('', TEMPLATE);
            }
            renderDocs();
        };
        r.append(name, when, del);
        box.append(r);
    }
}
$('#bDocs').onclick = async () => { await renderDocs(); $('#dlgDocs').showModal(); };
$('#docNew').onclick = async () => { await newDoc('Novo roteiro', TEMPLATE.replace('Novo roteiro', 'Novo roteiro')); $('#dlgDocs').close(); };
/* ───────── abrir / salvar arquivos ───────── */
$('#bOpen').onclick = () => $('#file').click();
$('#file').onchange = async (e) => {
    const f = e.target.files?.[0];
    if (!f)
        return;
    await newDoc(f.name.replace(/\.[^.]+$/, ''), await f.text());
    e.target.value = '';
};
async function saveFile(blob, name, type) {
    const w = window;
    if (w.showSaveFilePicker) {
        try {
            const h = await w.showSaveFilePicker({ suggestedName: name, types: [type] });
            const s = await h.createWritable();
            await s.write(blob);
            await s.close();
            return;
        }
        catch (e) {
            if (e?.name === 'AbortError')
                return;
        }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
const fname = () => doc.name.replace(/[\\/:*?"<>|]+/g, '').trim() || 'roteiro';
$('#bSave').onclick = () => saveFile(new Blob([ed.getText()], { type: 'text/plain' }), fname() + '.fountain', { description: 'Fountain', accept: { 'text/plain': ['.fountain'] } });
addEventListener('keydown', e => { if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault();
    $('#bSave').click();
} });
window.launchQueue?.setConsumer(async (p) => {
    const h = p.files?.[0];
    if (!h)
        return;
    const f = await h.getFile();
    await newDoc(f.name.replace(/\.[^.]+$/, ''), await f.text());
});
const FIELDS = [
    ['print_profile', 'Papel', [['a4', 'A4'], ['usletter', 'Carta (US)']]],
    ['scenes_numbers', 'Numeração de cenas', [['both', 'Ambas as margens'], ['left', 'Esquerda'], ['right', 'Direita'], ['none', 'Nenhuma']]],
    ['print_title_page', 'Página de título', 'b'], ['show_page_numbers', 'Numerar páginas', 'b'],
    ['create_bookmarks', 'Bookmarks de cenas e seções', 'b'], ['invisible_section_bookmarks', 'Bookmarks de seções não impressas', 'b'],
    ['embolden_scene_headers', 'Cabeçalhos de cena em negrito', 'b'], ['embolden_character_names', 'Nomes de personagem em negrito', 'b'],
    ['use_dual_dialogue', 'Diálogo duplo', 'b'], ['split_dialogue', 'Dividir diálogo entre páginas (MORE/CONT’D)', 'b'],
    ['double_space_between_scenes', 'Espaço duplo entre cenas', 'b'], ['each_scene_on_new_page', 'Cada cena em nova página', 'b'],
    ['merge_empty_lines', 'Unir linhas vazias', 'b'], ['print_sections', 'Imprimir seções', 'b'], ['print_synopsis', 'Imprimir sinopses', 'b'],
    ['print_notes', 'Imprimir notas', 'b'], ['print_dialogue_numbers', 'Numerar falas', 'b'],
    ['print_header', 'Cabeçalho', 't'], ['print_footer', 'Rodapé', 't'], ['print_watermark', 'Marca d’água', 't'],
];
function buildForm() {
    const box = $('#pdfFields');
    box.textContent = '';
    for (const [key, label, kind] of FIELDS) {
        const row = document.createElement('label');
        row.className = 'fld';
        row.append(label);
        let inp;
        if (kind === 'b') {
            inp = document.createElement('input');
            inp.type = 'checkbox';
            inp.checked = !!cfg[key];
        }
        else if (kind === 't') {
            inp = document.createElement('input');
            inp.type = 'text';
            inp.value = String(cfg[key] ?? '');
        }
        else {
            inp = document.createElement('select');
            for (const [v, t] of kind)
                inp.add(new Option(t, v));
            inp.value = String(cfg[key]);
        }
        inp.dataset.key = key;
        row.append(inp);
        box.append(row);
    }
    const hl = $('#hlList');
    hl.textContent = '';
    for (const c of summary.characters) {
        const l = document.createElement('label');
        const i = document.createElement('input');
        i.type = 'checkbox';
        i.value = c;
        l.append(i, ' ' + c);
        hl.append(l);
    }
    $('#hlBox').hidden = !summary.characters.length;
}
$('#bPdf').onclick = () => { buildForm(); $('#dlgPdf').showModal(); };
$('#pdfGo').onclick = async () => {
    const btn = $('#pdfGo');
    document.querySelectorAll('#pdfFields [data-key]').forEach(i => {
        cfg[i.dataset.key] = i.type === 'checkbox' ? i.checked : i.value;
    });
    await kvSet('pdf-cfg', cfg);
    const hl = [...document.querySelectorAll('#hlList input:checked')].map(i => i.value);
    btn.disabled = true;
    btn.textContent = 'Gerando…';
    await new Promise(r => setTimeout(r, 30)); // deixa o botão repintar antes do trabalho pesado
    try {
        const { makePdf } = await import('./pdf-export.js'); // o pdfkit só é baixado quando se exporta o primeiro PDF
        const { blob, pages } = await makePdf(ed.getText(), cfg, hl);
        showPdf(blob, pages);
        $('#dlgPdf').close();
    }
    catch (err) {
        console.error(err);
        alert('Não foi possível gerar o PDF: ' + (err?.message ?? err));
    }
    finally {
        btn.disabled = false;
        btn.textContent = 'Gerar PDF';
    }
};
function showPdf(blob, pages) {
    if (pdfUrl)
        URL.revokeObjectURL(pdfUrl);
    pdfUrl = URL.createObjectURL(blob);
    $('#workspace').hidden = true;
    $('#pdfbar').hidden = false;
    const f = $('#pdfframe');
    f.hidden = false;
    f.src = pdfUrl;
    $('#pdfinfo').textContent = `PDF · ${pages} páginas · ${(blob.size / 1024).toFixed(0)} KB`;
    setView('preview');
}
$('#pdfClose').onclick = () => { $('#pdfframe').hidden = true; $('#pdfbar').hidden = true; $('#workspace').hidden = false; };
$('#pdfDl').onclick = async () => { const b = await (await fetch(pdfUrl)).blob(); saveFile(b, fname() + '.pdf', { description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }); };
/* ───────── inicialização ───────── */
(async function init() {
    // Service worker: faz o app funcionar offline e ser instalável (veja sw.js)
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
    cfg = { ...defaultConfig, ...((await kvGet('pdf-cfg')) ?? {}) };
    const docs = await listDocs();
    const cur = await kvGet('current');
    doc = docs.find(d => d.id === cur) ?? docs[0] ?? { id: newId(), name: 'Meu primeiro roteiro', text: TEMPLATE, updated: Date.now() };
    ed = createEditor($('#editor'), doc.text, { onChange, onCursor: l => syncPreview(l) });
    $('#docName').value = doc.name;
    if (!docs.length)
        await saveDoc(doc);
    await kvSet('current', doc.id);
    refresh();
    setView(innerWidth < 960 ? 'edit' : 'edit');
})();
