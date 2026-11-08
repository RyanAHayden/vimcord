/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 RyanAHayden
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// The nvim look: system24 (refact0r's TUI theme) for the panels, recolored from the terminal's palette the way nvim
// is, with the terminal's font, and vimcord's own pieces (bottom bar, cursor line, floats) styled like lualine and
// nvim's floating windows. The palette is re-read every few seconds, so switching Omarchy themes carries over.

import { PluginNative } from "@utils/types";

import { logger } from "./discord";
import type { Terminal } from "./native";

const Native = VencordNative.pluginHelpers.VimCord as PluginNative<typeof import("./native")>;

const SYSTEM24 = "https://refact0r.github.io/system24/build/system24.css";

// used when there's no terminal config to read: ryha silver, the palette this was made with
const FALLBACK: Record<string, string> = {
    background: "#000000", foreground: "#e5e5e5", cursor: "#e5e5e5",
    selection_background: "#3a3a3a", selection_foreground: "#ffffff",
    color0: "#000000", color1: "#ef4444", color2: "#22c55e", color3: "#f59e0b",
    color4: "#3b82f6", color5: "#a855f7", color6: "#06b6d4", color7: "#e5e5e5",
    color8: "#737373", color9: "#f87171", color10: "#4ade80", color11: "#fbbf24",
    color12: "#60a5fa", color13: "#c084fc", color14: "#22d3ee", color15: "#ffffff",
};

let style: HTMLStyleElement | null = null;
let timer: ReturnType<typeof setInterval> | undefined;
let last = "";
let opts = { colorsFile: "", font: "" };
let info: Terminal | null = null;

/** where the colors and font came from, shown in the settings */
export const source = () => info;

const mix = (a: string, b: string, pct: number) => `color-mix(in oklab, ${a} ${pct}%, ${b})`;

function css(t: Terminal) {
    const c = { ...FALLBACK, ...t.colors };
    const bg = c.background, fg = c.foreground;
    // Omarchy themes name an accent; terminal configs don't, so fall back to the cursor color, then blue
    const accent = c.accent ?? (c.cursor && c.cursor.toLowerCase() !== fg.toLowerCase() ? c.cursor : c.color4);
    const sel = c.selection_background ?? mix(fg, bg, 20);
    const font = opts.font || t.font || "JetBrainsMono Nerd Font";
    const fontStack = `'${font.replace(/'/g, "")}', 'JetBrainsMono Nerd Font', 'JetBrains Mono', monospace`;

    // system24's five shades per hue: bright, normal, then the normal sinking toward the background
    const hue = (name: string, normal: string, bright: string) =>
        `--${name}-1: ${bright}; --${name}-2: ${normal}; --${name}-3: ${mix(normal, bg, 85)}; --${name}-4: ${mix(normal, bg, 70)}; --${name}-5: ${mix(normal, bg, 55)};`;

    return `@import url('${SYSTEM24}');

:root:root {
    color-scheme: dark;
    --colors: on;
    --text-0: ${bg};
    --text-1: ${c.color15};
    --text-2: ${fg};
    --text-3: ${fg};
    --text-4: ${mix(fg, bg, 70)};
    --text-5: ${c.color8};
    --bg-1: ${mix(fg, bg, 18)};
    --bg-2: ${mix(fg, bg, 11)};
    --bg-3: ${bg};
    --bg-4: ${bg};
    --hover: ${mix(fg, "transparent", 8)};
    --active: ${mix(sel, "transparent", 85)};
    --active-2: ${sel};
    --message-hover: ${mix(fg, "transparent", 5)};
    --accent-1: ${accent};
    --accent-2: ${accent};
    --accent-3: ${mix(accent, bg, 85)};
    --accent-4: ${mix(accent, bg, 75)};
    --accent-5: ${mix(accent, bg, 65)};
    --accent-new: ${c.color1};
    --mention: linear-gradient(to right, ${mix(accent, "transparent", 12)} 40%, transparent);
    --mention-hover: linear-gradient(to right, ${mix(accent, "transparent", 7)} 40%, transparent);
    --reply: linear-gradient(to right, ${mix(fg, "transparent", 8)} 40%, transparent);
    --reply-hover: linear-gradient(to right, ${mix(fg, "transparent", 4)} 40%, transparent);
    --online: ${c.color2};
    --dnd: ${c.color1};
    --idle: ${c.color3};
    --streaming: ${c.color5};
    --offline: ${c.color8};
    --border-light: ${mix(fg, "transparent", 10)};
    --border: ${mix(fg, bg, 22)};
    --border-hover: ${accent};
    --button-border: ${mix(fg, "transparent", 12)};
    ${hue("red", c.color1, c.color9)}
    ${hue("green", c.color2, c.color10)}
    ${hue("blue", c.color4, c.color12)}
    ${hue("yellow", c.color3, c.color11)}
    ${hue("purple", c.color5, c.color13)}

    /* vimcord's own pieces, lualine-style mode colors */
    --vc-font: ${fontStack};
    --vc-bg: ${bg};
    --vc-fg: ${fg};
    --vc-strong: ${c.color15};
    --vc-muted: ${c.color8};
    --vc-accent: ${accent};
    --vc-border: ${mix(fg, bg, 22)};
    --vc-float-border: ${c.color4};
    --vc-cursorline: ${mix(fg, bg, 9)};
    --vc-sel: ${sel};
    --vc-sel-fg: ${c.selection_foreground ?? c.color15};
    --vc-normal: ${c.color4};
    --vc-insert: ${c.color2};
    --vc-visual: ${c.color5};
    --vc-popup: ${c.color3};
    --vc-match: ${c.color6};
    --vc-num: ${c.color3};
    --vc-section: ${mix(fg, bg, 16)};
}

body.vimcord-look {
    --font: ${fontStack};
    --code-font: ${fontStack};
    font-weight: 400;
    letter-spacing: 0;
    --gap: 6px;
    --divider-thickness: 2px;
    --border-thickness: 1px;
    --border-hover-transition: 0s;
    --animations: off;
    --top-bar-height: var(--gap);
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
    --label-color: var(--text-5);
    --label-font-weight: 400;
}

/* thin scrollbars, like nvim's (which has none) */
body.vimcord-look ::-webkit-scrollbar { width: 6px !important; height: 6px !important; }
body.vimcord-look ::-webkit-scrollbar-thumb { background: var(--vc-border) !important; border: none !important; }
body.vimcord-look ::-webkit-scrollbar-track { background: transparent !important; }
`;
}

function apply(t: Terminal) {
    const text = css(t);
    if (text === last) return;
    last = text;
    style ??= document.head.appendChild(Object.assign(document.createElement("style"), { id: "vimcord-look" }));
    // keep it last in <head>, after Vencord's themes, so its colors win
    if (style !== document.head.lastElementChild) document.head.appendChild(style);
    style.textContent = text;
    document.body.classList.add("vimcord-look");
    document.body.classList.toggle("vimcord-nerd", /nerd/i.test(opts.font || t.font || "JetBrainsMono Nerd Font"));
}

async function refresh() {
    try {
        info = await Native.readTerminal(opts.colorsFile);
    } catch (e) {
        logger.error("couldn't read the terminal's colors", e);
        info ??= { colors: {}, font: null, source: null };
    }
    if (style || timer) apply(info);
}

export function enable(o: { colorsFile: string; font: string; }) {
    opts = o;
    last = "";
    refresh();
    clearInterval(timer);
    timer = setInterval(refresh, 3000);
}

export function disable() {
    clearInterval(timer);
    timer = undefined;
    style?.remove();
    style = null;
    last = "";
    document.body.classList.remove("vimcord-look", "vimcord-nerd");
}
