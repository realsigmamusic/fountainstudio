import * as print from "./print.js";
import * as helpers from "./helpers.js";
import * as fliner from "./liner.js";
/**
 * Limpa os tokens e quebra o roteiro em linhas/páginas (mesma lógica usada no PDF).
 * Preenche `parsedDocument.lines`; as quebras de página aparecem como linhas do tipo "page_break".
 * Não depende do pdfkit, então também serve para o preview.
 */
export function layoutLines(config, parsedDocument) {
    var liner = new fliner.Liner(helpers.default, config.print_dialogue_numbers);
    var current_index = 0, previous_type = null;
    // tidy up separators
    let invisibleSections = [];
    while (current_index < parsedDocument.tokens.length) {
        var current_token = parsedDocument.tokens[current_index];
        if (current_token.type == "dual_dialogue_begin" || current_token.type == "dialogue_begin" || current_token.type == "dialogue_end" || current_token.type == "dual_dialogue_end" ||
            (!config.print_actions && current_token.is("action", "transition", "centered", "shot")) ||
            (!config.print_notes && current_token.type === "note") ||
            (!config.print_headers && current_token.type === "scene_heading") ||
            (!config.print_sections && current_token.type === "section") ||
            (!config.print_synopsis && current_token.type === "synopsis") ||
            (!config.print_dialogues && current_token.is_dialogue()) ||
            (config.merge_empty_lines && current_token.is("separator") && previous_type === "separator")) {
            if (current_token.type == "section") {
                //on the next scene header, add an invisible section (for keeping track of sections when creating bookmarks and generating pdf-side)
                invisibleSections.push(current_token);
            }
            parsedDocument.tokens.splice(current_index, 1);
            continue;
        }
        if (current_token.type == "scene_heading") {
            if (invisibleSections.length > 0)
                current_token.invisibleSections = invisibleSections;
            invisibleSections = [];
        }
        if (config.double_space_between_scenes && current_token.is("scene_heading") && current_token.number !== 1) {
            var additional_separator = helpers.default.create_separator(parsedDocument.tokens[current_index].start, parsedDocument.tokens[current_index].end);
            parsedDocument.tokens.splice(current_index, 0, additional_separator);
            current_index++;
        }
        previous_type = current_token.type;
        current_index++;
    }
    // clean separators at the end
    while (parsedDocument.tokens.length > 0 && parsedDocument.tokens[parsedDocument.tokens.length - 1].type === "separator") {
        parsedDocument.tokens.pop();
    }
    parsedDocument.lines = liner.line(parsedDocument.tokens, {
        print: print.print_profiles[config.print_profile || "a4"],
        text_more: config.text_more,
        text_contd: config.text_contd,
        split_dialogue: config.split_dialogue
    });
    return parsedDocument.lines;
}
/**
 * Devolve onde cada página começa: [{ line, page }], onde `line` é a linha do texto-fonte
 * do primeiro bloco da página e `page` é o número da página (a partir de 2).
 */
export function pageStarts(config, parsedDocument) {
    const lines = layoutLines(config, parsedDocument);
    const out = [];
    let page = 1;
    for (let i = 0; i < lines.length; i++) {
        if (lines[i].type !== "page_break")
            continue;
        let j = i + 1;
        while (j < lines.length && (lines[j].type === "page_break" || lines[j].type === "separator" || !lines[j].token))
            j++;
        page++;
        if (j < lines.length)
            out.push({ line: lines[j].token.line, page, split: lines[j].token === (lines[i - 1] && lines[i - 1].token) });
    }
    return out;
}
