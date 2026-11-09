/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 RyanAHayden
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// / in the channels or servers pane: a fuzzy picker over just that list (this server's channels, your DMs, your
// servers), built from Discord's stores rather than the on-screen list, so it finds things scrolled out of view.

import { Channel } from "@vencord/discord-types";
import { ChannelRouter, ChannelStore, GuildChannelStore, GuildStore, NavigationRouter, ReadStateStore, SelectedGuildStore, SortedGuildStore, UserStore } from "@webpack/common";

export interface Item {
    label: string;
    hint?: string;
    unread?: boolean;
    select(): void;
}

let root: HTMLElement | null = null;
let input: HTMLInputElement;
let list: HTMLElement;
let counter: HTMLElement;
let items: Item[] = [];
let shown: Item[] = [];
let sel = 0;
let afterSelect: () => void = () => { };

export const isOpen = () => root != null;

function dmName(c: Channel) {
    if (c.name) return c.name;
    return c.recipients.map(id => {
        const u = UserStore.getUser(id) as any;
        return u?.globalName ?? u?.username ?? id;
    }).join(", ");
}

function channelItems(): Item[] {
    const guildId = SelectedGuildStore.getGuildId();
    if (!guildId) {
        return ChannelStore.getSortedPrivateChannels().map(c => ({
            label: dmName(c),
            hint: c.isGroupDM() ? "group" : "DM",
            unread: ReadStateStore.hasUnread(c.id),
            select: () => ChannelRouter.transitionToChannel(c.id),
        }));
    }
    // favorites and the like aren't real servers: offer what the channel list shows
    if (!GuildStore.getGuild(guildId)) {
        return [...document.querySelectorAll<HTMLElement>('[class*="sidebarList_"] a[data-list-item-id]')].map(a => ({
            label: a.getAttribute("aria-label")?.split(/[,(]/)[0].trim() || a.textContent!.trim(),
            select: () => a.click(),
        }));
    }
    const { SELECTABLE = [], VOCAL = [] } = GuildChannelStore.getChannels(guildId) as any;
    return [...SELECTABLE, ...VOCAL].map(({ channel: c }: { channel: Channel; }) => ({
        label: (c.isVocal?.() ? "🔊 " : "# ") + c.name,
        hint: c.parent_id ? ChannelStore.getChannel(c.parent_id)?.name : undefined,
        unread: ReadStateStore.hasUnread(c.id),
        select: () => ChannelRouter.transitionToChannel(c.id),
    }));
}

function serverItems(): Item[] {
    return SortedGuildStore.getFlattenedGuildIds().map(id => GuildStore.getGuild(id)).filter(Boolean).map(g => ({
        label: g!.name,
        select: () => NavigationRouter.transitionToGuild(g!.id),
    }));
}

/** subsequence match, scoring consecutive runs and word starts higher; null for no match, else the score and which
 * characters matched (highlighted, like the picker in nvim) */
function match(text: string, q: string): { score: number; at: number[]; } | null {
    const t = text.toLowerCase();
    const at: number[] = [];
    let ti = 0, score = 0, run = 0;
    for (const ch of q.toLowerCase()) {
        const i = t.indexOf(ch, ti);
        if (i < 0) return null;
        run = i === ti ? run + 1 : 0;
        score += 1 + run * 2 + (i === 0 || /[\s\-_#]/.test(t[i - 1]) ? 3 : 0);
        at.push(i);
        ti = i + 1;
    }
    return { score: score - t.length * 0.01, at };
}

function label(text: string, at: number[]) {
    const span = Object.assign(document.createElement("span"), { className: "vimcord-picker-label" });
    let plain = "";
    const flush = () => { if (plain) span.append(plain); plain = ""; };
    [...text].forEach((ch, i) => {
        if (!at.includes(i)) return void (plain += ch);
        flush();
        span.append(Object.assign(document.createElement("mark"), { textContent: ch }));
    });
    flush();
    return span;
}

let matches = new Map<Item, number[]>();

function render() {
    const q = input.value.trim().replace(/\s+/g, "");
    matches = new Map();
    if (q) {
        const scored = items.map(it => [it, match(it.label, q) ?? (it.hint && match(it.hint.replace(/\s/g, ""), q) ? { score: 0, at: [] } : null)] as const).filter(([, m]) => m) as [Item, { score: number; at: number[]; }][];
        scored.sort((a, b) => b[1].score - a[1].score);
        shown = scored.map(([it, m]) => (matches.set(it, m.at), it));
    } else shown = items;
    sel = Math.min(sel, Math.max(0, shown.length - 1));
    counter.textContent = `${shown.length}/${items.length}`;
    list.replaceChildren(...shown.slice(0, 50).map((it, i) => {
        const row = document.createElement("div");
        row.className = "vimcord-picker-row";
        if (i === sel) row.dataset.selected = "";
        if (it.unread) row.dataset.unread = "";
        row.append(Object.assign(document.createElement("span"), { className: "vimcord-picker-num", textContent: `${i + 1}.` }), label(it.label, matches.get(it) ?? []));
        if (it.hint) row.append(Object.assign(document.createElement("span"), { className: "vimcord-picker-hint", textContent: it.hint }));
        row.addEventListener("mousedown", e => {
            e.preventDefault();
            sel = i;
            choose();
        });
        return row;
    }));
    if (!shown.length) list.append(Object.assign(document.createElement("div"), { className: "vimcord-picker-empty", textContent: "no matches" }));
    list.querySelector("[data-selected]")?.scrollIntoView({ block: "nearest" });
}

export function open(kind: "channels" | "servers", then: () => void) {
    const guildId = SelectedGuildStore.getGuildId();
    const title = kind === "servers" ? "Servers" : !guildId ? "Direct Messages" : `Channels in ${GuildStore.getGuild(guildId)?.name ?? "Favorites"}`;
    openList(title, kind === "channels" ? channelItems() : serverItems(), then);
}

/** a picker over any list: what to show and what picking each does */
export function openList(title: string, list_: Item[], then: () => void) {
    close();
    items = list_;
    afterSelect = then;
    sel = 0;
    root = document.body.appendChild(Object.assign(document.createElement("div"), { className: "vimcord-picker" }));
    // a fieldset, so the title sits in the top border like nvim's floating windows
    const box = root.appendChild(Object.assign(document.createElement("fieldset"), { className: "vimcord-float vimcord-picker-box" }));
    box.append(Object.assign(document.createElement("legend"), { textContent: ` ${title} ` }));
    const prompt = box.appendChild(Object.assign(document.createElement("div"), { className: "vimcord-picker-prompt" }));
    prompt.append(Object.assign(document.createElement("span"), { className: "vimcord-picker-icon", textContent: "❯" }));
    input = prompt.appendChild(Object.assign(document.createElement("input"), { className: "vimcord-picker-input", spellcheck: false }));
    counter = prompt.appendChild(Object.assign(document.createElement("span"), { className: "vimcord-picker-count" }));
    list = box.appendChild(Object.assign(document.createElement("div"), { className: "vimcord-picker-list" }));
    input.addEventListener("input", () => { sel = 0; render(); });
    input.addEventListener("blur", () => setTimeout(() => { if (root && document.activeElement !== input) close(); }));
    root.addEventListener("mousedown", e => { if (e.target === root) close(); });
    render();
    input.focus();
}

export function close() {
    root?.remove();
    root = null;
}

function choose() {
    const it = shown[sel];
    close();
    if (!it) return;
    it.select();
    afterSelect();
}

/** keys while the picker's open; returns whether it used the key */
export function onKey(e: KeyboardEvent): boolean {
    const k = e.key;
    const ctrl = e.ctrlKey && !e.metaKey && !e.altKey;
    if (k === "Escape") close();
    else if (k === "Enter") choose();
    else if (k === "ArrowDown" || ctrl && (k === "n" || k === "j")) sel = Math.min(shown.length - 1, sel + 1);
    else if (k === "ArrowUp" || ctrl && (k === "p" || k === "k")) sel = Math.max(0, sel - 1);
    else return false;
    if (root) render();
    return true;
}
