/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 RyanAHayden
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Panes, lazygit style: 1 servers, 2 channels, 3 messages, 4 members. The focused pane gets j/k/gg/G/Enter; the
// messages pane is the message cursor (cursor.ts), the others are a highlighted item in Discord's own list. A pane
// that's hidden shows while it's focused ("peeks") and hides again when focus leaves it. On the Friends page there's
// no chat, so the messages pane is a list too: the friends, with H/L for the tabs (Online, All, Pending...).

import { ChannelStore, SelectedChannelStore, SelectedGuildStore } from "@webpack/common";

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
    // in a DM, the profile sidebar stands where the member list would, and on the Friends page the Active Now column
    members: {
        container: () => document.querySelector<HTMLElement>('[data-list-id^="members-"]')?.closest("aside") ?? profileBox()
            ?? document.querySelector<HTMLElement>('[class*="nowPlayingColumn_"]'),
        items: () => all('[data-list-id^="members-"] [data-list-item-id]'),
        selected: () => null,
    },
};

const friendsTabs = () => document.querySelector<HTMLElement>('main [role="navigation"] [role="tablist"]');

const friends: ListPane = {
    container: () => document.querySelector<HTMLElement>('[data-list-id="people-list"]'),
    items: () => all('[data-list-id="people-list"] [data-list-item-id^="people-list___"]'),
    selected: () => null,
};

/** the Friends page is showing instead of a chat */
export const onFriends = () => friendsTabs() != null && !document.querySelector('[data-list-id="chat-messages"]');

// the Active Now cards, pane 4 on the Friends page; Enter opens a card's menu (message, join voice, profiles...)
const activity: ListPane = {
    container: () => document.querySelector<HTMLElement>('[class*="nowPlayingColumn_"]'),
    items: () => all('[class*="nowPlayingColumn_"] [aria-haspopup="menu"]'),
    selected: () => null,
};

/** the list j/k move in: the focused list pane, or on the Friends page the friends and the Active Now cards */
function activeList() {
    if (focused === "messages") return onFriends() ? friends : null;
    if (focused === "members" && onFriends()) return activity;
    return lists[focused];
}

/** j/k, Enter and o act on a list right now, not on the message cursor */
export const inList = () => activeList() != null;

const keyOf = (el: Element) => el.getAttribute("data-list-item-id")!;
// items by Discord's own list ids; the Active Now cards have none, so by position
const keysOf = (items: HTMLElement[]) => items.map((el, i) => el.getAttribute("data-list-item-id") ?? `#${i}`);
const find = (pane: ListPane, key: string | undefined) => {
    const items = pane.items();
    return key ? items[keysOf(items).indexOf(key)] ?? null : null;
};

/** the user behind the highlighted item: a member, a friend, or a DM's recipient */
export function highlightedUser(): string | undefined {
    if (!inList()) return;
    const key = highlighted[focused];
    // in a DM the members pane is the profile sidebar, with nothing to highlight: the DM's own user
    const id = key?.split("___")[1] ?? (focused === "members" ? SelectedChannelStore.getChannelId() : undefined);
    if (!id) return;
    if (focused !== "channels" && key) return id;
    const channel = ChannelStore.getChannel(id);
    return channel?.isDM() ? channel.getRecipientId() : undefined;
}

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

/** keeps the member list's box marked as Discord re-renders it, and the highlight on the Friends page (called with
 * the rest of the mode display) */
export function tick() {
    markMembersBox();
    profileBox();
    if (focused !== "messages" || !onFriends()) return;
    const first = friends.items()[0];
    if (!highlighted.messages?.startsWith("people-list___") && first) highlighted.messages = keyOf(first);
    if (highlighted.messages && !document.querySelector(`[${ITEM}]`)) paint();
}
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

// marks the member list's box for the look's "[4] members" label (CSS can only find it with a slow :has())
function markMembersBox() {
    const box = document.querySelector('[class*="membersWrap_"]')?.parentElement;
    if (box && !box.hasAttribute("data-vimcord-members-box")) box.setAttribute("data-vimcord-members-box", "");
    return box;
}

// marks the DM profile sidebar's box, pane 4 in a DM, for hiding and its label (the class is on the profile inside it)
function profileBox() {
    const profile = document.querySelector<HTMLElement>(".user-profile-sidebar");
    const box = profile?.closest<HTMLElement>("aside") ?? profile;
    if (box && !box.hasAttribute("data-vimcord-profile")) box.setAttribute("data-vimcord-profile", "");
    return box ?? null;
}

/** the element that scrolls inside el (or el itself) */
export const scrollable = (el: HTMLElement | null) => el && [el, ...el.querySelectorAll<HTMLElement>("*")]
    .find(e => e.scrollHeight > e.clientHeight + 1 && /auto|scroll/.test(getComputedStyle(e).overflowY));

function paint() {
    for (const el of document.querySelectorAll(`[${ITEM}], [${FOCUS}], [data-vimcord-pane-label]`)) {
        el.removeAttribute(ITEM);
        el.removeAttribute(FOCUS);
        el.removeAttribute("data-vimcord-pane-label");
    }
    const box = markMembersBox();
    if (focused === "members") box?.setAttribute("data-vimcord-pane-label", "");
    const pane = activeList();
    if (!pane) return;
    if (focused !== "messages") pane.container()?.setAttribute(FOCUS, "");
    const el = find(pane, highlighted[focused]);
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
    if (id === "members" && !membersShown() && !onFriends()) {
        // no member list in this channel (or it's off): turn it on just while focused
        membersPeeking = true;
        keybind("TOGGLE_USERS");
    }
    // the list renders after a peek un-hides it, and a just-opened server's channels take a moment: wait for the
    // open channel to show up so the highlight starts there
    let tries = 0;
    const pick = () => {
        const pane = activeList();
        if (focused !== id || !pane) return;
        const keys = keysOf(pane.items());
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

/** Tab / Shift-Tab: the next or previous pane, wrapping around */
export function cycle(dir: 1 | -1) {
    const i = order.indexOf(focused);
    focus(order[(i + dir + order.length) % order.length]);
}

export function move(n: number) {
    const pane = activeList();
    if (!pane) return cursor.move(n);
    const items = pane.items();
    // the DM profile has nothing to pick: j/k scroll it
    if (!items.length) return void scrollable(pane.container())?.scrollBy({ top: n * 40 });
    const keys = keysOf(items);
    const i = keys.indexOf(highlighted[focused] ?? "");
    const next = i < 0 ? 0 : Math.max(0, Math.min(keys.length - 1, i + n));
    highlighted[focused] = keys[next];
    paint();
}

export function edge(last: boolean) {
    const pane = activeList();
    if (!pane) return last ? cursor.last() : cursor.first();
    // virtualized lists only render what's near the screen, so scroll to the end first and pick once it's there
    const el = pane.items()[0]?.closest<HTMLElement>('[class*="scroller"]');
    if (el) el.scrollTop = last ? el.scrollHeight : 0;
    requestAnimationFrame(() => {
        const items = pane.items();
        const keys = keysOf(items);
        if (keys.length) highlighted[focused] = last ? keys.at(-1) : keys[0];
        paint();
    });
}

export function page(fraction: number) {
    const pane = activeList();
    if (!pane) return cursor.page(fraction);
    const items = pane.items();
    const h = items[0]?.getBoundingClientRect().height || 32;
    const box = pane.container()?.getBoundingClientRect().height ?? 600;
    move(Math.round(box * fraction / h) || Math.sign(fraction));
}

/** H / L on the Friends page: the previous / next tab, wrapping around */
export function tab(dir: 1 | -1) {
    const tabs = [...friendsTabs()?.querySelectorAll<HTMLElement>('[role="tab"]') ?? []];
    if (!tabs.length) return;
    const i = tabs.findIndex(t => t.getAttribute("aria-selected") === "true");
    tabs[(i + dir + tabs.length) % tabs.length].click();
    delete highlighted.messages;
}

/** Enter / l / o in a list pane: what clicking the item does, then on to the next pane where that makes sense */
export function open() {
    const pane = activeList();
    const el = pane && find(pane, highlighted[focused]);
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
    const row = t.closest('[data-list-item-id^="people-list___"]');
    if (row) {
        if (focused !== "messages") focus("messages");
        highlighted.messages = keyOf(row);
        return requestAnimationFrame(paint);
    }
    if (t.closest('main[class*="chatContent"]')) {
        if (focused !== "messages") focus("messages");
        return;
    }
    for (const id of ["servers", "channels", "members"] as const) {
        if (!lists[id].container()?.contains(t)) continue;
        const item = t.closest<HTMLElement>("[data-list-item-id]");
        if (item) highlighted[id] = keyOf(item);
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
