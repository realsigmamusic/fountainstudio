export const defaultConfig = {
    number_scenes_on_save: false, embolden_scene_headers: true, embolden_character_names: false,
    show_page_numbers: true, split_dialogue: true, print_title_page: true, print_profile: 'a4',
    double_space_between_scenes: false, print_sections: false, print_synopsis: false, print_actions: true,
    print_headers: true, print_dialogues: true, number_sections: false, use_dual_dialogue: true,
    print_notes: false, print_header: '', print_footer: '', print_watermark: '', scenes_numbers: 'both',
    each_scene_on_new_page: false, merge_empty_lines: true, print_dialogue_numbers: false,
    create_bookmarks: true, invisible_section_bookmarks: true, text_more: '(MORE)', text_contd: "(CONT'D)",
    text_scene_continued: 'CONTINUED', scene_continuation_top: false, scene_continuation_bottom: false,
    parenthetical_newline_helper: true,
};
export const emptyExportConfig = () => ({ highlighted_characters: [], highlighted_changes: { lines: [], highlightColor: [] } });
