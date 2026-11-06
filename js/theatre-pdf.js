/*
 * PDF em formato de TEATRO.
 * Mesmo roteiro Fountain, outro layout: o diálogo ocupa a largura da página, o nome do personagem vai na
 * mesma linha da fala ("NARRADOR – texto…"), a ação (didascália) fica em itálico e quase não há espaço perdido.
 * Lê os tokens do parser sem alterar o roteiro. Notas, sinopses e letras dentro de boneyard (comentário em bloco) não são impressas.
 */
import { parse } from './core/parser.js';
import { loadPdfEngine } from './pdf-export.js';
import { getFonts } from './core/fonts.js';
import { inlineSegments, stripInline } from './production-pdf.js';

const SIZES = { a4: [595.28, 841.89], usletter: [612, 792] };
const FS = 11.5, GAP = 2.5, GRAY = '#666666', MARK = '#fff3a3';
const SWAP = { N: 'I', I: 'N', B: 'BI', BI: 'B' }; // dentro de itálico, o destaque vira "normal"

const noNotes = (s) => String(s ?? '').replace(/\[\[[\s\S]*?\]\]/g, '').trim();
const baseName = (label) => label.replace(/\(.*\)/, '').replace(/\s+/g, ' ').trim();
const cleanLabel = (t) => noNotes(t).replace(/^\s*@/, '').replace(/\s*\^\s*$/, '').replace(/\*+/g, '').replace(/\s+/g, ' ').trim();

/** Tokens → blocos simples, na ordem do roteiro. */
function toBlocks(tokens) {
    const blocks = [];
    let cur = null;
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.ignore) continue;
        const text = noNotes(t.text);
        switch (t.type) {
            case 'scene_heading': {
                cur = null;
                let j = i + 1;
                while (tokens[j]?.type === 'separator') j++;
                let sub = '';
                if (tokens[j]?.type === 'section') { sub = noNotes(tokens[j].text); i = j; } // "CENA 1" + "## TÍTULO" viram uma linha só
                blocks.push({ kind: 'scene', label: text, sub });
                break;
            }
            case 'section': cur = null; blocks.push({ kind: 'section', text, depth: t.level ?? t.depth ?? 1 }); break;
            case 'action': case 'centered': case 'transition': cur = null; if (text) blocks.push({ kind: t.type, text }); break;
            case 'page_break': cur = null; blocks.push({ kind: 'page' }); break;
            case 'character':
                cur = { kind: 'speech', label: cleanLabel(t.text), dual: t.dual || '', lead: '', paras: [], pending: '' };
                blocks.push(cur);
                break;
            case 'parenthetical':
                if (!cur || !text) break;
                if (!cur.paras.length) cur.lead = text; else cur.pending = cur.pending ? cur.pending + ' ' + text : text;
                break;
            case 'dialogue':
                if (!cur || !text) break;
                cur.paras.push(cur.pending ? { paren: cur.pending, text } : { text });
                cur.pending = '';
                break;
            default: break; // separadores, sinopses, marcadores de diálogo…
        }
    }
    for (const b of blocks) if (b.kind === 'speech' && b.pending) b.paras.push({ paren: b.pending, text: '' });
    /* fala simultânea (2º LEITOR ^): junta quando o texto é igual; senão avisa em cada uma */
    const out = [];
    for (let i = 0; i < blocks.length; i++) {
        const a = blocks[i], b = blocks[i + 1];
        if (a.kind === 'speech' && a.dual === 'left' && b?.kind === 'speech' && b.dual === 'right') {
            const same = a.paras.map((p) => p.text).join('\n') === b.paras.map((p) => p.text).join('\n');
            if (same) out.push({ ...a, dual: '', label: `${a.label} E ${b.label} (JUNTOS)` });
            else { out.push({ ...a, lead: a.lead || '(ao mesmo tempo)' }, { ...b, lead: b.lead || '(ao mesmo tempo)' }); }
            i++;
        } else out.push(a);
    }
    return out;
}

export async function makeTheatrePdf(text, cfg, highlighted = [], docName = '') {
    await loadPdfEngine();
    const parsed = parse(text, { ...cfg, use_dual_dialogue: true, print_notes: false }, false);
    const blocks = toBlocks(parsed.tokens);
    const [W, H] = SIZES[cfg.print_profile] ?? SIZES.a4;
    const M = { left: 62, right: 54, top: 62, bottom: 56 };
    const CW = W - M.left - M.right;

    const doc = new window.PDFDocument({ size: [W, H], bufferPages: true, margins: { ...M }, info: { Creator: 'Fountain Studio' } });
    const f = getFonts();
    doc.registerFont('N', f.normal); doc.registerFont('B', f.bold); doc.registerFont('I', f.italic); doc.registerFont('BI', f.boldItalic);
    const chunks = [];
    doc.on('data', (c) => chunks.push(c instanceof Uint8Array ? c : new Uint8Array(c)));
    const done = new Promise((ok, err) => { doc.on('end', () => ok(new Blob(chunks, { type: 'application/pdf' }))); doc.on('error', err); });

    const tp = parsed.title_page ?? {};
    const titleTok = (tp.cc ?? []).find((t) => t.type === 'title');
    const title = stripInline(String(titleTok?.text ?? docName ?? 'Roteiro')).replace(/\n/g, ' ').trim() || 'Roteiro';
    const pageScenes = [[]];
    let curScene = '';
    doc.on('pageAdded', () => pageScenes.push(curScene ? [curScene] : []));
    const room = () => H - M.bottom - doc.y;
    const need = (h) => { if (room() < h) doc.addPage(); };
    const hl = new Set(highlighted.map((n) => n.toUpperCase()));

    /* escreve trechos com formatação inline a partir de (x, y); `base` 'I' inverte negrito/itálico */
    const flow = (segs, x, y, width, { indent = 0, align = 'left', base = 'N', size = FS } = {}) => {
        const list = segs.filter((s) => s.t);
        list.forEach((s, i) => {
            doc.font(base === 'I' ? SWAP[s.f] ?? s.f : s.f).fontSize(size);
            const o = { width, lineGap: GAP, align, continued: i < list.length - 1 };
            if (i === 0) { o.indent = indent; doc.text(s.t, x, y, o); } else doc.text(s.t, o);
        });
        doc.font('N').fontSize(FS);
    };
    const seg = (t, f = 'N') => ({ t, f });

    /* ───── página de título ───── */
    const hasTitlePage = cfg.print_title_page !== false && ['tl', 'tc', 'tr', 'cc', 'bl', 'br'].some((k) => (tp[k] ?? []).length);
    if (hasTitlePage) {
        const items = (k) => (tp[k] ?? []).filter((t) => !['font', 'watermark', 'header', 'footer'].includes(t.type));
        const txt = (t) => stripInline(noNotes(t.text));
        const cc = items('cc');
        let y = H * 0.32;
        for (const t of cc) {
            const isTitle = t.type === 'title';
            doc.font(isTitle ? 'B' : 'N').fontSize(isTitle ? 26 : 13).fillColor('#000');
            doc.text(isTitle ? txt(t).toUpperCase() : txt(t), M.left, y, { width: CW, align: 'center' });
            y = doc.y + (isTitle ? 14 : 8);
        }
        const corner = (k, x, yy, align) => {
            const list = items(k).map(txt).filter(Boolean);
            if (!list.length) return;
            doc.font('N').fontSize(10).fillColor('#000').text(list.join('\n'), x, yy, { width: CW / 2, align, lineGap: 2 });
        };
        corner('tl', M.left, M.top, 'left'); corner('tr', M.left + CW / 2, M.top, 'right');
        corner('tc', M.left + CW / 4, M.top, 'center');
        const bottomY = (k) => H - M.bottom - 20 - doc.heightOfString(items(k).map(txt).join('\n') || ' ', { width: CW / 2, lineGap: 2 });
        corner('bl', M.left, bottomY('bl'), 'left'); corner('br', M.left + CW / 2, bottomY('br'), 'right');
        doc.addPage();
    }
    const bodyStart = hasTitlePage ? 1 : 0;

    /* ───── elenco ───── */
    const cast = [];
    for (const b of blocks) if (b.kind === 'speech') {
        const n = baseName(b.label);
        if (!/ E .* \(JUNTOS\)$/.test(b.label) && n && !cast.includes(n)) cast.push(n);
    }
    if (cast.length) {
        doc.font('B').fontSize(10).fillColor(GRAY).text('PERSONAGENS', M.left, doc.y, { characterSpacing: 2 });
        doc.font('N').fontSize(FS).fillColor('#000').text(cast.join('  ·  '), { width: CW, lineGap: GAP });
        const y = doc.y + 6;
        doc.moveTo(M.left, y).lineTo(W - M.right, y).lineWidth(0.5).strokeColor('#bbbbbb').stroke();
        doc.y = y + 14;
    }

    /* ───── corpo ───── */
    let firstScene = true;
    const lh = () => doc.font('N').fontSize(FS).currentLineHeight(true) + GAP;
    for (const b of blocks) {
        doc.font('N').fontSize(FS).fillColor('#000');
        if (b.kind === 'scene') {
            const label = [b.label, b.sub].filter(Boolean).join(' – ').toUpperCase();
            if (!firstScene) doc.moveDown(1.1);
            firstScene = false;
            curScene = ''; // se a cena abrir página nova, a anterior não aparece no cabeçalho dela
            need(lh() * 5);
            curScene = b.label.toUpperCase();
            if (!pageScenes.at(-1).includes(curScene)) pageScenes.at(-1).push(curScene);
            if (cfg.create_bookmarks !== false) { try { doc.outline.addItem(label); } catch { /* sem bookmark */ } }
            doc.font('B').fontSize(13).text(label, M.left, doc.y, { width: CW, lineGap: GAP });
            const y = doc.y + 2;
            doc.moveTo(M.left, y).lineTo(W - M.right, y).lineWidth(0.8).strokeColor('#000').stroke();
            doc.y = y + 9;
        } else if (b.kind === 'section') {
            need(lh() * 4);
            doc.moveDown(0.6);
            if (cfg.create_bookmarks !== false) { try { doc.outline.addItem(b.text); } catch { /* sem bookmark */ } }
            doc.font('B').fontSize(b.depth <= 1 ? 15 : 12).text(b.text.toUpperCase(), M.left, doc.y, { width: CW, align: b.depth <= 1 ? 'center' : 'left' });
            doc.moveDown(0.6);
        } else if (b.kind === 'action') {
            need(lh() * 2);
            flow(inlineSegments(b.text), M.left, doc.y, CW, { base: 'I' });
            doc.moveDown(0.6);
        } else if (b.kind === 'centered') {
            need(lh() * 2);
            doc.moveDown(0.4);
            flow(inlineSegments(b.text).map((s) => ({ ...s, f: 'B' })), M.left, doc.y, CW, { align: 'center' });
            doc.moveDown(0.8);
        } else if (b.kind === 'transition') {
            need(lh() * 2);
            flow(inlineSegments(b.text), M.left, doc.y, CW, { align: 'right', base: 'I' });
            doc.moveDown(0.6);
        } else if (b.kind === 'page') {
            doc.addPage();
        } else if (b.kind === 'speech') {
            const head = [seg(b.label, 'B')];
            if (b.lead) head.push(seg(' ' + b.lead, 'I'));
            const first = b.paras[0];
            const firstSegs = first ? [...(first.paren ? [seg(first.paren + ' ', 'I')] : []), ...inlineSegments(first.text)] : [];
            const sep = first ? [seg(' – ')] : [];
            /* altura aproximada da fala toda (para o destaque e para não deixar o nome sozinho no fim da página) */
            const para = (p, ind) => doc.font('N').fontSize(FS).heightOfString(stripInline((p.paren ? p.paren + ' ' : '') + p.text), { width: CW, lineGap: GAP, indent: ind });
            const headTxt = b.label + (b.lead ? ' ' + b.lead : '') + (first ? ' – ' : '');
            const h = (first ? doc.heightOfString(headTxt + stripInline((first.paren ? first.paren + ' ' : '') + first.text), { width: CW, lineGap: GAP }) : lh())
                + b.paras.slice(1).reduce((n, p) => n + para(p, 16) + 0.3 * lh(), 0);
            const marked = hl.has(baseName(b.label).toUpperCase()) || [...hl].some((n) => b.label.toUpperCase().includes(n) && /JUNTOS/.test(b.label));
            if (marked && h <= H - M.top - M.bottom) need(h + 6); else need(Math.min(h, lh() * 3));
            const y0 = doc.y;
            if (marked && h <= H - M.top - M.bottom) { doc.rect(M.left - 4, y0 - 2, CW + 8, h + 4).fill(MARK); doc.fillColor('#000'); }
            flow([...head, ...sep, ...firstSegs], M.left, y0, CW);
            for (const p of b.paras.slice(1)) {
                doc.moveDown(0.3);
                flow([...(p.paren ? [seg(p.paren + ' ', 'I')] : []), ...inlineSegments(p.text)], M.left, doc.y, CW, { indent: 16 });
            }
            doc.moveDown(0.55);
        }
    }

    /* ───── cabeçalho, rodapé, marca d'água ───── */
    const { count } = doc.bufferedPageRange();
    for (let i = 0; i < count; i++) {
        doc.switchToPage(i);
        const m = doc.page.margins, saved = { ...m };
        m.top = m.bottom = 0; // escrever nas margens não pode disparar nova página
        if (cfg.print_watermark) {
            doc.save().rotate(-45, { origin: [W / 2, H / 2] }).fillOpacity(0.07).fillColor('#000').font('B').fontSize(80)
                .text(cfg.print_watermark, 0, H / 2 - 40, { width: W, align: 'center', lineBreak: false }).restore();
        }
        if (i >= bodyStart) {
            doc.font('N').fontSize(8).fillColor(GRAY);
            const head = cfg.print_header || `${title.toUpperCase()}${pageScenes[i]?.length ? '  ·  ' + pageScenes[i].join(' / ') : ''}`;
            doc.text(head, M.left, 28, { width: CW, lineBreak: false, ellipsis: true });
            doc.moveTo(M.left, 42).lineTo(W - M.right, 42).lineWidth(0.5).strokeColor('#bbbbbb').stroke();
            if (cfg.print_footer) doc.text(cfg.print_footer, M.left, H - 36, { width: CW, lineBreak: false, align: 'left' });
            if (cfg.show_page_numbers !== false) doc.text(`${i + 1 - bodyStart} / ${count - bodyStart}`, M.left, H - 36, { width: CW, lineBreak: false, align: 'right' });
        }
        Object.assign(m, saved);
    }
    doc.flushPages();
    doc.end();
    return { blob: await done, pages: count };
}
