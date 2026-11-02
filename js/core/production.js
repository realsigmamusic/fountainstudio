/*
 * Produção — extração das informações das cenas.
 *
 * Usa apenas os tokens que o parser Fountain já produziu (nada de sintaxe nova,
 * nada de reparse do texto) e NÃO modifica o roteiro nem os tokens.
 * Os dados de produção vivem aqui, separados do texto original.
 */

export const ENV_LABEL = { int: 'INT.', ext: 'EXT.', mixed: 'INT./EXT.', other: 'Outro' };

/* os mistos (INT./EXT., EXT./INT., I/E) vêm antes de INT. e EXT. para não serem engolidos por eles */
const ENV_RE = /^(INT\.?\s*\/\s*EXT\.?|EXT\.?\s*\/\s*INT\.?|I\s*\/\s*E\.?|INT\.?|EXT\.?|EST\.?)(?=[\s.]|$)/i;
/* separa localização e período no ÚLTIMO traço (hífen, en dash, em dash ou sinal de menos) */
const SPLIT_RE = /^(.*\S)\s+[-–—−]+\s*(\S.*)?$/;

const clean = (s) => s.replace(/^[*_\s]+|[*_\s]+$/g, '').replace(/\s+/g, ' ').trim();

function envOf(prefix) {
    const p = prefix.toUpperCase().replace(/\s+/g, '');
    if (p.includes('/')) return 'mixed'; // INT./EXT., EXT./INT., I/E
    if (p.startsWith('INT')) return 'int';
    if (p.startsWith('EXT')) return 'ext';
    return 'other'; // EST. e cabeçalhos forçados com ponto
}

/** Decompõe um cabeçalho de cena já limpo (ex.: "INT. SALA - DAY"). */
export function parseHeading(text) {
    let rest = clean(String(text ?? '')).toUpperCase();
    let env = 'other';
    const m = rest.match(ENV_RE);
    if (m) {
        env = envOf(m[1]);
        rest = rest.slice(m[0].length).replace(/^[\s.]+/, '');
    }
    let location = rest, period = '';
    const s = rest.match(SPLIT_RE);
    if (s) {
        location = s[1];
        period = s[2] ?? '';
    }
    return { env, location: clean(location), period: clean(period) };
}

/**
 * Extrai as cenas na ordem original do roteiro.
 * Cada cena guarda o intervalo de tokens [tokenStart, tokenEnd) para que as
 * próximas funcionalidades (documentos, falas, personagens) leiam o conteúdo
 * direto do parser, sem recortar texto.
 *
 * @param parsed resultado de parse()
 * @returns {Array<{index:number, number:string, heading:string, env:string,
 *   location:string, period:string, line:number, tokenStart:number, tokenEnd:number}>}
 */
export function extractScenes(parsed) {
    const tokens = parsed?.tokens ?? [];
    const scenes = [];
    for (let i = 0; i < tokens.length; i++) {
        const t = tokens[i];
        if (t.type !== 'scene_heading') continue;
        const heading = clean(String(t.text ?? '')).toUpperCase();
        scenes.push({
            index: scenes.length,
            number: String(t.number ?? scenes.length + 1), // numeração original (inclui "1A", "12B"...)
            heading,
            original: String(t.text ?? '').trim(), // cabeçalho como o parser o entregou (sem normalizar)
            ...parseHeading(heading),
            line: t.line,
            tokenStart: i,
            tokenEnd: tokens.length,
        });
    }
    for (let k = 0; k < scenes.length - 1; k++) scenes[k].tokenEnd = scenes[k + 1].tokenStart;
    // referência (somente leitura) aos tokens de cada cena; nada é copiado nem alterado
    for (const sc of scenes) sc.tokens = tokens.slice(sc.tokenStart, sc.tokenEnd);
    return scenes;
}

/* ───────── filtros e agrupamentos ─────────
 * Funções puras: devolvem novas listas e nunca alteram `scenes` (a ordem do roteiro é preservada;
 * dentro de qualquer filtro ou grupo as cenas continuam na ordem narrativa original). */

export const ALL = '';              // valor "sem filtro"
export const NO_PERIOD = '—';       // rótulo para cenas sem período no cabeçalho

const periodKey = (sc) => sc.period || NO_PERIOD;

/** Aplica filtros combinados (E lógico). Campo vazio/ausente = não filtra. */
export function filterScenes(scenes, { env = ALL, location = ALL, period = ALL } = {}) {
    return scenes.filter((sc) =>
        (!env || sc.env === env) &&
        (!location || sc.location === location) &&
        (!period || periodKey(sc) === period));
}

/**
 * Valores disponíveis para cada filtro, com a contagem de cenas.
 * Cada faceta é calculada aplicando os OUTROS filtros, assim as opções
 * mostradas sempre levam a pelo menos uma cena (sem combinações vazias).
 */
export function facets(scenes, filters = {}) {
    const count = (key, pick) => {
        const others = { ...filters, [key]: ALL };
        const map = new Map();
        for (const sc of filterScenes(scenes, others)) {
            const v = pick(sc);
            map.set(v, (map.get(v) ?? 0) + 1);
        }
        return map;
    };
    const sorted = (map) => [...map].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR'));
    return {
        env: count('env', (s) => s.env),
        location: sorted(count('location', (s) => s.location)),
        period: sorted(count('period', periodKey)),
    };
}

/**
 * Agrupa por localização (e, dentro dela, por período), na ordem de primeira
 * aparição no roteiro. Ex.: todas as cenas de "SALA" juntas, DAY antes de NIGHT
 * conforme aparecem. Resultado: [{ location, scenes:[...] }].
 */
export function groupByLocation(scenes) {
    const groups = new Map();
    for (const sc of scenes) {
        if (!groups.has(sc.location)) groups.set(sc.location, []);
        groups.get(sc.location).push(sc);
    }
    return [...groups].map(([location, list]) => ({ location, scenes: list }));
}

/* ───────── conteúdo da cena (lido dos tokens do parser) ───────── */

const SKIP = new Set(['separator', 'section', 'page_break', 'dual_dialogue_begin', 'dual_dialogue_end', 'dialogue_begin', 'dialogue_end']);

/** Nome canônico do personagem: sem extensão "(V.O.)", sem "@" de personagem forçado, sem "^" de diálogo duplo e sem asteriscos de formatação. */
export function characterName(text) {
    return String(text ?? '').replace(/\(.*\)/, '').replace(/^\s*@/, '').replace(/\^/g, '').replace(/\*+/g, '').replace(/\s+/g, ' ').trim();
}

/**
 * Converte os tokens de uma cena em blocos simples, na ordem do roteiro:
 *  { kind:'action'|'transition'|'centered', text, forced } — forced: ação forçada com "!" no Fountain
 *  { kind:'dialogue', character, label, lines:[{type:'parenthetical'|'dialogue', text}] }
 * `label` é o texto do personagem como escrito (ex.: "MARIA (V.O.)"); `character` é o nome canônico.
 * Diálogos duplos viram blocos em sequência. Tokens ignorados pelo parser (ignore) são descartados.
 */
export function sceneBlocks(scene) {
    const blocks = [];
    let cur = null;
    for (const t of scene.tokens ?? []) {
        if (t.ignore || t.type === 'scene_heading' || SKIP.has(t.type)) continue;
        const text = String(t.text ?? '').trim();
        if (t.type === 'character') {
            cur = { kind: 'dialogue', character: characterName(text), label: text.replace(/^@/, '').replace(/\s*\^\s*$/, '').trim(), lines: [] };
            blocks.push(cur);
        } else if (t.type === 'parenthetical' || t.type === 'dialogue') {
            if (!cur || !text) continue;
            cur.lines.push({ type: t.type, text });
        } else if (t.type === 'action' || t.type === 'transition' || t.type === 'centered') {
            cur = null;
            if (text) blocks.push({ kind: t.type, text, forced: !!t.forced });
        }
    }
    return blocks;
}

/** Personagens com fala na cena, na ordem em que falam pela primeira vez. */
export function speakingCharacters(scene) {
    const seen = new Set();
    for (const b of sceneBlocks(scene)) if (b.kind === 'dialogue' && b.character) seen.add(b.character);
    return [...seen];
}

/* ───────── falas por personagem ───────── */

/**
 * Falas de cada personagem, agrupadas por cena, SEMPRE na ordem narrativa original do roteiro
 * (os filtros de produção não se aplicam aqui). "MARIA", "MARIA (V.O.)" e "MARIA (CONT'D)" são o mesmo personagem.
 * Rubricas (parentheticals) ficam de fora por enquanto: são uma melhoria futura opcional.
 *
 * @returns {Map<string, {name:string, speeches:number, scenes:Array<{scene:object,
 *   speeches:Array<{label:string, parts:string[]}>}>}>}  Map ordenado alfabeticamente (pt-BR)
 */
export function characterSheets(scenes) {
    const map = new Map();
    for (const scene of scenes) {
        for (const b of sceneBlocks(scene)) {
            if (b.kind !== 'dialogue' || !b.character) continue;
            const parts = b.lines.filter((l) => l.type === 'dialogue').map((l) => l.text);
            if (!parts.length) continue;
            let ch = map.get(b.character);
            if (!ch) map.set(b.character, ch = { name: b.character, speeches: 0, scenes: [] });
            let entry = ch.scenes.at(-1);
            if (!entry || entry.scene !== scene) ch.scenes.push(entry = { scene, speeches: [] });
            entry.speeches.push({ label: b.label, parts });
            ch.speeches++;
        }
    }
    return new Map([...map].sort((a, b) => a[0].localeCompare(b[0], 'pt-BR')));
}

/* ───────── personagens com e sem fala ─────────
 * Regras (especificação 3.2):
 *  - quem tem elemento de diálogo na cena participa COM fala (mesmo que também apareça nas ações);
 *  - nomes em MAIÚSCULAS em elementos de ação, sem diálogo naquela cena, participam SEM fala.
 * Nomes de personagens que falam em qualquer ponto do roteiro são reconhecidos com certeza (known:true).
 * Outras palavras em maiúsculas na ação (ex.: um personagem mudo) entram como candidatos (known:false),
 * pois também podem ser efeitos sonoros ou ênfase; a interface os marca com "?".
 */

/* palavras em maiúsculas que NÃO são personagens (transições, períodos, indicações técnicas, ênfases comuns) */
const NOT_CHARACTERS = new Set(`CUT TO FADE IN OUT DISSOLVE SMASH MATCH BACK INTERCUT FLASHBACK INSERT SUPER SUPERIMPOSE TITLE TITLES CARD
INT EXT EST DAY NIGHT DAWN DUSK MORNING EVENING LATER CONTINUOUS MOMENTS SAME CONT THE AND FOR WITH FROM INTO
SFX VFX FX POV ANGLE CLOSE WIDE SHOT PAN TILT ZOOM BEAT PAUSE SILENCE END
CORTA CORTE PARA FUSAO FUSÃO ESCURECE CLAREIA DIA NOITE MANHA MANHÃ TARDE AMANHECER ANOITECER DEPOIS CONTINUA CONTINUAÇÃO CONTÍNUO
BANG BOOM CRASH SPLASH BEEP KNOCK BUZZ RING TOC PUM BUM BAM
MESMO MESMA SEM COM POR UMA UNS UMAS DOS DAS NOS NAS AOS FIM TÍTULO TITULO LEGENDA SOM EFEITO IMAGEM PLANO CENA`.split(/\s+/));

const WORD = /[\p{Lu}][\p{Lu}'’\-]*/gu;
const BOUND = (name) => new RegExp(`(?<![\\p{L}\\p{N}])${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\p{L}\\p{N}])`, 'gu');

/**
 * Personagens que falam em QUALQUER ponto do roteiro: base para reconhecer quem é citado na ação.
 * Map: nome em MAIÚSCULAS (chave de comparação) → nome como escrito na primeira fala.
 * A chave é maiúscula porque na ação só maiúsculas contam; assim um cue forçado em caixa mista
 * ("@Deutrano") também é reconhecido quando a ação traz "DEUTRANO".
 */
export function knownCharacters(scenes) {
    const names = new Map();
    for (const sc of scenes) for (const n of speakingCharacters(sc)) {
        const key = n.toUpperCase();
        if (!names.has(key)) names.set(key, n);
    }
    return names;
}

/**
 * Elenco de uma cena: { speaking:[nome], silent:[{name, known}] }.
 * Ordem: por primeira fala / primeira aparição na ação. `known` = nomes que falam em outra parte do roteiro.
 */
export function sceneCast(scene, known) {
    const speaking = speakingCharacters(scene);
    const talk = new Set(speaking.map((n) => n.toUpperCase()));
    const silent = new Map();
    const places = scene.location ? scene.location.split(/[^\p{L}\p{N}]+/u) : [];
    const ordered = [...known.keys()].sort((a, b) => b.length - a.length); // nomes longos primeiro ("MARIA JOSE" antes de "MARIA")

    for (const b of sceneBlocks(scene)) {
        if (b.kind !== 'action') continue; // centralizado (> TEXTO <), transição e diálogo não são cogitados
        let text = ' ' + b.text + ' ';
        const hits = [];   // { at, name, known }
        const spans = [];  // trechos já reconhecidos como personagens conhecidos [início, fim)
        /* 1) personagens conhecidos (reconhecimento exato); o trecho achado é apagado para não ser recontado */
        for (const name of ordered) {
            text = text.replace(BOUND(name), (m, at) => {
                hits.push({ at, name: known.get(name), known: true });
                spans.push([at, at + m.length]);
                return ' '.repeat(m.length);
            });
        }
        /* 2) outras palavras em maiúsculas (candidatos); sequências viram um só nome ("DONA CLARA").
         *    Linha forçada com "!" é ação por decisão do autor: maiúsculas ali são estilo, não candidatos. */
        if (!b.forced) {
            const onlySpace = (from, to) => !/\S/.test(text.slice(from, to));
            let run = null; // { at, end, words }
            const flush = () => {
                if (run) {
                    // colado a um personagem conhecido ("MARIA JOSE"): é parte do nome, não outro personagem
                    const glued = spans.some(([s, e]) => (e <= run.at && onlySpace(e, run.at)) || (s >= run.end && onlySpace(run.end, s)));
                    if (!glued) hits.push({ at: run.at, name: run.words.join(' '), known: false });
                }
                run = null;
            };
            for (const m of text.matchAll(WORD)) {
                const w = m[0].replace(/^[-'’]+|[-'’]+$/g, '');
                const ok = w.length >= 3 && !NOT_CHARACTERS.has(w) && !places.includes(w) && /\p{Lu}{2}/u.test(w);
                if (run && !(ok && onlySpace(run.end, m.index))) flush(); // qualquer coisa entre as palavras encerra o nome
                if (!ok) continue;
                if (run) { run.words.push(w); run.end = m.index + m[0].length; }
                else run = { at: m.index, end: m.index + m[0].length, words: [w] };
            }
            flush();
        }
        for (const h of hits.sort((x, y) => x.at - y.at)) {
            if (talk.has(h.name.toUpperCase()) || silent.has(h.name)) continue;
            silent.set(h.name, { name: h.name, known: h.known });
        }
    }
    return { speaking, silent: [...silent.values()] };
}

/** Elenco de todas as cenas, no mesmo índice de `scenes`. */
export function productionCast(scenes) {
    const known = knownCharacters(scenes);
    return scenes.map((sc) => sceneCast(sc, known));
}

/* ───────── resumo geral da produção ───────── */

/**
 * Números gerais do roteiro inteiro (não dependem dos filtros).
 * @param cast resultado de productionCast(scenes)
 * @returns {{total:number, env:Array, period:Array, location:Array, characters:Array}}
 *   env/period/location: [{key, count}] — location e period por nº de cenas (maior primeiro), env na ordem INT., EXT., INT./EXT., Outro;
 *   characters: [{name, speaking, silent, guess}] — nº de cenas com fala e sem fala; guess=true se só aparece como candidato "?"
 */
export function summarizeProduction(scenes, cast) {
    const tally = (pick) => {
        const m = new Map();
        for (const sc of scenes) { const k = pick(sc); m.set(k, (m.get(k) ?? 0) + 1); }
        return m;
    };
    const byCount = (m) => [...m].map(([key, count]) => ({ key, count }))
        .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key, 'pt-BR'));
    const env = tally((s) => s.env);
    const chars = new Map();
    const get = (name) => chars.get(name) ?? chars.set(name, { name, speaking: 0, silent: 0, guess: true }).get(name);
    for (const c of cast) {
        for (const n of c.speaking) { const x = get(n); x.speaking++; x.guess = false; }
        for (const n of c.silent) { const x = get(n.name); x.silent++; if (n.known) x.guess = false; }
    }
    return {
        total: scenes.length,
        env: ['int', 'ext', 'mixed', 'other'].filter((k) => env.has(k)).map((key) => ({ key, count: env.get(key) })),
        period: byCount(tally(periodKey)),
        location: byCount(tally((s) => s.location)),
        characters: [...chars.values()].sort((a, b) => (b.speaking + b.silent) - (a.speaking + a.silent) || a.name.localeCompare(b.name, 'pt-BR')),
    };
}
