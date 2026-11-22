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
import { LayerStore, toggleMembers } from "./discord";

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

/** a 1:1 DM is open, where pane 4 is the profile sidebar */
export const onDmProfile = () => !!ChannelStore.getChannel(SelectedChannelStore.getChannelId())?.isDM();

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
let hidden = { servers: false, channels: false, profile: false };
let zoomed = false;
let narrow = false;
let membersPeeking = false;
let lastDm = false;
// the member list / profile slides out for LEAVE_MS before it's let go, and Discord's list turned off if we turned it on
const LEAVE_MS = 200;
let leaving = false;
let wasFloating = false;
let pendingOff = false;
// a hidden list the mouse brought out by going to its edge of the window, shown until the mouse leaves it
let hoverPeek: "channels" | "members" | null = null;
let onChange = () => { };

export const current = () => focused;

/** keeps the member list's box marked as Discord re-renders it, and the highlight on the Friends page (called with
 * the rest of the mode display) */
export function tick() {
    // moving between a DM and a server changes whether the profile is what's hidden
    const dm = onDmProfile();
    if (dm !== lastDm) {
        lastDm = dm;
        applyClasses();
    }
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

export function setHidden(h: { servers: boolean; channels: boolean; profile: boolean; }) {
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

function wouldHide(p: Exclude<PaneId, "messages">) {
    if (p === "servers") return hidden.servers || zoomed;
    if (p === "channels") return hidden.channels || zoomed || narrow;
    return zoomed || narrow || hidden.profile && onDmProfile();
}

const peeking = (p: Exclude<PaneId, "messages">) => focused === p || hoverPeek === p || p === "members" && leaving;
const hides = (p: Exclude<PaneId, "messages">) => !peeking(p) && wouldHide(p);
const floatsMembers = () => (focused === "members" || hoverPeek === "members")
    && (wouldHide("members") || membersPeeking || hoverToggled);

function applyClasses() {
    const c = document.body.classList;
    const floating = floatsMembers();
    if (wasFloating && !floating && !leaving) {
        leaving = true;
        setTimeout(() => {
            if (pendingOff) {
                pendingOff = false;
                if (membersShown()) toggleMembers();
            }
            // stays faded out until Discord has dropped the list, or it would show docked for a frame
            setTimeout(() => {
                leaving = false;
                applyClasses();
            }, 100);
        }, LEAVE_MS);
    }
    wasFloating = floating;
    c.toggle("vimcord-hide-servers", hides("servers"));
    c.toggle("vimcord-hide-channels", hides("channels"));
    c.toggle("vimcord-hide-members", hides("members"));
    // a hidden list that's showing for focus or the mouse floats over the chat instead of pushing it aside
    c.toggle("vimcord-peek-servers", peeking("servers") && wouldHide("servers"));
    c.toggle("vimcord-peek-channels", peeking("channels") && wouldHide("channels"));
    c.toggle("vimcord-peek-members", floating || leaving);
    c.toggle("vimcord-leaving", leaving && !floating);
    document.body.style.setProperty("--vc-peek-left", `${right(lists.servers.container())}px`);
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
    if (box && !box.hasAttribute("data-vimcord-profile")) {
        box.setAttribute("data-vimcord-profile", "");
        // the column around it, if it's only that, so floating the profile frees the room it held
        let wrap = box.parentElement;
        for (let i = 0; i < 3 && wrap?.children.length === 1; i++, wrap = wrap.parentElement) {
            const w = wrap.getBoundingClientRect().width;
            if (w < 200 || w > 420) break;
            wrap.setAttribute("data-vimcord-profile-wrap", "");
        }
    }
    return box ?? null;
}

// Discord draws the DM profile the moment it's shown (a peek, or opening a DM): marking it in the same frame keeps it
// from showing docked, pushing the chat, until the next tick floats it
let profileWatch: MutationObserver | null = null;

export function watchProfile() {
    profileWatch ??= new MutationObserver(() => {
        if (!document.querySelector("[data-vimcord-profile]")) profileBox();
    });
    profileWatch.observe(document.body, { childList: true, subtree: true });
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
        pendingOff = true;
    }
    // back to it while it's still sliding out: it's still on, and ours to turn off again
    if (id === "members" && pendingOff) {
        pendingOff = false;
        membersPeeking = true;
    }
    applyClasses();

    if (id === "messages") return paint();
    if (id === "members" && !membersShown() && !onFriends()) {
        // no member list in this channel (or it's off): turn it on just while focused
        membersPeeking = true;
        toggleMembers();
        applyClasses();
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
        // clicking a channel opens it, and then you'd want j/k on its messages. This runs on mousedown: wait for the
        // click to land (it fires right after mouseup), or a narrow window hides the list out from under it
        if (id === "channels" && t.closest("a[href]")) {
            if (focused !== id) focus(id);
            return window.addEventListener("mouseup", () => setTimeout(() => focus("messages")), { capture: true, once: true });
        }
        if (focused !== id) focus(id);
        return requestAnimationFrame(paint);
    }
}

// how near its edge of the window the mouse brings out a hidden list: just left of the chat's avatars, and as far in
// from the right edge
const ZONE = 24;
const right = (el: Element | null | undefined) => el?.getClientRects().length ? el.getBoundingClientRect().right : 0;
let hoverToggled = false;

/** the hover zone's width: from the server bar (or the window's edge) to the chat's avatars */
function zone(serversEdge: number) {
    const avatar = document.querySelector('[data-list-id="chat-messages"] img[class*="avatar"]');
    const left = avatar?.getClientRects().length ? avatar.getBoundingClientRect().left : 0;
    return left > serversEdge ? left - serversEdge : ZONE;
}

/** a hidden channel list comes out when the mouse goes near the left edge (just past the chat's avatars), the member
 * list (a DM's profile) near the right edge, as far in; either goes away again once the mouse leaves it */
export function onMouseMove(e: MouseEvent) {
    const x = e.clientX;
    if (hoverPeek) {
        // a menu or popout from the list (right-click, a profile) keeps it out while the mouse is in it
        if ((e.target as Element | null)?.closest?.('[class*="layerContainer_"]')) return;
        const box = lists[hoverPeek].container()?.getBoundingClientRect();
        if (!box?.width) return;
        const inside = hoverPeek === "channels" ? x <= box.right + ZONE : x >= box.left - ZONE;
        if (inside) return;
        if (hoverPeek === "members" && hoverToggled && focused !== "members") pendingOff = true;
        hoverPeek = null;
        hoverToggled = false;
        return applyClasses();
    }
    // nowhere near either edge (the server bar is ~72px): most moves stop here, before any layout is read
    if (x > 200 && x < window.innerWidth - 200 || e.buttons || LayerStore.hasLayers()) return;
    const serversEdge = right(lists.servers.container());
    const w = zone(serversEdge);
    if (x < serversEdge + w && hides("channels") && lists.channels.container()) hoverPeek = "channels";
    else if (x > window.innerWidth - w && (hides("members") || !membersShown() && !onFriends())) {
        hoverPeek = "members";
        // the member list (a DM's profile) is off in Discord: on just while the mouse is in it, like focusing pane 4
        if (!membersShown()) {
            hoverToggled = true;
            toggleMembers();
        }
    } else return;
    applyClasses();
}

export function reset() {
    if (focused !== "messages") focus("messages");
    paint();
}

export function clear() {
    profileWatch?.disconnect();
    profileWatch = null;
    focused = "messages";
    membersPeeking = false;
    hoverPeek = null;
    hoverToggled = false;
    leaving = wasFloating = pendingOff = false;
    hidden = { servers: false, channels: false, profile: false };
    zoomed = narrow = false;
    applyClasses();
    paint();
}
