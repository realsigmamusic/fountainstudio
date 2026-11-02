/*
 * Documentos PDF da aba Produção.
 * Gerados direto do conteúdo que o parser já reconheceu (core/production.js); o roteiro não é alterado.
 * As primitivas (newDoc, inline, finishDoc) são compartilhadas com as folhas de falas.
 */
import { loadPdfEngine } from './pdf-export.js';
import { getFonts } from './core/fonts.js';
import { ENV_LABEL, sceneBlocks, speakingCharacters, groupByLocation } from './core/production.js';

export const PAGE = { w: 595.28, h: 841.89, left: 56, right: 56, top: 70, bottom: 64 };
export const COL = { w: PAGE.w - PAGE.left - PAGE.right };
const SIZE = 11, GAP = 2, GRAY = '#666666', LIGHT = '#ececec';

/* ───────── primitivas ───────── */

export async function newDoc() {
    await loadPdfEngine();
    const doc = new window.PDFDocument({
        size: [PAGE.w, PAGE.h], bufferPages: true,
        margins: { top: PAGE.top, bottom: PAGE.bottom, left: PAGE.left, right: PAGE.right },
        info: { Creator: 'Fountain Studio' },
    });
    const f = getFonts();
    doc.registerFont('N', f.normal); doc.registerFont('B', f.bold);
    doc.registerFont('I', f.italic); doc.registerFont('BI', f.boldItalic);
    const chunks = [];
    doc.on('data', (c) => chunks.push(c instanceof Uint8Array ? c : new Uint8Array(c)));
    doc.done = new Promise((ok, err) => { doc.on('end', () => ok(new Blob(chunks, { type: 'application/pdf' }))); doc.on('error', err); });
    doc.font('N').fontSize(SIZE);
    return doc;
}

/** Divide "**negrito**", "*itálico*" e "***ambos***" em trechos (sublinhado _x_ e escapes \* são tratados como texto). */
export function inlineSegments(text) {
    const out = [];
    const re = /(\*{1,3})(?=\S)(.+?)(?<=\S)\1/g;
    let last = 0, m;
    const plain = (t) => t.replace(/\\\*/g, '*').replace(/(^|\s)_(\S.*?\S|\S)_(?=\s|$|[.,;:!?])/g, '$1$2');
    while ((m = re.exec(text))) {
        if (m.index > last) out.push({ t: plain(text.slice(last, m.index)), f: 'N' });
        out.push({ t: plain(m[2]), f: { 1: 'I', 2: 'B', 3: 'BI' }[m[1].length] });
        last = re.lastIndex;
    }
    if (last < text.length) out.push({ t: plain(text.slice(last)), f: 'N' });
    return out.filter((s) => s.t);
}
export const stripInline = (text) => inlineSegments(text).map((s) => s.t).join('');

/** Altura que o texto ocupará (Courier Prime é monoespaçada: negrito/itálico não mudam a largura). */
export function textHeight(doc, text, width, size = SIZE) {
    doc.font('N').fontSize(size);
    return doc.heightOfString(stripInline(text), { width, lineGap: GAP });
}

/** Escreve texto com formatação inline a partir de (x, y), quebrando em `width`. */
export function inline(doc, text, x, width, opts = {}) {
    const segs = inlineSegments(text);
    const y = doc.y;
    segs.forEach((g, i) => {
        doc.font(g.f);
        const o = { width, lineGap: GAP, continued: i < segs.length - 1, ...opts };
        if (i === 0) doc.text(g.t, x, y, o); else doc.text(g.t, o);
    });
    doc.font('N');
}

/** Se não couber `h` pontos na página, começa outra. */
export function need(doc, h) {
    if (doc.y + h > PAGE.h - PAGE.bottom) { doc.addPage(); return true; }
    return false;
}

/** Cabeçalho e rodapé em todas as páginas (numeração "x / y"). `headerFor(i)` devolve o texto do cabeçalho da página i. */
export function finishDoc(doc, { headerFor, footerLeft }) {
    const { start, count } = doc.bufferedPageRange();
    for (let i = 0; i < count; i++) {
        doc.switchToPage(start + i);
        const m = doc.page.margins, saved = { ...m };
        m.top = m.bottom = 0; // escrever nas margens não pode disparar nova página
        doc.font('N').fontSize(8).fillColor(GRAY);
        doc.text(headerFor(i), PAGE.left, 30, { width: COL.w, lineBreak: false, ellipsis: true });
        doc.moveTo(PAGE.left, 46).lineTo(PAGE.w - PAGE.right, 46).lineWidth(0.5).strokeColor('#bbbbbb').stroke();
        doc.text(footerLeft, PAGE.left, PAGE.h - 38, { width: COL.w, lineBreak: false, align: 'left' });
        doc.text(`${i + 1} / ${count}`, PAGE.left, PAGE.h - 38, { width: COL.w, lineBreak: false, align: 'right' });
        Object.assign(m, saved);
    }
    doc.flushPages();
    doc.end();
    return { pages: count };
}

/* ───────── corpo da cena (usado também pelas folhas de falas) ───────── */

/** Faixa com o número ORIGINAL da cena e o cabeçalho original. */
export function sceneBand(doc, sc, { keep = 90 } = {}) {
    const numW = 54, textW = COL.w - numW - 8;
    doc.font('B').fontSize(11);
    const h = Math.max(22, doc.heightOfString(sc.original || sc.heading, { width: textW }) + 10);
    need(doc, h + keep);
    const y = doc.y;
    doc.rect(PAGE.left, y, COL.w, h).fill(LIGHT);
    doc.fillColor('#000').font('B').fontSize(12).text(sc.number, PAGE.left + 8, y + (h - 12) / 2 - 1, { width: numW - 8, lineBreak: false });
    doc.font('B').fontSize(11).text(sc.original || sc.heading, PAGE.left + numW, y + 5, { width: textW });
    doc.y = y + h + 6;
    doc.font('N').fontSize(SIZE).fillColor('#000');
}

/** Ação, diálogos, transições — na ordem do roteiro. */
export function sceneBody(doc, blocks) {
    const X = PAGE.left;
    for (const b of blocks) {
        doc.font('N').fontSize(SIZE).fillColor('#000');
        if (b.kind === 'action') {
            need(doc, textHeight(doc, b.text, COL.w) > 120 ? 40 : textHeight(doc, b.text, COL.w));
            inline(doc, b.text, X, COL.w);
            doc.moveDown(0.6);
        } else if (b.kind === 'transition') {
            need(doc, 20);
            inline(doc, b.text, X, COL.w, { align: 'right' });
            doc.moveDown(0.6);
        } else if (b.kind === 'centered') {
            need(doc, 20);
            inline(doc, b.text, X, COL.w, { align: 'center' });
            doc.moveDown(0.6);
        } else if (b.kind === 'dialogue') {
            const cx = X + 150, px = X + 110, dx = X + 80, dw = 290;
            const first = b.lines[0];
            need(doc, 16 + (first ? textHeight(doc, first.text, first.type === 'dialogue' ? dw : 200) : 0));
            doc.font('B').text(b.label, cx, doc.y, { width: COL.w - 150, lineGap: GAP });
            for (const l of b.lines) {
                const isP = l.type === 'parenthetical';
                if (doc.y + textHeight(doc, l.text, isP ? 200 : dw) > PAGE.h - PAGE.bottom) doc.addPage();
                if (isP) { doc.font('N'); doc.text(l.text, px, doc.y, { width: 200, lineGap: GAP }); }
                else inline(doc, l.text, dx, dw);
            }
            doc.moveDown(0.6);
        }
    }
}

/* ───────── ordem de filmagem por locação ───────── */

const periodGroups = (scenes) => {
    const m = new Map();
    for (const sc of scenes) { const k = sc.period || 'SEM PERÍODO'; if (!m.has(k)) m.set(k, []); m.get(k).push(sc); }
    return [...m];
};
const plural = (n, a, b) => `${n} ${n === 1 ? a : b}`;

/**
 * Gera a ordem de filmagem das cenas recebidas (já filtradas).
 * Estrutura: cada locação começa em página nova; dentro dela, as cenas são agrupadas por período
 * (na ordem em que aparecem) e, em cada período, seguem a ordem original do roteiro.
 * @param scenes cenas visíveis; @param filters filtros ativos (só para o texto de identificação)
 */
export async function makeShootingOrder({ scenes, filters, docName, castOf }) {
    const doc = await newDoc();
    const groups = groupByLocation(scenes);
    const pageLoc = [];
    const pageScenes = [[]]; // números das cenas presentes em cada página (para o cabeçalho)
    const hasGuess = !!castOf && scenes.some((sc) => castOf(sc).silent.some((n) => !n.known)); // candidatos "?" → nota na capa
    let curLoc = '', curScene = '';
    doc.on('pageAdded', () => { pageLoc.push(curLoc); pageScenes.push(curScene ? [curScene] : []); }); // cena em andamento continua na nova página
    pageLoc.push(curLoc); // 1ª página

    /* capa: identificação do documento */
    doc.font('N').fontSize(9).fillColor(GRAY).text('ORDEM DE FILMAGEM', PAGE.left, PAGE.top, { characterSpacing: 2 });
    doc.font('B').fontSize(20).fillColor('#000').text(docName || 'Roteiro', { width: COL.w });
    const tags = [
        filters.location && `Locação: ${filters.location}`,
        filters.env && `Ambiente: ${ENV_LABEL[filters.env]}`,
        filters.period && `Período: ${filters.period}`,
    ].filter(Boolean);
    doc.moveDown(0.3).font('N').fontSize(10).fillColor(GRAY)
        .text(tags.length ? tags.join('  ·  ') : 'Todas as cenas', { width: COL.w });
    doc.text(`${plural(scenes.length, 'cena', 'cenas')} · ${plural(groups.length, 'locação', 'locações')}`, { width: COL.w });
    doc.text(`Cenas: ${scenes.map((s) => s.number).join(', ')}`, { width: COL.w });
    if (hasGuess) doc.moveDown(0.3).font('I').fontSize(8).text('? = nome em maiúsculas na ação que não fala em nenhuma cena do roteiro (pode ser personagem mudo, objeto ou ênfase: confira).', { width: COL.w });
    doc.moveDown(0.8).fillColor('#000').fontSize(SIZE);

    groups.forEach((g, gi) => {
        curScene = '';
        if (gi > 0) doc.addPage();
        curLoc = g.location;
        pageLoc[pageLoc.length - 1] = curLoc;
        if (gi === 0 && doc.y > PAGE.top + 120) need(doc, 160);
        const envs = [...new Set(g.scenes.map((s) => ENV_LABEL[s.env]))].join(' / ');
        doc.font('B').fontSize(16).text(g.location || '(sem locação)', PAGE.left, doc.y, { width: COL.w });
        doc.font('N').fontSize(10).fillColor(GRAY).text(`${envs}  ·  ${plural(g.scenes.length, 'cena', 'cenas')}`, { width: COL.w });
        doc.fillColor('#000').moveDown(0.6);

        for (const [period, list] of periodGroups(g.scenes)) {
            need(doc, 130);
            const y = doc.y;
            doc.font('B').fontSize(10).fillColor('#000').text(`PERÍODO: ${period}  (${plural(list.length, 'cena', 'cenas')}: ${list.map((s) => s.number).join(', ')})`, PAGE.left, y, { width: COL.w });
            doc.moveTo(PAGE.left, doc.y + 2).lineTo(PAGE.w - PAGE.right, doc.y + 2).lineWidth(1).strokeColor('#000').stroke();
            doc.y += 10;
            for (const sc of list) {
                curScene = sc.number;
                sceneBand(doc, sc);
                if (!pageScenes.at(-1).includes(sc.number)) pageScenes.at(-1).push(sc.number);
                const c = castOf ? castOf(sc) : { speaking: speakingCharacters(sc), silent: [] };
                const parts = [];
                if (c.speaking.length) parts.push(`Com fala: ${c.speaking.join(', ')}`);
                if (c.silent.length) parts.push(`Sem fala: ${c.silent.map((n) => n.name + (n.known ? '' : '?')).join(', ')}`);
                if (parts.length) {
                    doc.font('I').fontSize(9).fillColor(GRAY).text(parts.join('   ·   '), PAGE.left, doc.y, { width: COL.w });
                    doc.moveDown(0.5);
                }
                doc.fillColor('#000').fontSize(SIZE);
                sceneBody(doc, sceneBlocks(sc));
                doc.moveDown(0.8);
            }
        }
    });

    const title = (docName || 'Roteiro').toUpperCase();
    const { pages } = finishDoc(doc, {
        headerFor: (i) => `${title}  ·  ORDEM DE FILMAGEM${pageLoc[i] ? '  ·  ' + pageLoc[i] : ''}${pageScenes[i].length ? '  ·  ' + (pageScenes[i].length > 1 ? 'CENAS ' : 'CENA ') + pageScenes[i].join(', ') : ''}`,
        footerLeft: `Fountain Studio · gerado em ${new Date().toLocaleDateString('pt-BR')}`,
    });
    return { blob: await doc.done, pages };
}

/* ───────── folha individual de falas ───────── */

const extensionOf = (label) => (label.match(/\(.*\)/) ?? [''])[0];

/**
 * Folha de falas de um personagem, para o ator.
 * @param character item de characterSheets(); as cenas já vêm na ordem narrativa original.
 * Cada cena traz o número e o cabeçalho originais; só as falas do personagem são impressas.
 */
export async function makeCharacterSheet({ character, docName }) {
    const doc = await newDoc();
    const pageScenes = [[]];
    let curScene = '';
    doc.on('pageAdded', () => pageScenes.push(curScene ? [curScene] : []));
    const SP = 12, X = PAGE.left + 14, W = COL.w - 14;

    /* título: nome do personagem em destaque */
    doc.font('N').fontSize(9).fillColor(GRAY).text('FOLHA DE FALAS', PAGE.left, PAGE.top, { characterSpacing: 2 });
    doc.font('B').fontSize(28).fillColor('#000').text(character.name, { width: COL.w });
    doc.moveDown(0.2).font('N').fontSize(10).fillColor(GRAY)
        .text(`${docName || 'Roteiro'}`, { width: COL.w });
    doc.text(`${plural(character.speeches, 'fala', 'falas')} · ${plural(character.scenes.length, 'cena', 'cenas')}  —  cenas: ${character.scenes.map((e) => e.scene.number).join(', ')}`, { width: COL.w });
    doc.moveDown(0.8).fillColor('#000');

    for (const { scene, speeches } of character.scenes) {
        curScene = scene.number;
        sceneBand(doc, scene, { keep: 60 });
        if (!pageScenes.at(-1).includes(scene.number)) pageScenes.at(-1).push(scene.number);
        for (const sp of speeches) {
            const ext = extensionOf(sp.label);
            const h = sp.parts.reduce((n, t) => n + textHeight(doc, t, W, SP) + 4, ext ? 12 : 0);
            need(doc, Math.min(h, 70));
            if (ext) doc.font('I').fontSize(9).fillColor(GRAY).text(ext, X, doc.y, { width: W });
            doc.font('N').fontSize(SP).fillColor('#000');
            for (const t of sp.parts) { inline(doc, t, X, W); doc.moveDown(0.25); }
            doc.moveDown(0.5);
        }
        /* separação visual entre cenas */
        doc.moveDown(0.4);
        const y = doc.y;
        if (y < PAGE.h - PAGE.bottom - 10) doc.moveTo(PAGE.left, y).lineTo(PAGE.w - PAGE.right, y).lineWidth(0.5).strokeColor('#cccccc').stroke();
        doc.y = y + 12;
        doc.fillColor('#000').fontSize(SIZE);
    }

    const title = (docName || 'Roteiro').toUpperCase();
    const { pages } = finishDoc(doc, {
        headerFor: (i) => `${title}  ·  FALAS DE ${character.name}${pageScenes[i].length ? '  ·  ' + (pageScenes[i].length > 1 ? 'CENAS ' : 'CENA ') + pageScenes[i].join(', ') : ''}`,
        footerLeft: `Fountain Studio · gerado em ${new Date().toLocaleDateString('pt-BR')}`,
    });
    return { blob: await doc.done, pages };
}
