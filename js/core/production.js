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
