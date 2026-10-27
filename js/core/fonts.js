let fonts = null;
export const setFonts = (f) => { fonts = f; };
export const getFonts = () => {
    if (!fonts)
        throw new Error('Fontes não carregadas: chame setFonts()/loadFonts() antes de gerar o PDF.');
    return fonts;
};
/** Navegador: busca as 4 variantes de Courier Prime servidas em /fonts/. */
export async function loadFonts(base = '') {
    if (fonts)
        return;
    const get = async (n) => new Uint8Array(await (await fetch(`${base}fonts/${n}.ttf`)).arrayBuffer());
    const [normal, bold, italic, boldItalic] = await Promise.all(['courier-prime', 'courier-prime-bold', 'courier-prime-italic', 'courier-prime-bold-italic'].map(get));
    fonts = { normal, bold, italic, boldItalic };
}
