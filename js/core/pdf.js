import * as pdfmaker from "./pdfmaker.js";
import * as print from "./print.js";
import { layoutLines } from "./layout.js";
//Creates the PDF, or returns stats if output path is "$STATS$"
export var GeneratePdf = function (outputpath, config, exportconfig, parsedDocument) {
    var watermark = undefined;
    var header = undefined;
    var footer = undefined;
    var font = "Courier Prime";
    if (parsedDocument.title_page) {
        for (let index = 0; index < parsedDocument.title_page['hidden'].length; index++) {
            if (parsedDocument.title_page['hidden'][index].type == "watermark")
                watermark = parsedDocument.title_page['hidden'][index].text;
            if (parsedDocument.title_page['hidden'][index].type == "header")
                header = parsedDocument.title_page['hidden'][index].text;
            if (parsedDocument.title_page['hidden'][index].type == "footer")
                footer = parsedDocument.title_page['hidden'][index].text;
            if (parsedDocument.title_page['hidden'][index].type == "font")
                font = parsedDocument.title_page['hidden'][index].text;
        }
    }
    layoutLines(config, parsedDocument);
    if (!config.print_watermark && watermark != undefined)
        config.print_watermark = watermark;
    if (!config.print_header && header != undefined)
        config.print_header = header;
    if (!config.print_footer && footer != undefined)
        config.print_footer = footer;
    var pdf_options = {
        parsed: parsedDocument,
        print: print.print_profiles[config.print_profile || "a4"],
        config: config,
        font: font,
        exportconfig: exportconfig
    };
    if (outputpath == "$STATS$")
        return pdfmaker.get_pdf_stats(pdf_options);
    else
        return pdfmaker.get_pdf_bytes(pdf_options);
};
