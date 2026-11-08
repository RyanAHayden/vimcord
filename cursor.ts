/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 RyanAHayden
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// The message cursor: one highlighted message in the open channel that j/k move and the message actions act on.
// It lives in the DOM (a data attribute on the message's <li>, which React leaves alone) and is tracked by message id,
// so it survives re-renders, new messages and older messages loading in above it.

import { Message } from "@vencord/discord-types";
import { MessageActions, MessageStore, SelectedChannelStore } from "@webpack/common";

import { getMessage, hasMoreAfter, scrollToPresent } from "./discord";

const ATTR = "data-vimcord-cursor";
const VISUAL = "data-vimcord-visual";

let cursorId: string | null = null;
// visual mode: the other end of the selection (the cursor is the moving end)
let anchorId: string | null = null;
let observed: Element | null = null;
const observer = new MutationObserver(() => paint());

export let scrollOff = 80;
export const setScrollOff = (px: number) => void (scrollOff = px);

function list() {
    return document.querySelector<HTMLElement>('main [data-list-id="chat-messages"]')
        ?? document.querySelector<HTMLElement>('[data-list-id="chat-messages"]');
}

function scroller() {
    return list()?.closest<HTMLElement>('[class*="scroller_"]') ?? null;
}

function items(): HTMLElement[] {
    const l = list();
    return l ? [...l.querySelectorAll<HTMLElement>(':scope > li[id^="chat-messages-"]')] : [];
}

const idOf = (li: Element) => li.id.slice(li.id.lastIndexOf("-") + 1);
const elOf = (id: string) => items().find(li => idOf(li) === id) ?? null;

function paint() {
    const l = list();
    if (l !== observed) {
        observer.disconnect();
        if (l) observer.observe(l, { childList: true });
        observed = l;
    }
    for (const el of document.querySelectorAll(`[${ATTR}]`))
        if (idOf(el) !== cursorId) el.removeAttribute(ATTR);
    const sel = new Set(anchorId ? selected().map(m => m.id) : []);
    for (const el of document.querySelectorAll(`[${VISUAL}]`))
        if (!sel.has(idOf(el))) el.removeAttribute(VISUAL);
    for (const el of items())
        if (sel.has(idOf(el)) && !el.hasAttribute(VISUAL)) el.setAttribute(VISUAL, "");
    if (!cursorId) return;
    const el = elOf(cursorId);
    if (el) {
        if (!el.hasAttribute(ATTR)) el.setAttribute(ATTR, "");
    } else if (l && !document.getElementById(`chat-messages-${SelectedChannelStore.getChannelId()}-${cursorId}`)) {
        // the message went away (deleted, or the channel changed under us): drop the cursor rather than guess
        cursorId = null;
        anchorId = null;
    }
}

export const active = () => cursorId != null && elOf(cursorId) != null;

export function clear() {
    cursorId = null;
    anchorId = null;
    paint();
    observer.disconnect();
    observed = null;
}

export function current(): Message | undefined {
    return cursorId && active() ? getMessage(cursorId) : undefined;
}

export const visual = () => anchorId != null;

/** v: start selecting from the message under the cursor */
export function startVisual() {
    if (!active()) move(0);
    anchorId = cursorId;
    paint();
}

export function endVisual() {
    anchorId = null;
    paint();
}

/** o in visual mode: jump to the other end of the selection */
export function swapEnds() {
    if (!anchorId || !cursorId) return;
    [anchorId, cursorId] = [cursorId, anchorId];
    paint();
    const el = elOf(cursorId);
    if (el) scrollTo(el, "nearest");
}

/** the selected messages, oldest first, from Discord's store so a selection scrolled partly off screen still counts */
export function selected(): Message[] {
    if (!anchorId || !cursorId) return [];
    const all: Message[] = (MessageStore.getMessages(SelectedChannelStore.getChannelId()) as any)?._array ?? [];
    const a = all.findIndex(m => m.id === anchorId), b = all.findIndex(m => m.id === cursorId);
    if (a < 0 || b < 0) return [];
    return all.slice(Math.min(a, b), Math.max(a, b) + 1).filter(m => !m.deleted);
}

function viewport() {
    const s = scroller();
    if (!s) return null;
    const r = s.getBoundingClientRect();
    return { s, top: r.top, bottom: r.bottom, height: r.height };
}

/** messages whose top half is on screen, top to bottom */
function visibleItems() {
    const v = viewport();
    if (!v) return [];
    return items().filter(li => {
        const r = li.getBoundingClientRect();
        return r.bottom > v.top + 4 && r.top < v.bottom - 4;
    });
}

function set(el: HTMLElement | null | undefined, reveal: "nearest" | "center" | "top" | "bottom" | false = "nearest") {
    if (!el) return;
    cursorId = idOf(el);
    paint();
    if (reveal) scrollTo(el, reveal);
}

function scrollTo(el: HTMLElement, how: "nearest" | "center" | "top" | "bottom") {
    const v = viewport();
    if (!v) return;
    const r = el.getBoundingClientRect();
    const off = Math.min(scrollOff, v.height / 3);
    let delta = 0;
    if (how === "center") delta = r.top + r.height / 2 - (v.top + v.height / 2);
    else if (how === "top") delta = r.top - v.top - off;
    else if (how === "bottom") delta = r.bottom - v.bottom + off;
    // a message taller than the screen lines up its top, so you start reading it from the beginning
    else if (r.top < v.top + off || r.height > v.height - 2 * off) delta = r.top - v.top - off;
    else if (r.bottom > v.bottom - off) delta = r.bottom - v.bottom + off;
    if (delta) v.s.scrollTop += delta;
}

/** Puts the cursor somewhere sensible if it isn't on screen: the newest visible message. Returns whether it moved. */
function ensure() {
    const vis = visibleItems();
    if (cursorId) {
        const el = elOf(cursorId);
        if (el && vis.includes(el)) return false;
    }
    set(vis.at(-1) ?? items().at(-1), "nearest");
    return true;
}

/** Shows the cursor on the newest message on screen if there isn't one, without scrolling. */
export function place() {
    if (active()) return;
    const vis = visibleItems();
    const el = vis.at(-1);
    if (el) set(el, false);
}

export function move(n: number) {
    if (ensure()) return;
    const all = items();
    const i = all.findIndex(li => idOf(li) === cursorId);
    const target = Math.max(0, Math.min(all.length - 1, i + n));
    set(all[target]);
    // at the oldest loaded message: scrolling to the top makes Discord load the next batch above it
    if (n < 0 && i + n < 0) {
        const s = scroller();
        if (s) s.scrollTop = 0;
    }
    if (n > 0 && i + n > all.length - 1 && hasMoreAfter()) {
        const s = scroller();
        if (s) s.scrollTop = s.scrollHeight;
    }
}

export function first() {
    const s = scroller();
    if (s) s.scrollTop = 0;
    set(items()[0], "top");
}

export function last() {
    if (hasMoreAfter()) {
        scrollToPresent();
        // Discord loads the newest messages asynchronously; put the cursor on the last one once they're in
        setTimeout(() => set(items().at(-1), "bottom"), 300);
        return;
    }
    set(items().at(-1), "bottom");
}

/** Ctrl-d/u/f/b: scroll by a fraction of the screen and carry the cursor along to the same spot on screen. */
export function page(fraction: number) {
    const v = viewport();
    if (!v) return;
    ensure();
    const el = cursorId ? elOf(cursorId) : null;
    const offset = el ? el.getBoundingClientRect().top - v.top : 0;
    v.s.scrollTop += v.height * fraction;
    requestAnimationFrame(() => {
        const all = items();
        const y = v.top + offset;
        // the message that's now where the cursor was; at either end of the history, the end message
        const hit = all.find(li => li.getBoundingClientRect().bottom > y + 1) ?? all.at(-1);
        const atTop = v.s.scrollTop <= 0;
        const atBottom = v.s.scrollTop + v.s.clientHeight >= v.s.scrollHeight - 1;
        set(fraction < 0 && atTop ? all[0] : fraction > 0 && atBottom ? all.at(-1) : hit, false);
    });
}

/** Ctrl-e/y: scroll a line without moving the cursor, unless it would leave the screen. */
export function scrollLines(n: number) {
    const v = viewport();
    if (!v) return;
    v.s.scrollTop += n * 40;
    if (!cursorId) return;
    requestAnimationFrame(() => {
        const vis = visibleItems();
        const el = elOf(cursorId!);
        if (!el || vis.includes(el) || !vis.length) return;
        set(n > 0 ? vis[0] : vis.at(-1), false);
    });
}

export function align(how: "center" | "top" | "bottom") {
    ensure();
    const el = cursorId ? elOf(cursorId) : null;
    if (el) scrollTo(el, how);
}

/** H/M/L: top, middle or bottom message on screen. */
export function screen(where: "top" | "middle" | "bottom") {
    const vis = visibleItems();
    if (!vis.length) return;
    set(where === "top" ? vis[0] : where === "bottom" ? vis.at(-1) : vis[Math.floor((vis.length - 1) / 2)]);
}

/** Moves to a message by id, jumping Discord there first if it isn't loaded (replies to old messages). */
export function goTo(channelId: string, messageId: string) {
    const el = elOf(messageId);
    if (el && channelId === SelectedChannelStore.getChannelId()) return set(el, "center");
    MessageActions.jumpToMessage({ channelId, messageId, flash: true, jumpType: "INSTANT" });
    let tries = 0;
    const wait = () => {
        const e = elOf(messageId);
        if (e) set(e, "center");
        else if (++tries < 20) setTimeout(wait, 100);
    };
    setTimeout(wait, 100);
}

/** Clicking a message moves the cursor there, while the cursor is showing. */
export function onClick(e: MouseEvent) {
    if (!cursorId) return;
    const li = (e.target as Element | null)?.closest?.<HTMLElement>('li[id^="chat-messages-"]');
    if (li && li.parentElement === list()) set(li, false);
}
