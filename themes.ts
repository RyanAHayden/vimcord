/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 RyanAHayden
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Themes to pick instead of your own: each one's terminal palette, and the colors its nvim colorscheme gives the
// highlight groups vimcord copies (lualine's modes, CursorLine, Visual, borders, which-key). Tokyo Night is also
// what the look falls back to when there's no theme to read at all.

export type Hl = Record<string, { fg?: string; bg?: string; }>;

export interface Theme {
    name: string;
    palette: Record<string, string>;
    hl: Hl;
}

const ansi = (c: string[]) => Object.fromEntries(c.map((v, i) => [`color${i}`, v]));

/** the highlight groups that differ between themes, from a few named colors */
function hl(o: {
    bg: string; fg: string; cursorline: string; visual: string; border: string; float: string; comment: string;
    normal: string; insert: string; visualMode: string; command: string; modeFg: string; sectionBg: string; barBg: string;
    key: string; group: string; desc: string; title: string; special: string; search: string; error: string; warn: string;
}): Hl {
    return {
        Normal: { fg: o.fg, bg: o.bg },
        CursorLine: { bg: o.cursorline },
        Visual: { bg: o.visual },
        FloatBorder: { fg: o.float },
        FloatTitle: { fg: o.float },
        WinSeparator: { fg: o.border },
        Comment: { fg: o.comment },
        Title: { fg: o.title },
        Special: { fg: o.special },
        Directory: { fg: o.title },
        Search: { bg: o.search },
        DiagnosticError: { fg: o.error },
        DiagnosticWarn: { fg: o.warn },
        lualine_a_normal: { fg: o.modeFg, bg: o.normal },
        lualine_a_insert: { fg: o.modeFg, bg: o.insert },
        lualine_a_visual: { fg: o.modeFg, bg: o.visualMode },
        lualine_a_command: { fg: o.modeFg, bg: o.command },
        lualine_b_normal: { fg: o.normal, bg: o.sectionBg },
        lualine_c_normal: { fg: o.fg, bg: o.barBg },
        WhichKey: { fg: o.key },
        WhichKeyGroup: { fg: o.group },
        WhichKeyDesc: { fg: o.desc },
        WhichKeySeparator: { fg: o.comment },
    };
}

export const THEMES: Record<string, Theme> = {
    tokyonight: {
        name: "Tokyo Night",
        palette: {
            background: "#1a1b26", foreground: "#c0caf5", cursor: "#c0caf5", selection_background: "#283457", selection_foreground: "#c0caf5",
            ...ansi(["#15161e", "#f7768e", "#9ece6a", "#e0af68", "#7aa2f7", "#bb9af7", "#7dcfff", "#a9b1d6",
                "#414868", "#ff899d", "#9fe044", "#faba4a", "#8db0ff", "#c7a9ff", "#a4daff", "#c0caf5"]),
        },
        hl: hl({
            bg: "#1a1b26", fg: "#c0caf5", cursorline: "#292e42", visual: "#283457", border: "#3b4261", float: "#27a1b9", comment: "#565f89",
            normal: "#7aa2f7", insert: "#9ece6a", visualMode: "#bb9af7", command: "#e0af68", modeFg: "#15161e", sectionBg: "#3b4261", barBg: "#16161e",
            key: "#7dcfff", group: "#7aa2f7", desc: "#bb9af7", title: "#7aa2f7", special: "#2ac3de", search: "#3d59a1", error: "#db4b4b", warn: "#e0af68",
        }),
    },
    catppuccin: {
        name: "Catppuccin Mocha",
        palette: {
            background: "#1e1e2e", foreground: "#cdd6f4", cursor: "#f5e0dc", selection_background: "#45475a", selection_foreground: "#cdd6f4",
            ...ansi(["#45475a", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#f5c2e7", "#94e2d5", "#bac2de",
                "#585b70", "#f38ba8", "#a6e3a1", "#f9e2af", "#89b4fa", "#f5c2e7", "#94e2d5", "#a6adc8"]),
        },
        hl: hl({
            bg: "#1e1e2e", fg: "#cdd6f4", cursorline: "#2a2b3c", visual: "#45475a", border: "#45475a", float: "#89b4fa", comment: "#7f849c",
            normal: "#89b4fa", insert: "#a6e3a1", visualMode: "#cba6f7", command: "#fab387", modeFg: "#1e1e2e", sectionBg: "#313244", barBg: "#181825",
            key: "#94e2d5", group: "#89b4fa", desc: "#cba6f7", title: "#89b4fa", special: "#f5c2e7", search: "#3e5767", error: "#f38ba8", warn: "#f9e2af",
        }),
    },
    gruvbox: {
        name: "Gruvbox",
        palette: {
            background: "#282828", foreground: "#ebdbb2", cursor: "#ebdbb2", selection_background: "#504945", selection_foreground: "#ebdbb2",
            ...ansi(["#282828", "#cc241d", "#98971a", "#d79921", "#458588", "#b16286", "#689d6a", "#a89984",
                "#928374", "#fb4934", "#b8bb26", "#fabd2f", "#83a598", "#d3869b", "#8ec07c", "#ebdbb2"]),
        },
        hl: hl({
            bg: "#282828", fg: "#ebdbb2", cursorline: "#3c3836", visual: "#665c54", border: "#504945", float: "#a89984", comment: "#928374",
            normal: "#a89984", insert: "#83a598", visualMode: "#fe8019", command: "#b8bb26", modeFg: "#282828", sectionBg: "#504945", barBg: "#3c3836",
            key: "#fe8019", group: "#83a598", desc: "#d3869b", title: "#b8bb26", special: "#fe8019", search: "#665c54", error: "#fb4934", warn: "#fabd2f",
        }),
    },
    nord: {
        name: "Nord",
        palette: {
            background: "#2e3440", foreground: "#d8dee9", cursor: "#d8dee9", selection_background: "#434c5e", selection_foreground: "#eceff4",
            ...ansi(["#3b4252", "#bf616a", "#a3be8c", "#ebcb8b", "#81a1c1", "#b48ead", "#88c0d0", "#e5e9f0",
                "#4c566a", "#bf616a", "#a3be8c", "#ebcb8b", "#81a1c1", "#b48ead", "#8fbcbb", "#eceff4"]),
        },
        hl: hl({
            bg: "#2e3440", fg: "#d8dee9", cursorline: "#3b4252", visual: "#434c5e", border: "#4c566a", float: "#81a1c1", comment: "#616e88",
            normal: "#88c0d0", insert: "#a3be8c", visualMode: "#b48ead", command: "#ebcb8b", modeFg: "#2e3440", sectionBg: "#434c5e", barBg: "#3b4252",
            key: "#88c0d0", group: "#81a1c1", desc: "#b48ead", title: "#88c0d0", special: "#ebcb8b", search: "#434c5e", error: "#bf616a", warn: "#ebcb8b",
        }),
    },
    rosepine: {
        name: "Rosé Pine",
        palette: {
            background: "#191724", foreground: "#e0def4", cursor: "#524f67", selection_background: "#403d52", selection_foreground: "#e0def4",
            ...ansi(["#26233a", "#eb6f92", "#31748f", "#f6c177", "#9ccfd8", "#c4a7e7", "#ebbcba", "#e0def4",
                "#6e6a86", "#eb6f92", "#31748f", "#f6c177", "#9ccfd8", "#c4a7e7", "#ebbcba", "#e0def4"]),
        },
        hl: hl({
            bg: "#191724", fg: "#e0def4", cursorline: "#21202e", visual: "#403d52", border: "#403d52", float: "#524f67", comment: "#6e6a86",
            normal: "#ebbcba", insert: "#9ccfd8", visualMode: "#c4a7e7", command: "#eb6f92", modeFg: "#191724", sectionBg: "#26233a", barBg: "#1f1d2e",
            key: "#9ccfd8", group: "#c4a7e7", desc: "#ebbcba", title: "#c4a7e7", special: "#f6c177", search: "#403d52", error: "#eb6f92", warn: "#f6c177",
        }),
    },
    kanagawa: {
        name: "Kanagawa",
        palette: {
            background: "#1f1f28", foreground: "#dcd7ba", cursor: "#c8c093", selection_background: "#2d4f67", selection_foreground: "#c8c093",
            ...ansi(["#16161d", "#c34043", "#76946a", "#c0a36e", "#7e9cd8", "#957fb8", "#6a9589", "#c8c093",
                "#727169", "#e82424", "#98bb6c", "#e6c384", "#7fb4ca", "#938aa9", "#7aa89f", "#dcd7ba"]),
        },
        hl: hl({
            bg: "#1f1f28", fg: "#dcd7ba", cursorline: "#2a2a37", visual: "#223249", border: "#54546d", float: "#54546d", comment: "#727169",
            normal: "#7e9cd8", insert: "#76946a", visualMode: "#957fb8", command: "#c0a36e", modeFg: "#16161d", sectionBg: "#2a2a37", barBg: "#16161d",
            key: "#7fb4ca", group: "#7e9cd8", desc: "#957fb8", title: "#7e9cd8", special: "#ffa066", search: "#2d4f67", error: "#e82424", warn: "#ff9e3b",
        }),
    },
};
