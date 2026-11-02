import { ENV_LABEL } from './core/production.js';

/** Desenha a tabela de cenas da aba Produção. Somente leitura. */
export function renderProduction(scenes, onGoto) {
    const count = document.querySelector('#prodCount');
    const box = document.querySelector('#prodTable');
    count.textContent = scenes.length === 1 ? '1 cena' : `${scenes.length} cenas`;
    box.textContent = '';
    if (!scenes.length) {
        const p = document.createElement('div');
        p.className = 'prodEmpty';
        p.textContent = 'Nenhuma cena encontrada. Escreva um cabeçalho como “INT. SALA - DIA” no roteiro.';
        box.append(p);
        return;
    }
    const table = document.createElement('table');
    const head = table.createTHead().insertRow();
    for (const h of ['Cena', 'Ambiente', 'Localização', 'Período'])
        head.append(Object.assign(document.createElement('th'), { textContent: h }));
    const body = table.createTBody();
    for (const sc of scenes) {
        const tr = body.insertRow();
        tr.title = sc.heading;
        const cells = [[sc.number, 'num'], [ENV_LABEL[sc.env], ''], [sc.location, 'loc'], [sc.period || '—', '']];
        for (const [text, cls] of cells) {
            const td = tr.insertCell();
            td.textContent = text;
            if (cls) td.className = cls;
        }
        tr.onclick = () => onGoto(sc.line);
    }
    box.append(table);
}
