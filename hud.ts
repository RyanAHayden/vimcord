/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 RyanAHayden
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// The which-key popup (what can follow the keys typed so far) and the ? help sheet, as plain DOM so they don't
// depend on Discord's components.

import { bindings, continuations, prefixNames } from "./keymap";

let whichKey: HTMLElement | null = null;
let help: HTMLElement | null = null;

const pretty = (k: string) => k.replaceAll("<Space>", "␣ ").replace(/<C-(.)>/g, "Ctrl-$1").replaceAll("<CR>", "Enter");

function el(tag: string, cls: string, text?: string) {
    const e = document.createElement(tag);
    e.className = cls;
    if (text != null) e.textContent = text;
    return e;
}

/** shows what can follow `pending`; hides with nothing pending */
export function showWhichKey(pending: string) {
    if (!pending) return hideWhichKey();
    whichKey ??= document.body.appendChild(el("fieldset", "vimcord-float vimcord-whichkey"));
    whichKey.replaceChildren();
    const name = prefixNames[pending];
    whichKey.append(el("legend", "", ` ${pretty(pending).trim()}${name ? " " + name : ""} `));

    const grid = el("div", "vimcord-whichkey-grid");
    for (const [key, desc] of continuations(pending)) {
        const row = el("div", "vimcord-whichkey-row");
        row.append(el("kbd", "", pretty(key)), el("span", desc.startsWith("+") ? "vimcord-group" : "", desc));
        grid.append(row);
    }
    whichKey.append(grid);
    whichKey.append(el("div", "vimcord-whichkey-foot", "/ search"));
}

export function hideWhichKey() {
    whichKey?.remove();
    whichKey = null;
}

export const helpOpen = () => help != null;

export function toggleHelp() {
    if (help) return closeHelp();
    help = document.body.appendChild(el("div", "vimcord-help"));
    const sheet = help.appendChild(el("fieldset", "vimcord-float vimcord-help-sheet"));
    sheet.append(el("legend", "", " vimcord "));
    sheet.append(el("p", "vimcord-help-sub", "1-4 focus a pane; j/k and friends move in the focused one. v starts selecting messages: move to extend, then y copies or d deletes them. Esc always means normal mode: in a text box it leaves it (keeping the draft); in normal mode each press backs out of one thing (keys typed, visual mode, a list pane, a reply), then marks the channel read. In a text box, Ctrl-n/p or Ctrl-j/k move through suggestions."));

    const groups = new Map<string, typeof bindings>();
    for (const b of bindings) groups.set(b.group, [...(groups.get(b.group) ?? []), b]);
    const cols = sheet.appendChild(el("div", "vimcord-help-cols"));
    for (const [group, bs] of groups) {
        const sec = cols.appendChild(el("section", ""));
        sec.append(el("h3", "", group));
        // same description twice (i/a, ␣␣/␣f): one row
        const merged = new Map<string, string[]>();
        for (const b of bs) merged.set(b.desc, [...(merged.get(b.desc) ?? []), b.keys]);
        for (const [desc, keys] of merged) {
            const row = sec.appendChild(el("div", "vimcord-help-row"));
            const ks = row.appendChild(el("span", "vimcord-help-keys"));
            keys.forEach((k, i) => {
                if (i) ks.append(" ");
                ks.append(el("kbd", "", pretty(k)));
            });
            row.append(el("span", "", desc));
        }
    }
    sheet.append(el("p", "vimcord-help-sub", "? or Esc closes this"));
    help.addEventListener("mousedown", e => { if (e.target === help) closeHelp(); });
}

export function closeHelp() {
    help?.remove();
    help = null;
}

export function scrollHelp(dy: number) {
    help?.querySelector(".vimcord-help-sheet")?.scrollBy({ top: dy });
}
