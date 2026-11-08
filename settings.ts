/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 RyanAHayden
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

import * as cursor from "./cursor";
import * as panes from "./panes";

const applyHidden = () => panes.setHidden({ servers: settings.store.hideServers, channels: settings.store.hideChannels });

export function onResize() {
    const w = settings.store.autoHideWidth;
    panes.setNarrow(w > 0 && window.innerWidth < w);
}

let onSettingsChange = () => { };
export const setOnSettingsChange = (fn: () => void) => void (onSettingsChange = fn);

export const settings = definePluginSettings({
    hideChannels: {
        type: OptionType.BOOLEAN,
        description: "Hide the channel list (Space e). Pressing 2 shows it while it's focused",
        default: false,
        onChange: applyHidden,
    },
    hideServers: {
        type: OptionType.BOOLEAN,
        description: "Hide the server list (Space s). Pressing 1 shows it while it's focused",
        default: false,
        onChange: applyHidden,
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
    escapeLeavesInput: {
        type: OptionType.BOOLEAN,
        description: "Esc in the message box leaves it (keeping the draft) when Discord has nothing else to do with it, like closing a reply",
        default: true,
    },
});

export { applyHidden };
