/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 RyanAHayden
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// The nvim look: system24 (refact0r's TUI theme) for the panels, in nvim's own colors (read from nvim's highlight
// groups, so it's whatever colorscheme nvim has, Omarchy's current theme included), in the terminal's font.
// vimcord's pieces copy nvim's: the bar is lualine, the cursor is CursorLine, the selection Visual, floats have
// FloatBorder, which-key its own colors. Without nvim, the terminal's palette stands in, mapped the same way; with
// no theme at all, Tokyo Night.
// The terminal's palette is re-read every few seconds; when it changes (an Omarchy theme switch), nvim is asked again.

import { PluginNative } from "@utils/types";

import { logger } from "./discord";
import type { Terminal } from "./native";

const Native = VencordNative.pluginHelpers.VimCord as PluginNative<typeof import("./native")>;

const SYSTEM24 = "https://refact0r.github.io/system24/build/system24.css";

type Hl = Record<string, { fg?: string; bg?: string; }>;

// with no theme to read (no Omarchy, no terminal colors, no nvim): Tokyo Night, as tokyonight.nvim draws it
const TOKYONIGHT: Record<string, string> = {
    background: "#1a1b26", foreground: "#c0caf5", cursor: "#c0caf5",
    selection_background: "#283457", selection_foreground: "#c0caf5",
    color0: "#15161e", color1: "#f7768e", color2: "#9ece6a", color3: "#e0af68",
    color4: "#7aa2f7", color5: "#bb9af7", color6: "#7dcfff", color7: "#a9b1d6",
    color8: "#414868", color9: "#ff899d", color10: "#9fe044", color11: "#faba4a",
    color12: "#8db0ff", color13: "#c7a9ff", color14: "#a4daff", color15: "#c0caf5",
};

const TOKYONIGHT_HL: Hl = {
    Normal: { fg: "#c0caf5", bg: "#1a1b26" },
    CursorLine: { bg: "#292e42" },
    Visual: { bg: "#283457" },
    FloatBorder: { fg: "#27a1b9" },
    FloatTitle: { fg: "#27a1b9" },
    WinSeparator: { fg: "#3b4261" },
    Comment: { fg: "#565f89" },
    Title: { fg: "#7aa2f7" },
    Special: { fg: "#2ac3de" },
    Directory: { fg: "#7aa2f7" },
    Search: { bg: "#3d59a1" },
    CursorLineNr: { fg: "#ff9e64" },
    DiagnosticError: { fg: "#db4b4b" },
    DiagnosticWarn: { fg: "#e0af68" },
    lualine_a_normal: { fg: "#15161e", bg: "#7aa2f7" },
    lualine_a_insert: { fg: "#15161e", bg: "#9ece6a" },
    lualine_a_visual: { fg: "#15161e", bg: "#bb9af7" },
    lualine_a_command: { fg: "#15161e", bg: "#e0af68" },
    lualine_b_normal: { fg: "#7aa2f7", bg: "#3b4261" },
    lualine_c_normal: { fg: "#a9b1d6", bg: "#16161e" },
    WhichKey: { fg: "#7dcfff" },
    WhichKeyGroup: { fg: "#7aa2f7" },
    WhichKeyDesc: { fg: "#bb9af7" },
    WhichKeySeparator: { fg: "#565f89" },
};

let style: HTMLStyleElement | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
let last = "";
let opts = { colorsFile: "", font: "" };
let term: Terminal | null = null;
let hl: Hl | null = null;
let hlFor = "";

const mix = (a: string, b: string, pct: number) => `color-mix(in oklab, ${a} ${pct}%, ${b})`;

/** the colors vimcord uses, by what they're for: nvim's highlight groups where it has them, else the palette */
function scheme(t: Terminal, h: Hl) {
    const c = { ...TOKYONIGHT, ...t.colors };
    const fg_ = (g: string) => h[g]?.fg;
    const bg_ = (g: string) => h[g]?.bg;
    // a transparent nvim (no Normal bg) sits on the terminal's background
    const bg = bg_("Normal") ?? c.background;
    const fg = fg_("Normal") ?? c.foreground;
    return {
        bg, fg,
        strong: c.color15,
        muted: fg_("Comment") ?? c.color8,
        border: fg_("WinSeparator") ?? c.color8,
        floatBorder: fg_("SnacksPickerBorder") ?? fg_("FloatBorder") ?? mix(c.color4, bg, 75),
        floatTitle: fg_("SnacksPickerTitle") ?? fg_("FloatTitle") ?? fg_("Title") ?? c.color4,
        cursorline: bg_("CursorLine") ?? mix(fg, bg, 18),
        visualBg: bg_("Visual") ?? c.selection_background ?? mix(fg, bg, 22),
        normal: bg_("lualine_a_normal") ?? c.color4,
        insert: bg_("lualine_a_insert") ?? c.color2,
        visual: bg_("lualine_a_visual") ?? c.color5,
        command: bg_("lualine_a_command") ?? c.color3,
        modeFg: fg_("lualine_a_normal") ?? bg,
        sectionFg: fg_("lualine_b_normal") ?? fg,
        sectionBg: bg_("lualine_b_normal") ?? mix(fg, bg, 12),
        barFg: fg_("lualine_c_normal") ?? fg,
        barBg: bg_("lualine_c_normal") ?? bg,
        match: fg_("SnacksPickerMatch") ?? fg_("Special") ?? c.color6,
        num: fg_("SnacksPickerIdx") ?? fg_("CursorLineNr") ?? c.color3,
        key: fg_("WhichKey") ?? c.color6,
        group: fg_("WhichKeyGroup") ?? c.color4,
        desc: fg_("WhichKeyDesc") ?? c.color13,
        sep: fg_("WhichKeySeparator") ?? c.color8,
        title: fg_("Title") ?? c.color4,
        link: fg_("Directory") ?? c.color4,
        search: bg_("Search") ?? mix(c.color4, bg, 35),
        error: fg_("DiagnosticError") ?? c.color9,
        warn: fg_("DiagnosticWarn") ?? c.color3,
        ok: c.color2,
        red: [c.color1, c.color9], green: [c.color2, c.color10], blue: [c.color4, c.color12],
        yellow: [c.color3, c.color11], purple: [c.color5, c.color13],
    };
}

function css(t: Terminal, h: Hl) {
    const s = scheme(t, h);
    const { bg, fg } = s;
    const font = opts.font || t.font || "JetBrainsMono Nerd Font";
    const fontStack = `'${font.replace(/'/g, "")}', 'JetBrainsMono Nerd Font', 'JetBrains Mono', monospace`;

    // system24's five shades per hue: bright, normal, then the normal sinking toward the background
    const hue = (name: string, [normal, bright]: string[]) =>
        `--${name}-1: ${bright}; --${name}-2: ${normal}; --${name}-3: ${mix(normal, bg, 85)}; --${name}-4: ${mix(normal, bg, 70)}; --${name}-5: ${mix(normal, bg, 55)};`;

    return `@import url('${SYSTEM24}');

:root:root {
    color-scheme: dark;
    --colors: on;
    --text-0: ${bg};
    --text-1: ${s.strong};
    --text-2: ${fg};
    --text-3: ${fg};
    --text-4: ${mix(fg, bg, 70)};
    --text-5: ${s.muted};
    --bg-1: ${mix(fg, bg, 18)};
    --bg-2: ${mix(fg, bg, 11)};
    --bg-3: ${bg};
    --bg-4: ${bg};
    --hover: ${mix(fg, "transparent", 8)};
    --active: ${s.cursorline};
    --active-2: ${s.visualBg};
    --message-hover: ${mix(fg, "transparent", 5)};
    --accent-1: ${s.link};
    --accent-2: ${s.title};
    --accent-3: ${mix(s.title, bg, 85)};
    --accent-4: ${mix(s.title, bg, 75)};
    --accent-5: ${mix(s.title, bg, 65)};
    --accent-new: ${s.error};
    --mention: linear-gradient(to right, ${s.search} 40%, transparent);
    --mention-hover: linear-gradient(to right, ${mix(s.search, "transparent", 70)} 40%, transparent);
    --reply: linear-gradient(to right, ${mix(fg, "transparent", 8)} 40%, transparent);
    --reply-hover: linear-gradient(to right, ${mix(fg, "transparent", 4)} 40%, transparent);
    --online: ${s.ok};
    --dnd: ${s.error};
    --idle: ${s.warn};
    --streaming: ${s.visual};
    --offline: ${s.muted};
    --border-light: ${mix(s.border, "transparent", 40)};
    --border: ${s.border};
    --border-hover: ${s.normal};
    --button-border: ${mix(fg, "transparent", 12)};
    ${hue("red", s.red)}
    ${hue("green", s.green)}
    ${hue("blue", s.blue)}
    ${hue("yellow", s.yellow)}
    ${hue("purple", s.purple)}

    --vc-font: ${fontStack};
    --vc-bg: ${bg};
    --vc-fg: ${fg};
    --vc-strong: ${s.strong};
    --vc-muted: ${s.muted};
    --vc-accent: ${s.normal};
    --vc-border: ${s.border};
    --vc-float-border: ${s.floatBorder};
    --vc-float-title: ${s.floatTitle};
    --vc-cursorline: ${s.cursorline};
    --vc-sel: ${s.visualBg};
    --vc-normal: ${s.normal};
    --vc-insert: ${s.insert};
    --vc-visual: ${s.visual};
    --vc-popup: ${s.command};
    --vc-mode-fg: ${s.modeFg};
    --vc-section: ${s.sectionBg};
    --vc-section-fg: ${s.sectionFg};
    --vc-bar-fg: ${s.barFg};
    --vc-bar-bg: ${s.barBg};
    --vc-match: ${s.match};
    --vc-num: ${s.num};
    --vc-key: ${s.key};
    --vc-group: ${s.group};
    --vc-desc: ${s.desc};
    --vc-sep: ${s.sep};
    --vc-error: ${s.error};
}

body.vimcord-look {
    --font: ${fontStack};
    --code-font: ${fontStack};
    font-weight: 400;
    letter-spacing: 0;
    --gap: 8px;
    --divider-thickness: 2px;
    --border-thickness: 1px;
    --border-hover-transition: 0s;
    --animations: off;
    --top-bar-height: 14px;
    --top-bar-button-position: titlebar;
    --top-bar-title-position: off;
    --subtle-top-bar-title: off;
    --custom-window-controls: off;
    --custom-dms-icon: off;
    --custom-dms-background: off;
    --background-image: off;
    --transparency-tweaks: off;
    --remove-bg-layer: off;
    --panel-blur: off;
    --small-user-panel: on;
    --unrounding: on;
    --round-pfp: off;
    --remove-pfp-decor: off;
    --custom-spotify-bar: on;
    --ascii-titles: on;
    --ascii-loader: system24;
    --panel-labels: on;
    --label-color: var(--vc-muted);
    --label-font-weight: 500;
}

/* panel labels like lazygit's: the pane's number for 1-4, in the border, the focused one in the mode's color */
body.vimcord-look :is([class*="guilds_"], [class*="panels_"], [class*="sidebarList_"], [class*="subtitleContainer_"], [class*="messagesWrapper_"], [class*="channelTextArea_"], [data-vimcord-members-box])::after {
    color: var(--vc-muted) !important;
    background: var(--vc-bg) !important;
    white-space: nowrap !important;
}
body.vimcord-look [class*="guilds_"]::after { content: "[1] nav" !important; }
/* further in than the others, so the server column's "[1] nav" (wider than its column) doesn't run into it */
body.vimcord-look [class*="sidebarList_"]::after { content: "[2] channels" !important; left: 32px !important; }
body.vimcord-look [class*="messagesWrapper_"]::after { content: "[3] " var(--vc-chat-label, "chat") !important; }
/* system24 labels the member list's container (which panes.ts marks, since a :has() for it would make every DOM
   change recheck the whole page); the list itself would get a second label */
body.vimcord-look [data-vimcord-members-box]::after { content: "[4] members" !important; }
body.vimcord-look [data-vimcord-members-box] > [class*="membersWrap_"]::after { content: none !important; }
body.vimcord-look:not(.vimcord-list-focused):not(.vimcord-insert) [class*="messagesWrapper_"]::after,
body.vimcord-look [data-vimcord-pane]::after,
body.vimcord-look [data-vimcord-members-box][data-vimcord-pane-label]::after { color: var(--vc-normal) !important; }
body.vimcord-look.vimcord-visual [class*="messagesWrapper_"]::after { color: var(--vc-visual) !important; }
body.vimcord-look.vimcord-insert [class*="channelTextArea_"]:focus-within::after { color: var(--vc-insert) !important; }
body.vimcord-look [data-vimcord-pane] { outline: none !important; border-color: var(--vc-normal) !important; }

/* the start-of-channel title: one clean line instead of the big heading and buttons */
body.vimcord-look [class*="emptyChannelIcon_"],
body.vimcord-look [class*="channelSettingButtons_"] { display: none !important; }
body.vimcord-look [class*="emptyChannelIcon_"] + h3 {
    font-family: var(--vc-font) !important;
    font-size: 16px !important;
    font-weight: 700 !important;
    color: var(--vc-strong) !important;
    margin: 8px 0 2px !important;
}

/* thin scrollbars, like nvim's (which has none) */
body.vimcord-look ::-webkit-scrollbar { width: 6px !important; height: 6px !important; }
body.vimcord-look ::-webkit-scrollbar-thumb { background: var(--vc-border) !important; border: none !important; }
body.vimcord-look ::-webkit-scrollbar-track { background: transparent !important; }
`;
}

function apply() {
    if (!term) return;
    // no theme anywhere: Tokyo Night's nvim colors too, not just its palette
    const h = hl && Object.keys(hl).length ? hl : term.source ? {} : TOKYONIGHT_HL;
    const text = css(term, h);
    if (text === last) return;
    last = text;
    style ??= document.head.appendChild(Object.assign(document.createElement("style"), { id: "vimcord-look" }));
    // keep it last in <head>, after Vencord's themes, so its colors win
    if (style !== document.head.lastElementChild) document.head.appendChild(style);
    style.textContent = text;
    document.body.classList.add("vimcord-look");
    document.body.classList.toggle("vimcord-nerd", /nerd/i.test(opts.font || term.font || "JetBrainsMono Nerd Font"));
}

async function refresh() {
    try {
        term = await Native.readTerminal(opts.colorsFile);
    } catch (e) {
        logger.error("couldn't read the terminal's colors", e);
        term ??= { colors: {}, font: null, source: null };
    }
    if (!timer) return;
    apply();
    // nvim's colors follow the theme: ask nvim again when the terminal's palette changes (an Omarchy theme switch)
    const key = JSON.stringify(term.colors);
    if (key !== hlFor) {
        hlFor = key;
        try {
            hl = await Native.readNvim();
        } catch (e) {
            logger.error("couldn't read nvim's colors", e);
        }
        if (timer) apply();
    }
}

/** hides or shows the window's own buttons: macOS's traffic lights natively, Windows/Linux's (Discord's) with CSS */
export function windowButtons(visible: boolean) {
    document.body.classList.toggle("vimcord-hide-winbuttons", !visible);
    if (navigator.platform.startsWith("Mac")) Native.setWindowButtons(visible).catch(e => logger.error("window buttons", e));
}

export function enable(o: { colorsFile: string; font: string; }) {
    opts = o;
    last = "";
    hlFor = "";
    clearInterval(timer);
    timer = setInterval(refresh, 3000);
    refresh();
}

export function disable() {
    clearInterval(timer);
    timer = undefined;
    style?.remove();
    style = null;
    last = "";
    document.body.classList.remove("vimcord-look", "vimcord-nerd");
}
