/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 RyanAHayden
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { visual } from "./cursor";
import { LayerStore } from "./discord";

/** NORMAL: vimcord has the keyboard. VISUAL: selecting messages. INSERT: typing in a text box. POPUP: a modal, menu
 * or settings has it. */
export type Mode = "NORMAL" | "VISUAL" | "INSERT" | "POPUP" | "SWITCHER";

export function isEditable(el: Element | null): el is HTMLElement {
    if (!(el instanceof HTMLElement)) return false;
    return el.isContentEditable || el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement
        || (el instanceof HTMLInputElement && !["checkbox", "radio", "button", "submit", "range", "color", "file"].includes(el.type));
}

/** a modal, menu, popout or full-screen layer (settings) is up: it owns the keyboard */
export function somethingOpen() {
    return LayerStore.hasLayers() || !!document.querySelector('[role="dialog"], [role="alertdialog"], [role="menu"]');
}

export function mode(): Mode {
    if (isEditable(document.activeElement)) return "INSERT";
    // the quick switcher's hjkl mode
    if (document.querySelector('[role="dialog"] input[aria-controls]')) return "SWITCHER";
    if (somethingOpen()) return "POPUP";
    return visual() ? "VISUAL" : "NORMAL";
}
