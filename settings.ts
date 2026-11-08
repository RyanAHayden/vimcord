/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 RyanAHayden
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import * as cursor from "./cursor";
import * as look from "./look";
import * as panes from "./panes";

function applyHidden() {
    panes.setHidden({ servers: settings.store.hideServers, channels: settings.store.hideChannels });
    document.body.classList.toggle("vimcord-hide-header", settings.store.hideHeader);
}

export function applyLook() {
    const { tuiStyle, colors, colorsFile, font } = settings.store;
    // Discord's layout in Discord's colors: nothing to restyle (vimcord's own pieces follow Discord's variables)
    if (!tuiStyle && colors === "discord") look.disable();
    else look.enable({ tui: tuiStyle, colors: colors ?? "auto", colorsFile, font });
}

export function onResize() {
    const w = settings.store.autoHideWidth;
    panes.setNarrow(w > 0 && window.innerWidth < w);
}

let onSettingsChange = () => { };
export const setOnSettingsChange = (fn: () => void) => void (onSettingsChange = fn);

export const settings = definePluginSettings({
    tuiStyle: {
        type: OptionType.BOOLEAN,
        description: "TUI style: system24's bordered, labelled panels like a terminal app. Off keeps Discord's layout (the bar, popups and keys stay)",
        default: true,
        onChange: () => applyLook(),
    },
    colors: {
        type: OptionType.SELECT,
        description: "Colors: your theme (nvim's colors, else your terminal's or Omarchy's), a fixed theme, or Discord's own",
        options: [
            { label: "Your theme (nvim / terminal / Omarchy)", value: "auto", default: true },
            ...look.themeOptions,
            { label: "Discord's own colors", value: "discord" },
        ],
        onChange: () => applyLook(),
    },
    colorsFile: {
        type: OptionType.STRING,
        description: "With \"Your theme\": the colors file to read. Empty: Omarchy's current theme, else your Ghostty, Alacritty or Kitty config. Or a path to a colors.toml, alacritty.toml, ghostty or kitty config",
        default: "",
        onChange: () => applyLook(),
    },
    font: {
        type: OptionType.STRING,
        description: "Font for the TUI style and themed colors. Empty: your terminal's",
        default: "",
        onChange: () => applyLook(),
    },
    hideChannels: {
        type: OptionType.BOOLEAN,
        description: "Hide the channel list (Space e). Pressing 2 shows it while it's focused",
        default: false,
        onChange: applyHidden,
    },
    hideServers: {
        type: OptionType.BOOLEAN,
        description: "Hide the server list (Space u s). Pressing 1 shows it while it's focused",
        default: false,
        onChange: applyHidden,
    },
    hideHeader: {
        type: OptionType.BOOLEAN,
        description: "Hide the channel header (name, pins, members, search) above the chat (Space u h). It shows while its search is in use",
        default: true,
        onChange: applyHidden,
    },
    hideWindowButtons: {
        type: OptionType.BOOLEAN,
        description: "Hide the window's close/minimize/maximize buttons (macOS traffic lights too); close with the keyboard instead",
        default: true,
        onChange: (v: boolean) => look.windowButtons(!v),
    },
    autoHideWidth: {
        type: OptionType.NUMBER,
        description: "Hide the channel and member lists while the window is narrower than this many pixels, so the chat gets the room (2 and 4 still show them). 0 turns it off",
        default: 1000,
        onChange: () => onResize(),
    },
    statusBar: {
        type: OptionType.BOOLEAN,
        description: "Show the bottom bar with the mode (NORMAL / INSERT), focused pane and keys typed so far",
        default: true,
        onChange: () => onSettingsChange(),
    },
    statusBarHints: {
        type: OptionType.BOOLEAN,
        description: "Show hints for what you can press in the bottom bar",
        default: true,
        onChange: () => onSettingsChange(),
    },
    scrollOff: {
        type: OptionType.NUMBER,
        description: "Pixels of context kept above and below the message cursor when scrolling (like vim's scrolloff)",
        default: 80,
        onChange: (v: number) => cursor.setScrollOff(v),
    },
    whichKeyDelay: {
        type: OptionType.NUMBER,
        description: "Milliseconds before the popup listing what can follow a prefix (g, y, Space...) shows. -1 never shows it",
        default: 300,
    },
    swallowUnmapped: {
        type: OptionType.BOOLEAN,
        description: "Ignore unmapped letters when not typing, instead of Discord starting a message with them. Press i to type",
        default: true,
    },
    discordKeyboardMode: {
        type: OptionType.BOOLEAN,
        description: "Let Discord's keyboard mode stay on (Tab hopping between buttons, with focus outlines). Off: Tab cycles vimcord's panes, and the outlines stay away",
        default: false,
    },
    escapeLeavesInput: {
        type: OptionType.BOOLEAN,
        description: "Esc in the message box goes to normal mode, keeping the draft and any reply (open suggestions and popups still close first)",
        default: true,
    },
});

export { applyHidden };
