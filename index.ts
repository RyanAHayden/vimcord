/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 RyanAHayden
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";
import { AccessibilityStore, FluxDispatcher, PendingReplyStore, SelectedChannelStore } from "@webpack/common";

import * as cursor from "./cursor";
import { keybind, logger } from "./discord";
import { closeHelp, helpOpen, hideWhichKey, scrollHelp, showWhichKey, toggleHelp } from "./hud";
import { byKeys, deleteSelection, isPrefix, searchKeys, yankSelection } from "./keymap";
import * as look from "./look";
import { isEditable, mode, somethingOpen } from "./mode";
import * as panes from "./panes";
import * as picker from "./picker";
import { applyHidden, applyLook, onResize, setOnSettingsChange, settings } from "./settings";
import * as statusbar from "./statusbar";
import managedStyle from "./style.css?managed";

let pending = "";
let whichKeyTimer: ReturnType<typeof setTimeout> | undefined;
let frame = 0;
let interval: ReturnType<typeof setInterval> | undefined;
// Discord focuses the message box whenever a channel opens; after a vimcord key opened it, that would throw you into
// insert mode, so for a moment afterwards that focus is undone
let keepNormalUntil = 0;

function reset() {
    pending = "";
    clearTimeout(whichKeyTimer);
    hideWhichKey();
}

// Brings everything that shows the mode up to date: the bottom bar, the faint-while-typing cursor, and the message
// cursor itself, which is always on screen in normal mode (like vim's) so it's clear where j/k and r will act.
function update() {
    frame = 0;
    const m = mode();
    const c = document.body.classList;
    c.toggle("vimcord-insert", m === "INSERT");
    c.toggle("vimcord-visual", m === "VISUAL");
    c.toggle("vimcord-has-bar", settings.store.statusBar);
    if ((m === "NORMAL" || m === "VISUAL") && panes.current() === "messages") cursor.place();
    panes.tick();
    // left on while a popup was open: off once it's closed
    keyboardModeOff();
    if (settings.store.statusBar) statusbar.render(m, panes.current(), pending, settings.store.statusBarHints);
    else statusbar.remove();
}

const schedule = () => void (frame ||= requestAnimationFrame(update));

// Discord's quick switcher (Space Space): typing filters, Ctrl-j/k or Ctrl-n/p move; Esc leaves the box for
// hjkl mode (j/k move, Enter opens, i or / types again, Esc closes) instead of closing it
function quickSwitcher() {
    const input = document.querySelector<HTMLInputElement>('[class*="quickswitcher_"] input[aria-controls]');
    const list = input && document.getElementById(input.getAttribute("aria-controls")!);
    return list?.getAttribute("role") === "listbox" ? input : null;
}

/** a key to the switcher's input, which takes it whether or not it has focus */
function sendKey(target: HTMLElement, key: string, keyCode: number) {
    const ev = new KeyboardEvent("keydown", { key, code: key, bubbles: true, cancelable: true });
    for (const prop of ["keyCode", "which"]) Object.defineProperty(ev, prop, { get: () => keyCode });
    (ev as any).vimcord = true;
    target.dispatchEvent(ev);
}

export const switcherNav = () => {
    const qs = quickSwitcher();
    return qs != null && document.activeElement !== qs;
};

function onSwitcherKey(e: KeyboardEvent, qs: HTMLInputElement) {
    const typing = document.activeElement === qs;
    const k = keyName(e);
    const down = k === "<C-j>" || k === "<C-n>" || !typing && (k === "j" || e.key === "ArrowDown");
    const up = k === "<C-k>" || k === "<C-p>" || !typing && (k === "k" || e.key === "ArrowUp");
    if (down || up) return consume(e), sendKey(qs, down ? "ArrowDown" : "ArrowUp", down ? 40 : 38);
    if (typing) {
        if (k === "<Esc>") consume(e), qs.blur();
        return;
    }
    consume(e);
    if (k === "<CR>" || k === "l" || k === "o") sendKey(qs, "Enter", 13);
    else if (k === "i" || k === "a" || k === "/") qs.focus();
    else if (k === "<Esc>" || k === "q") sendKey(qs, "Escape", 27);
}

// Discord's menus (right-click, the Active Now card's) already take the arrows: j/k/h/l are those, q closes
function onMenuKey(e: KeyboardEvent, menu: HTMLElement) {
    const arrows: Record<string, [string, number]> = { j: ["ArrowDown", 40], k: ["ArrowUp", 38], h: ["ArrowLeft", 37], l: ["ArrowRight", 39], q: ["Escape", 27] };
    const arrow = arrows[keyName(e) ?? ""];
    if (!arrow) return;
    consume(e);
    const active = document.activeElement as HTMLElement | null;
    sendKey(active && menu.contains(active) ? active : menu, ...arrow);
}

const PROFILE_ITEM = "data-vimcord-profile-item";

// what j/k/h/l move between in a profile: anything Tab would reach (buttons, links, tabs, mutual servers...),
// except text boxes (i goes there)
function profileItems(profile: HTMLElement) {
    return [...profile.querySelectorAll<HTMLElement>('button, a[href], [role="button"], [role="tab"], [role="link"], [role="listitem"][tabindex], [tabindex="0"]')]
        .filter(el => el.getClientRects().length && !el.closest("[disabled], [aria-disabled='true']")
            && !el.parentElement?.closest('button, a[href], [role="button"], [role="link"]') && !isEditable(el));
}

const center = (r: DOMRect) => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });

/** the item nearest `from` in a direction on screen, preferring ones in line with it */
function nearest(items: HTMLElement[], from: HTMLElement, dir: "up" | "down" | "left" | "right") {
    const a = center(from.getBoundingClientRect());
    let best: HTMLElement | undefined, bestScore = Infinity;
    for (const el of items) {
        if (el === from) continue;
        const b = center(el.getBoundingClientRect());
        const along = dir === "down" ? b.y - a.y : dir === "up" ? a.y - b.y : dir === "right" ? b.x - a.x : a.x - b.x;
        const across = dir === "up" || dir === "down" ? Math.abs(b.x - a.x) : Math.abs(b.y - a.y);
        if (along < 4) continue;
        const score = along + across * 2;
        if (score < bestScore) [best, bestScore] = [el, score];
    }
    return best;
}

/** Ctrl-h/l: the item across the split (the profile's column beside this one) nearest in height. The column is the
 * widest box around `from` that still has items wholly beside it. */
function acrossSplit(items: HTMLElement[], from: HTMLElement, root: HTMLElement, dir: "left" | "right") {
    let side: HTMLElement[] = [];
    for (let el: HTMLElement | null = from; el && el !== root; el = el.parentElement) {
        const r = el.getBoundingClientRect();
        const beside = items.filter(i => {
            const b = i.getBoundingClientRect();
            return dir === "right" ? b.left >= r.right - 1 : b.right <= r.left + 1;
        });
        if (!beside.length && side.length) break;
        if (beside.length) side = beside;
    }
    const { y } = center(from.getBoundingClientRect());
    return side.sort((a, b) => Math.abs(center(a.getBoundingClientRect()).y - y) - Math.abs(center(b.getBoundingClientRect()).y - y))[0];
}

const profileDirs: Record<string, "up" | "down" | "left" | "right"> = { j: "down", k: "up", h: "left", l: "right" };

// an open profile (popout or modal): j/k/h/l move between its buttons, links, tabs and servers by where they are on
// screen, Ctrl-h/l jump across its split, and Enter clicks; Ctrl-d/u scroll, H/L its tabs, i its message box, q closes. The item gets real
// focus, so Discord draws its focus ring, and Tab carries on from it.
function onProfileKey(e: KeyboardEvent, profile: HTMLElement) {
    const k = keyName(e);
    const active = document.activeElement as HTMLElement | null;
    const marked = profile.querySelector<HTMLElement>(`[${PROFILE_ITEM}]`);
    const current = active && active !== marked && profile.contains(active) && profileItems(profile).includes(active) ? active : marked;
    const split = k === "<C-h>" ? "left" : k === "<C-l>" ? "right" : undefined;
    const dir = profileDirs[k ?? ""] ?? split;
    if (dir) {
        consume(e);
        const items = profileItems(profile);
        if (!items.length) return;
        const next = !current || !items.includes(current) ? dir === "up" || dir === "left" ? items.at(-1) : items[0]
            : split ? acrossSplit(items, current, profile, split) : nearest(items, current, dir);
        if (!next) return;
        marked?.removeAttribute(PROFILE_ITEM);
        next.setAttribute(PROFILE_ITEM, "");
        next.focus({ preventScroll: true });
        next.scrollIntoView({ block: "nearest" });
        return;
    }
    if (k === "<CR>" && current) return consume(e), current.click();
    const scroll = { "<C-d>": 300, "<C-u>": -300, "<C-e>": 40, "<C-y>": -40 }[k ?? ""];
    if (scroll) return consume(e), panes.scrollable(profile)?.scrollBy({ top: scroll });
    if (k === "H" || k === "L") {
        consume(e);
        const tabs = [...profile.querySelectorAll<HTMLElement>('[role="tab"]')];
        const i = tabs.findIndex(t => t.getAttribute("aria-selected") === "true");
        if (tabs.length) tabs[(i + (k === "L" ? 1 : -1) + tabs.length) % tabs.length].click();
    } else if (k === "i" || k === "a") {
        consume(e);
        profile.querySelector<HTMLElement>('[role="textbox"], textarea, input[type="text"]')?.focus();
    } else if (k === "q") {
        consume(e);
        sendKey(profile, "Escape", 27);
    }
}

const isComposer = (el: Element) => !!el.closest('[class*="channelTextArea"]') && !el.closest('li[id^="chat-messages-"]');

function onFocusIn(e: FocusEvent) {
    const t = e.target as Element;
    if (Date.now() < keepNormalUntil && isEditable(t) && isComposer(t)) setTimeout(() => (t as HTMLElement).blur());
    schedule();
}

function updateWhichKey() {
    clearTimeout(whichKeyTimer);
    const delay = settings.store.whichKeyDelay;
    if (delay < 0) return;
    // like which-key: typing the whole sequence quickly never flashes the popup
    if (document.querySelector(".vimcord-whichkey")) showWhichKey(pending);
    else whichKeyTimer = setTimeout(() => showWhichKey(pending), delay);
}

/** the key in vim notation, or null for keys vimcord never touches (Cmd/Alt combos, Tab, arrows, F-keys...) */
function keyName(e: KeyboardEvent): string | null {
    if (e.metaKey || e.altKey) return null;
    const k = e.key;
    if (k === "Escape") return "<Esc>";
    if (e.ctrlKey) return k.length === 1 ? `<C-${k.toLowerCase()}>` : null;
    if (k === " ") return "<Space>";
    if (k === "Enter") return "<CR>";
    if (k === "Tab") return e.shiftKey ? "<S-Tab>" : "<Tab>";
    return k.length === 1 ? k : null;
}

function consume(e: KeyboardEvent) {
    e.preventDefault();
    e.stopImmediatePropagation();
}

// capture phase on window: runs before Discord's own keybinds and its type-anywhere-to-start-a-message
function onKeyDown(e: KeyboardEvent) {
    handleKey(e);
    schedule();
}

function handleKey(e: KeyboardEvent) {
    if ((e as any).vimcord) return;
    const qs = quickSwitcher();
    if (qs) return onSwitcherKey(e, qs);

    if (e.isComposing || e.repeat && !/^[jk]$|^<C-[dufbey]>$/.test(keyName(e) ?? "")) {
        if (helpOpen() || pending) consume(e);
        return;
    }

    if (picker.isOpen()) {
        if (e.key === "Enter") keepNormalUntil = Date.now() + 1500;
        if (picker.onKey(e)) consume(e);
        return;
    }

    if (helpOpen()) {
        consume(e);
        const k = keyName(e);
        if (k === "<Esc>" || k === "?" || k === "q") closeHelp();
        else if (k === "/") {
            closeHelp();
            searchKeys("");
        }
        else if (k === "j" || k === "<C-e>") scrollHelp(40);
        else if (k === "k" || k === "<C-y>") scrollHelp(-40);
        else if (k === "<C-d>" || k === "<C-f>") scrollHelp(300);
        else if (k === "<C-u>" || k === "<C-b>") scrollHelp(-300);
        return;
    }

    const target = document.activeElement;
    if (isEditable(target)) return onInsertKey(e, target);
    const menu = document.querySelector<HTMLElement>('[role="menu"]');
    if (menu) return reset(), onMenuKey(e, menu);
    // the whole dialog it's in: parts of the profile (mutual servers, friends) sit beside the profile itself
    const profile = document.querySelector<HTMLElement>(".user-profile-popout, .user-profile-modal, .user-profile-modal-v2");
    if (profile) return reset(), onProfileKey(e, profile.closest<HTMLElement>('[role="dialog"]') ?? profile);
    if (somethingOpen()) return reset();

    const key = keyName(e);
    if (key == null) return;
    // with Discord's keyboard mode allowed, Tab is Discord's (hopping between buttons)
    if ((key === "<Tab>" || key === "<S-Tab>") && settings.store.discordKeyboardMode) return;

    // Esc always stays in normal mode (Discord's would jump to the message box from a focused message). Each press
    // backs out of one thing: keys typed so far, visual mode, a list pane, a pending reply, then marks the channel read
    if (key === "<Esc>") {
        consume(e);
        const channelId = SelectedChannelStore.getChannelId();
        if (pending) reset();
        else if (cursor.visual()) cursor.endVisual();
        else if (panes.current() !== "messages") panes.focus("messages");
        else if (PendingReplyStore.getPendingReply(channelId)) FluxDispatcher.dispatch({ type: "DELETE_PENDING_REPLY", channelId });
        else keybind("MARK_CHANNEL_READ", "esc");
        return;
    }

    if (cursor.visual() && !pending) {
        if (key === "y") return consume(e), yankSelection();
        if (key === "d") return consume(e), deleteSelection();
        if (key === "o") return consume(e), cursor.swapEnds();
        if (key === "v" || key === "V") return consume(e), cursor.endVisual();
    }

    // Enter on a focused button or link in the chat (Tab navigation, or one just clicked) is Discord's: it clicks it
    if (!pending && key === "<CR>" && !panes.inList() && target?.closest('a, button, [role="button"]')) return;

    if (!pending && key === "?") {
        consume(e);
        return toggleHelp();
    }

    // / after a prefix searches what can follow it, like which-key's popup but by name
    if (pending && key === "/") {
        consume(e);
        const prefix = pending;
        reset();
        return searchKeys(prefix);
    }

    const seq = pending + key;
    if (isPrefix(seq)) {
        pending = seq;
        consume(e);
        return updateWhichKey();
    }

    const binding = byKeys.get(seq);
    const wasPending = pending;
    reset();

    if (binding) {
        consume(e);
        if (binding.in === "messages" && panes.current() !== "messages" || binding.in === "lists" && !panes.inList()) return;
        // visual mode only moves; acting on the selection is y and d
        if (cursor.visual() && binding.group !== "Moving") return;
        // bindings meant to start typing (i, a, r) keep the focus they give the message box
        keepNormalUntil = binding.insert ? 0 : Date.now() + 1500;
        try {
            binding.run();
        } catch (err) {
            logger.error(`${binding.keys} failed`, err);
        }
    } else if (wasPending || settings.store.swallowUnmapped && key.length === 1) {
        // a typo inside a sequence, or an unmapped letter: drop it rather than have Discord start a message with it
        consume(e);
    }
}

const suggestionsOpen = (target: HTMLElement) => !!document.querySelector('[role="listbox"]') || !!target.getAttribute("aria-activedescendant");

// Esc in a text box goes to normal mode, keeping the draft and any reply (a second Esc cancels that). Only open
// suggestions or a popup get it first, so Esc closes those. A message being edited keeps Discord's Esc: cancel the edit.
function leavesInput(target: HTMLElement) {
    if (!settings.store.escapeLeavesInput) return false;
    if (target.closest('li[id^="chat-messages-"]')) return false;
    return !suggestionsOpen(target) && !somethingOpen();
}

// in a text box: Esc back to normal mode, and Ctrl-n/p or Ctrl-j/k through the suggestions (mentions, emoji,
// commands, quick switcher)
function onInsertKey(e: KeyboardEvent, target: HTMLElement) {
    reset();
    // cancelling an edit is Discord's, but it then focuses the message box: stay in normal mode instead
    if (e.key === "Escape" && target.closest('li[id^="chat-messages-"]')) keepNormalUntil = Date.now() + 800;
    if (e.key === "Escape" && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey && leavesInput(target)) {
        consume(e);
        target.blur();
        return;
    }
    if (!e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
    const down = e.key === "n" || e.key === "j";
    const up = e.key === "p" || e.key === "k";
    if (!down && !up) return;
    // only with suggestions showing: otherwise these are macOS's own Ctrl-n/p/k text editing keys
    if (!suggestionsOpen(target)) return;
    consume(e);
    const key = down ? "ArrowDown" : "ArrowUp";
    const arrow = new KeyboardEvent("keydown", { key, code: key, bubbles: true, cancelable: true });
    // Discord's lists read keyCode, which a constructed event can't be given any other way
    for (const prop of ["keyCode", "which"]) Object.defineProperty(arrow, prop, { get: () => down ? 40 : 38 });
    target.dispatchEvent(arrow);
}

// with nothing open; in a popup, Tab between its buttons (with Discord's focus outline) is how you get around it
function keyboardModeOff() {
    if (settings.store.discordKeyboardMode || somethingOpen()) return;
    if (AccessibilityStore.keyboardModeEnabled) FluxDispatcher.dispatch({ type: "ACCESSIBILITY_KEYBOARD_MODE_DISABLE" });
}

function onMouseDown(e: MouseEvent) {
    cursor.onClick(e);
    panes.onClick(e);
    schedule();
}

function onWindowResize() {
    onResize();
    schedule();
}

export default definePlugin({
    name: "VimCord",
    description: "Vim-style keyboard navigation: lazygit-style panes (1-4), a message cursor (j/k, gg/G, Ctrl-d/u), message actions (r, e, dd, yy, +), hideable channel/server/member lists, a Space leader and which-key hints. Press ? for every binding.",
    authors: [{ name: "RyanAHayden", id: 265609899709300736n }],
    tags: ["Shortcuts", "Chat"],
    settings,
    managedStyle,

    start() {
        cursor.setScrollOff(settings.store.scrollOff);
        applyLook();
        look.windowButtons(!settings.store.hideWindowButtons);
        keyboardModeOff();
        panes.setOnChange(schedule);
        setOnSettingsChange(schedule);
        applyHidden();
        onResize();
        window.addEventListener("keydown", onKeyDown, true);
        document.addEventListener("mousedown", onMouseDown, true);
        document.addEventListener("focusin", onFocusIn, true);
        document.addEventListener("focusout", schedule, true);
        window.addEventListener("resize", onWindowResize);
        // popups closing and messages loading don't send anything vimcord listens to: catch up on those
        interval = setInterval(schedule, 500);
        schedule();
    },

    stop() {
        window.removeEventListener("keydown", onKeyDown, true);
        document.removeEventListener("mousedown", onMouseDown, true);
        document.removeEventListener("focusin", onFocusIn, true);
        document.removeEventListener("focusout", schedule, true);
        window.removeEventListener("resize", onWindowResize);
        clearInterval(interval);
        cancelAnimationFrame(frame);
        frame = 0;
        reset();
        closeHelp();
        picker.close();
        cursor.clear();
        panes.clear();
        statusbar.remove();
        look.disable();
        look.windowButtons(true);
        document.body.classList.remove("vimcord-insert", "vimcord-visual", "vimcord-has-bar");
    },

    flux: {
        // Discord's keyboard mode (Tab between buttons, focus outlines) gets in the way of vimcord's: switch it back off,
        // unless a popup is open
        ACCESSIBILITY_KEYBOARD_MODE_ENABLE() {
            setTimeout(keyboardModeOff);
        },
        CHANNEL_SELECT() {
            reset();
            cursor.clear();
            schedule();
        },
    },
});
