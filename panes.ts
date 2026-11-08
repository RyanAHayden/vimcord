/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 RyanAHayden
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Panes, lazygit style: 1 servers, 2 channels, 3 messages, 4 members. The focused pane gets j/k/gg/G/Enter; the
// messages pane is the message cursor (cursor.ts), the others are a highlighted item in Discord's own list. A pane
// that's hidden shows while it's focused ("peeks") and hides again when focus leaves it.

import { SelectedChannelStore, SelectedGuildStore } from "@webpack/common";

import * as cursor from "./cursor";
import { keybind } from "./discord";

export type PaneId = "servers" | "channels" | "messages" | "members";
export const order: PaneId[] = ["servers", "channels", "messages", "members"];

const ITEM = "data-vimcord-item";
const FOCUS = "data-vimcord-pane";

interface ListPane {
    container(): HTMLElement | null;
    items(): HTMLElement[];
    /** the item for what's open now (current server/channel), where the highlight starts */
    selected(): string | null;
}

const visible = (el: HTMLElement) => el.getClientRects().length > 0;
const all = (sel: string) => [...document.querySelectorAll<HTMLElement>(sel)].filter(visible);

const lists: Record<Exclude<PaneId, "messages">, ListPane> = {
    servers: {
        container: () => document.querySelector<HTMLElement>('[data-list-id="guildsnav"]')?.closest("nav") ?? null,
        items: () => all('[data-list-id="guildsnav"] [data-list-item-id^="guildsnav___"]'),
        selected: () => `guildsnav___${SelectedGuildStore.getGuildId() ?? "home"}`,
    },
    channels: {
        container: () => document.querySelector<HTMLElement>('[class*="sidebarList_"]'),
        items: () => all('[class*="sidebarList_"] [data-list-item-id^="channels___"], [class*="sidebarList_"] [data-list-item-id^="private-channels-"]'),
        selected: () => {
            const id = SelectedChannelStore.getChannelId();
            return document.querySelector(`[data-list-item-id="channels___${id}"]`) ? `channels___${id}`
                : document.querySelector(`[data-list-item-id$="___${id}"][data-list-item-id^="private-channels-"]`)?.getAttribute("data-list-item-id") ?? null;
        },
    },
    members: {
        container: () => document.querySelector<HTMLElement>('[data-list-id^="members-"]')?.closest("aside") ?? null,
        items: () => all('[data-list-id^="members-"] [data-list-item-id]'),
        selected: () => null,
    },
};

let focused: PaneId = "messages";
const highlighted: Partial<Record<PaneId, string>> = {};

// what's hidden: by the settings (Space e / Space s), by zoom (only the chat), and by a narrow window (channels and
// members, so the chat gets the room). A focused pane always shows ("peeks").
let hidden = { servers: false, channels: false };
let zoomed = false;
let narrow = false;
let membersPeeking = false;
let onChange = () => { };

export const current = () => focused;
export const isZoomed = () => zoomed;
export const setOnChange = (fn: () => void) => void (onChange = fn);

/** Discord's member list is on for this channel (it may still be hidden by zoom or a narrow window) */
export function membersShown() {
    return lists.members.container() != null;
}

export function setHidden(h: { servers: boolean; channels: boolean; }) {
    hidden = h;
    applyClasses();
}

export function toggleZoom() {
    zoomed = !zoomed;
    if (zoomed) focus("messages");
    applyClasses();
}

export function setNarrow(n: boolean) {
    if (n === narrow) return;
    narrow = n;
    applyClasses();
}

function hides(p: Exclude<PaneId, "messages">) {
    if (focused === p) return false;
    if (p === "servers") return hidden.servers || zoomed;
    if (p === "channels") return hidden.channels || zoomed || narrow;
    return zoomed || narrow;
}

function applyClasses() {
    const c = document.body.classList;
    c.toggle("vimcord-hide-servers", hides("servers"));
    c.toggle("vimcord-hide-channels", hides("channels"));
    c.toggle("vimcord-hide-members", hides("members"));
    c.toggle("vimcord-zoom", zoomed);
    c.toggle("vimcord-list-focused", focused !== "messages");
    onChange();
}

function paint() {
    for (const el of document.querySelectorAll(`[${ITEM}], [${FOCUS}]`)) {
        el.removeAttribute(ITEM);
        el.removeAttribute(FOCUS);
    }
    if (focused === "messages") return;
    const pane = lists[focused];
    pane.container()?.setAttribute(FOCUS, "");
    const key = highlighted[focused];
    const el = key ? document.querySelector<HTMLElement>(`[data-list-item-id="${CSS.escape(key)}"]`) : null;
    el?.setAttribute(ITEM, "");
    el?.scrollIntoView({ block: "nearest" });
}

export function focus(id: PaneId) {
    const prev = focused;
    focused = id;
    if (prev === "members" && id !== "members" && membersPeeking) {
        membersPeeking = false;
        if (membersShown()) keybind("TOGGLE_USERS");
    }
    applyClasses();

    if (id === "messages") return paint();
    if (id === "members" && !membersShown()) {
        // no member list in this channel (or it's off): turn it on just while focused
        membersPeeking = true;
        keybind("TOGGLE_USERS");
    }
    // the list renders after a peek un-hides it, and a just-opened server's channels take a moment: wait for the
    // open channel to show up so the highlight starts there
    let tries = 0;
    const pick = () => {
        if (focused !== id) return;
        const pane = lists[id];
        const keys = pane.items().map(i => i.getAttribute("data-list-item-id")!);
        const sel = pane.selected();
        if (sel && !keys.includes(sel) && ++tries < 20) return void setTimeout(pick, 50);
        if (!highlighted[id] || !keys.includes(highlighted[id]!) || sel && keys.includes(sel) && tries) highlighted[id] = sel && keys.includes(sel) ? sel : keys[0];
        paint();
    };
    requestAnimationFrame(pick);
}

/** Ctrl-h / Ctrl-l: the pane to the left/right */
export function step(dir: 1 | -1) {
    const i = order.indexOf(focused);
    focus(order[Math.max(0, Math.min(order.length - 1, i + dir))]);
}

export function move(n: number) {
    if (focused === "messages") return cursor.move(n);
    const pane = lists[focused];
    const items = pane.items();
    if (!items.length) return;
    const keys = items.map(i => i.getAttribute("data-list-item-id")!);
    const i = keys.indexOf(highlighted[focused] ?? "");
    const next = i < 0 ? 0 : Math.max(0, Math.min(keys.length - 1, i + n));
    highlighted[focused] = keys[next];
    paint();
}

export function edge(last: boolean) {
    if (focused === "messages") return last ? cursor.last() : cursor.first();
    // virtualized lists only render what's near the screen, so scroll to the end first and pick once it's there
    const el = lists[focused].items()[0]?.closest<HTMLElement>('[class*="scroller"]');
    if (el) el.scrollTop = last ? el.scrollHeight : 0;
    requestAnimationFrame(() => {
        const items = lists[focused as Exclude<PaneId, "messages">].items();
        const target = last ? items.at(-1) : items[0];
        if (target) highlighted[focused] = target.getAttribute("data-list-item-id")!;
        paint();
    });
}

export function page(fraction: number) {
    if (focused === "messages") return cursor.page(fraction);
    const items = lists[focused].items();
    const h = items[0]?.getBoundingClientRect().height || 32;
    const box = lists[focused].container()?.getBoundingClientRect().height ?? 600;
    move(Math.round(box * fraction / h) || Math.sign(fraction));
}

/** Enter / l / o in a list pane: what clicking the item does, then on to the next pane where that makes sense */
export function open() {
    if (focused === "messages") return;
    const key = highlighted[focused];
    const el = key ? document.querySelector<HTMLElement>(`[data-list-item-id="${CSS.escape(key)}"]`) : null;
    if (!el) return;
    const from = focused;
    el.click();
    // a folder or category just opens or closes in place; a server or channel moves focus along to its contents
    const isGroup = /folder|category/i.test(el.getAttribute("aria-label") ?? "") || el.getAttribute("aria-expanded") != null;
    if (isGroup) return requestAnimationFrame(paint);
    if (from === "servers") focus("channels");
    else if (from === "channels") focus("messages");
    // members: the profile popout opens and takes the keyboard; focus stays here for when it closes
}

/** the pane under a mouse click follows it, so the keyboard picks up where you clicked */
export function onClick(e: MouseEvent) {
    const t = e.target as Element | null;
    if (!t?.closest) return;
    if (t.closest('main[class*="chatContent"]')) {
        if (focused !== "messages") focus("messages");
        return;
    }
    for (const id of ["servers", "channels", "members"] as const) {
        if (!lists[id].container()?.contains(t)) continue;
        const item = t.closest<HTMLElement>("[data-list-item-id]");
        if (item) highlighted[id] = item.getAttribute("data-list-item-id")!;
        // clicking a channel opens it, and then you'd want j/k on its messages
        if (id === "channels" && t.closest("a[href]")) return focus("messages");
        if (focused !== id) focus(id);
        return requestAnimationFrame(paint);
    }
}

export function reset() {
    if (focused !== "messages") focus("messages");
    paint();
}

export function clear() {
    focused = "messages";
    membersPeeking = false;
    hidden = { servers: false, channels: false };
    zoomed = narrow = false;
    applyClasses();
    paint();
}
