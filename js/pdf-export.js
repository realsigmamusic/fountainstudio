import { parse } from './core/parser.js';
import { GeneratePdf } from './core/pdf.js';
import { emptyExportConfig } from './core/config.js';
import { loadFonts } from './core/fonts.js';
/** Gera o PDF (mesmo código do BetterFountain/Afterwriting). O parse é refeito porque GeneratePdf muta os tokens. */
/** Carrega um <script> clássico uma única vez (usado para o pdfkit, que é grande). */
function loadScript(src) {
    return new Promise((ok, erro) => {
        if (window.PDFDocument) return ok();
        const s = document.createElement('script');
        s.src = src; s.onload = ok; s.onerror = () => erro(new Error('Não foi possível carregar ' + src));
        document.head.append(s);
    });
}
export async function makePdf(text, cfg, highlighted) {
    await loadScript('js/vendor/pdfkit.standalone.js');
    await loadFonts();
    const parsed = parse(text, cfg, false);
    const ec = emptyExportConfig();
    ec.highlighted_characters = highlighted;
    const { data, stats } = await GeneratePdf('$PDF$', cfg, ec, parsed);
    return { blob: new Blob([data], { type: 'application/pdf' }), pages: stats.pagecountReal };
}
