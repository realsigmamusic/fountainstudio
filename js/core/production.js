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
            ...parseHeading(heading),
            line: t.line,
            tokenStart: i,
            tokenEnd: tokens.length,
        });
    }
    for (let k = 0; k < scenes.length - 1; k++) scenes[k].tokenEnd = scenes[k + 1].tokenStart;
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
