// Substitui o fontHandler original (que usava fontkit/fs só para fontes não-padrão).
// Para as fontes padrão do pdfkit a tabela é idêntica à original; as demais usam o ascent do Courier.
export default function getFontAscent(font, fontSize) {
  let a;
  switch (font) {
    case "Courier": case "Courier-Bold": case "Courier-Oblique": case "Courier-BoldOblique": a = 629 / 1000; break;
    case "Helvetica": case "Helvetica-Bold": case "Helvetica-Oblique": case "Helvetica-BoldOblique": a = 718 / 1000; break;
    case "Times-Roman": case "Times-Bold": case "Times-Italic": case "Times-BoldItalic": a = 683 / 1000; break;
    case "Symbol": case "ZapfDingbats": a = 500 / 1000; break;
    default: a = 629 / 1000;
  }
  return fontSize * a;
}
