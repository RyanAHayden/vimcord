/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 RyanAHayden
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import definePlugin from "@utils/types";
import { PendingReplyStore, SelectedChannelStore } from "@webpack/common";

import * as cursor from "./cursor";
import { logger } from "./discord";
import { closeHelp, helpOpen, hideWhichKey, scrollHelp, showWhichKey, toggleHelp } from "./hud";
import { byKeys, isPrefix } from "./keymap";
import { isEditable, mode, somethingOpen } from "./mode";
import * as panes from "./panes";
import * as picker from "./picker";
import { applyHidden, onResize, setOnSettingsChange, settings } from "./settings";
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
    c.toggle("vimcord-has-bar", settings.store.statusBar);
    if (m === "NORMAL" && panes.current() === "messages") cursor.place();
    if (settings.store.statusBar) statusbar.render(m, panes.current(), pending, settings.store.statusBarHints);
    else statusbar.remove();
}

const schedule = () => void (frame ||= requestAnimationFrame(update));

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
        else if (k === "j" || k === "<C-e>") scrollHelp(40);
        else if (k === "k" || k === "<C-y>") scrollHelp(-40);
        else if (k === "<C-d>" || k === "<C-f>") scrollHelp(300);
        else if (k === "<C-u>" || k === "<C-b>") scrollHelp(-300);
        return;
    }

    const target = document.activeElement;
    if (isEditable(target)) return onInsertKey(e, target);
    if (somethingOpen()) return reset();

    const key = keyName(e);
    if (key == null) return;

    if (key === "<Esc>") {
        if (pending) {
            reset();
            consume(e);
        } else if (panes.current() !== "messages") {
            panes.focus("messages");
            consume(e);
        }
        // otherwise Discord's Esc: mark the channel read
        return;
    }

    // in the messages pane, Enter on a focused button or link (Tab navigation) is Discord's: it clicks it
    if (!pending && key === "<CR>" && panes.current() === "messages") return;

    if (!pending && key === "?") {
        consume(e);
        return toggleHelp();
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
        const inMessages = panes.current() === "messages";
        if (binding.in === "messages" && !inMessages || binding.in === "lists" && inMessages) return;
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

// Esc in the message box leaves it, keeping the draft, unless Discord has a use for it first: closing suggestions or a
// popup, or cancelling a reply. (Discord marks every Esc there as handled, so this can't wait to see what it did.)
function leavesInput(target: HTMLElement) {
    if (!settings.store.escapeLeavesInput) return false;
    if (!isComposer(target)) return false;
    return !suggestionsOpen(target) && !somethingOpen() && !PendingReplyStore.getPendingReply(SelectedChannelStore.getChannelId());
}

// in a text box: Esc back to normal mode, and Ctrl-n/p or Ctrl-j/k through the suggestions (mentions, emoji,
// commands, quick switcher)
function onInsertKey(e: KeyboardEvent, target: HTMLElement) {
    reset();
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
        document.body.classList.remove("vimcord-insert", "vimcord-has-bar");
    },

    flux: {
        CHANNEL_SELECT() {
            reset();
            cursor.clear();
            schedule();
        },
    },
});
