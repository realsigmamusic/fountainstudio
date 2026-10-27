import { EditorState, StateField, StateEffect, RangeSetBuilder } from './vendor/codemirror.js';
import { EditorView, Decoration, keymap, highlightActiveLine, drawSelection, placeholder } from './vendor/codemirror.js';
import { defaultKeymap, history, historyKeymap } from './vendor/codemirror.js';
import { foldService, foldGutter, foldKeymap, codeFolding, foldEffect, unfoldEffect, foldedRanges } from './vendor/codemirror.js';
import { autocompletion, startCompletion } from './vendor/codemirror.js';
import { searchKeymap } from './vendor/codemirror.js';
const empty = () => ({ lineClass: new Map(), headings: [], characters: [], locations: [], times: [] });
const SCENE_LEVEL = 99;
const CLS = {
    scene_heading: 'f-scene', character: 'f-character', parenthetical: 'f-paren', dialogue: 'f-dialogue',
    transition: 'f-trans', synopsis: 'f-synopsis', centered: 'f-centered', lyrics: 'f-lyrics', shot: 'f-shot',
};
export function summarize(parsed) {
    const s = empty();
    const seen = new Set();
    for (const t of parsed.tokens) {
        const n = (t.text?.match(/\n/g)?.length ?? 0);
        let cls = CLS[t.type];
        if (t.type === 'section') {
            cls = 'f-section';
            s.headings.push({ line: t.line, level: t.level ?? 1 });
        }
        else if (t.type === 'scene_heading')
            s.headings.push({ line: t.line, level: SCENE_LEVEL });
        if (cls)
            for (let i = 0; i <= n; i++)
                s.lineClass.set(t.line + i, cls);
    }
    const toks = parsed.tokens;
    for (let i = toks.length - 1; i >= 0; i--) { // recência: último a falar primeiro
        if (toks[i].type !== 'character')
            continue;
        const name = String(toks[i].text).replace(/\s*\(.*\)\s*\^?$/, '').replace(/^@/, '').replace(/\^$/, '').trim();
        if (name && !seen.has(name)) {
            seen.add(name);
            s.characters.push(name);
        }
    }
    const locs = new Set(), times = new Set();
    for (const arr of parsed.properties.locations.values())
        for (const l of arr) {
            if (l.name)
                locs.add(l.name.toUpperCase());
            if (l.time_of_day)
                times.add(l.time_of_day.toUpperCase());
        }
    s.locations = [...locs].sort();
    s.times = [...times].sort();
    return s;
}
/* ───────────── estado: resumo + decorações ───────────── */
export const setSummary = StateEffect.define();
const deco = (c) => Decoration.line({ class: c });
const noteMark = Decoration.mark({ class: 'f-note' });
function build(state, sum) {
    const b = new RangeSetBuilder();
    const doc = state.doc;
    for (let n = 1; n <= doc.lines; n++) {
        const line = doc.line(n);
        const cls = sum.lineClass.get(n - 1);
        if (cls)
            b.add(line.from, line.from, deco(cls));
    }
    return b.finish();
}
const summaryField = StateField.define({
    create: () => ({ sum: empty(), deco: Decoration.none }),
    update(v, tr) {
        for (const e of tr.effects)
            if (e.is(setSummary))
                return { sum: e.value, deco: build(tr.state, e.value) };
        return tr.docChanged ? { sum: v.sum, deco: v.deco.map(tr.changes) } : v;
    },
    provide: f => EditorView.decorations.from(f, v => v.deco),
});
/* notas [[...]] e boneyard à parte (inline) */
const inlineNotes = EditorView.decorations.compute(['doc'], state => {
    const b = new RangeSetBuilder();
    const re = /\[\[[\s\S]*?\]\]|\/\*[\s\S]*?\*\//g;
    const text = state.doc.toString();
    let m;
    while ((m = re.exec(text)))
        b.add(m.index, m.index + m[0].length, noteMark);
    return b.finish();
});
/* ───────────── folding (cenas e seções) ───────────── */
const folding = foldService.of((state, lineStart) => {
    const { sum } = state.field(summaryField);
    const ln = state.doc.lineAt(lineStart).number - 1;
    const i = sum.headings.findIndex(h => h.line === ln);
    if (i < 0)
        return null;
    const lv = sum.headings[i].level;
    const next = sum.headings.slice(i + 1).find(h => h.level <= lv);
    let endLine = (next ? next.line : state.doc.lines); // 1-based: linha anterior ao próximo heading
    endLine = Math.min(endLine, state.doc.lines);
    while (endLine > ln + 1 && !state.doc.line(endLine).text.trim())
        endLine--;
    if (endLine <= ln + 1)
        return null;
    return { from: state.doc.line(ln + 1).to, to: state.doc.line(endLine).to };
});
export function foldAll(view) {
    const { sum } = view.state.field(summaryField);
    const doc = view.state.doc;
    const eff = [];
    for (const h of sum.headings) {
        if (h.level !== SCENE_LEVEL)
            continue;
        const nxt = sum.headings.find(x => x.line > h.line);
        let end = Math.min(nxt ? nxt.line : doc.lines, doc.lines);
        while (end > h.line + 1 && !doc.line(end).text.trim())
            end--;
        if (end > h.line + 1)
            eff.push(foldEffect.of({ from: doc.line(h.line + 1).to, to: doc.line(end).to }));
    }
    view.dispatch({ effects: eff });
}
export function unfoldAll(view) {
    const eff = [];
    const it = foldedRanges(view.state).iter();
    for (; it.value; it.next())
        eff.push(unfoldEffect.of({ from: it.from, to: it.to }));
    view.dispatch({ effects: eff });
}
/* ───────────── autocomplete ───────────── */
const SCENE_PREFIX = /^(INT\.\/EXT\.|INT\/EXT\.|INT\.|EXT\.|EST\.|I\/E\.?)\s*/i;
const PREFIXES = ['INT. ', 'EXT. ', 'INT./EXT. ', 'EST. '];
const TITLE_KEYS = ['Title:', 'Credit:', 'Author:', 'Source:', 'Draft date:', 'Date:', 'Contact:', 'Copyright:', 'Notes:', 'Font:', 'Watermark:', 'Header:', 'Footer:'];
const TRANSITIONS = ['CUT TO:', 'FADE OUT.', 'FADE IN:', 'DISSOLVE TO:', 'SMASH CUT TO:', 'MATCH CUT TO:', 'BACK TO:'];
const DEFAULT_TIMES = ['DAY', 'NIGHT', 'MORNING', 'EVENING', 'DUSK', 'DAWN', 'LATER', 'CONTINUOUS', 'MOMENTS LATER', 'SAME'];
function source(ctx) {
    const { sum } = ctx.state.field(summaryField);
    const line = ctx.state.doc.lineAt(ctx.pos);
    const before = line.text.slice(0, ctx.pos - line.from);
    const prevBlank = line.number === 1 || !ctx.state.doc.line(line.number - 1).text.trim();
    const mk = (labels, extra) => labels.map((label, i) => ({ label, type: 'text', ...(extra ? extra(label, i) : {}) }));
    // 1) título: chaves da página de título nas primeiras linhas, antes de qualquer cena
    if (line.number <= 12 && /^[A-Za-z ]*$/.test(before) && before.length > 0 && !sum.headings.some(h => h.line + 1 < line.number)) {
        const inTitle = line.number === 1 || /^[A-Za-z ]+:/.test(ctx.state.doc.line(1).text);
        if (inTitle)
            return { from: line.from, options: mk(TITLE_KEYS, () => ({ type: 'keyword' })), validFor: /^[A-Za-z ]*$/ };
    }
    // 2) cabeçalho de cena: tempo do dia (depois do " - ")
    const sm = before.match(SCENE_PREFIX);
    if (sm) {
        const rest = before.slice(sm[0].length);
        const dash = rest.search(/\s[-–—]\s/);
        if (dash >= 0) {
            const from = ctx.pos - (rest.length - dash - 3);
            const times = [...new Set([...sum.times, ...DEFAULT_TIMES])];
            return { from, options: mk(times, () => ({ type: 'constant' })), validFor: /^[\wÀ-ÿ' ]*$/ };
        }
        // 3) cabeçalho de cena: locais já usados
        return {
            from: ctx.pos - rest.length, validFor: /^[^-–—]*$/,
            options: sum.locations.map((l, i) => ({
                label: l, type: 'namespace', boost: -i,
                apply: (view, _c, from, to) => {
                    view.dispatch({ changes: { from, to, insert: l + ' - ' }, selection: { anchor: from + l.length + 3 } });
                    startCompletion(view);
                },
            })),
        };
    }
    // 4) início de linha após linha vazia: prefixos de cena, personagens, transições
    if (prevBlank && /^[@A-ZÀ-Ý0-9.\/' ()-]*$/i.test(before) && before.length > 0) {
        const typed = before.replace(/^@/, '');
        const up = typed === typed.toUpperCase();
        const opts = [];
        if (up) {
            opts.push(...PREFIXES.map(p => ({ label: p, type: 'keyword', boost: 50 })));
            opts.push(...sum.characters.map((c, i) => ({
                label: c, type: 'variable', boost: Math.max(-99, 40 - i), detail: i === 0 ? 'último a falar' : undefined,
                apply: (view, _c, from, to) => view.dispatch({ changes: { from, to, insert: c + '\n' }, selection: { anchor: from + c.length + 1 } }),
            })));
            opts.push(...TRANSITIONS.map(t => ({ label: t, type: 'function', boost: -50 })));
        }
        if (opts.length)
            return { from: line.from + (before.startsWith('@') ? 1 : 0), options: opts, validFor: /^[A-Za-zÀ-ÿ0-9.\/' ()-]*$/ };
    }
    return null;
}
export function createEditor(parent, doc, hooks) {
    const ext = [
        history(), drawSelection(), highlightActiveLine(), EditorView.lineWrapping,
        codeFolding(), foldGutter(),
        summaryField, inlineNotes, folding,
        autocompletion({ override: [source], activateOnTyping: true, icons: false }),
        keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap, ...searchKeymap]),
        placeholder('Escreva em Fountain…'),
        EditorView.updateListener.of(u => {
            if (u.docChanged)
                hooks.onChange();
            if (u.selectionSet || u.docChanged)
                hooks.onCursor(u.state.doc.lineAt(u.state.selection.main.head).number - 1);
        }),
    ];
    const view = new EditorView({ parent, state: EditorState.create({ doc, extensions: ext }) });
    return {
        view,
        setSummary: s => view.dispatch({ effects: setSummary.of(s) }),
        goToLine(l0) {
            const ln = view.state.doc.line(Math.min(Math.max(l0, 0), view.state.doc.lines - 1) + 1);
            view.dispatch({ selection: { anchor: ln.from }, effects: EditorView.scrollIntoView(ln.from, { y: 'start', yMargin: 40 }) });
            view.focus();
        },
        currentLine: () => view.state.doc.lineAt(view.state.selection.main.head).number - 1,
        getText: () => view.state.doc.toString(),
        setText: t => view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: t } }),
    };
}
