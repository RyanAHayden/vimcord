/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 RyanAHayden
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { copyWithToast } from "@utils/discord";
import { Message } from "@vencord/discord-types";
import { openUserProfileModal, SelectedGuildStore, UserStore } from "@webpack/common";

import * as cursor from "./cursor";
import { focusComposer, keybind, markUnread, messageShortcut, openReactionPicker, toast } from "./discord";
import * as panes from "./panes";
import * as picker from "./picker";
import { settings } from "./settings";

export interface Binding {
    /** keys in vim notation: "gg", "<C-d>", "<Space>f" */
    keys: string;
    desc: string;
    group: string;
    /** only does something with this kind of pane focused: the messages, or a list (servers, channels, members) */
    in?: "messages" | "lists";
    /** puts you in the message box to type */
    insert?: boolean;
    run(): void;
}

// prefixes the which-key popup names instead of listing as "+N more"
export const prefixNames: Record<string, string> = {
    g: "goto",
    z: "scroll",
    y: "yank",
    d: "delete",
    "[": "prev",
    "]": "next",
    "<Space>": "leader",
    "<Space>w": "window",
    "<C-w>": "window",
};

const HAS_THREAD = 1 << 5;

/** runs fn on the message under the cursor; with no cursor showing, on the newest message on screen (delete and
 * pin still ask first, through Discord's own confirmation) */
function onMessage(fn: (m: Message) => void) {
    return () => {
        if (!cursor.current()) cursor.move(0);
        const m = cursor.current();
        if (m) fn(m);
    };
}

const own = (m: Message) => m.author.id === UserStore.getCurrentUser()?.id;

function link(m: Message) {
    const guild = SelectedGuildStore.getGuildId() ?? "@me";
    return `https://discord.com/channels/${guild}/${m.channel_id}/${m.id}`;
}

function firstUrl(m: Message): string | undefined {
    return m.content.match(/https?:\/\/[^\s<>|]+[^\s<>|.,:;"')\]]/)?.[0]
        ?? m.embeds?.find(e => e.url)?.url
        ?? m.attachments?.[0]?.url;
}

const openLink = onMessage(m => {
    const url = firstUrl(m);
    if (url) VencordNative.native.openExternal(url);
    else toast("no link in this message");
});

function toggle(key: "hideChannels" | "hideServers") {
    settings.store[key] = !settings.store[key];
}

// / searches what's focused: this server's channels (or DMs), your servers, or else Discord's message search
function search() {
    const p = panes.current();
    if (p === "channels") picker.open("channels", () => panes.focus("messages"));
    else if (p === "servers") picker.open("servers", () => panes.focus("channels"));
    else keybind("FOCUS_SEARCH", "mod+f");
}

export const bindings: Binding[] = [
    // panes
    { keys: "1", group: "Panes", desc: "Servers", run: () => panes.focus("servers") },
    { keys: "2", group: "Panes", desc: "Channels", run: () => panes.focus("channels") },
    { keys: "3", group: "Panes", desc: "Messages", run: () => panes.focus("messages") },
    { keys: "4", group: "Panes", desc: "Members", run: () => panes.focus("members") },
    { keys: "<C-h>", group: "Panes", desc: "Pane to the left", run: () => panes.step(-1) },
    { keys: "<C-l>", group: "Panes", desc: "Pane to the right", run: () => panes.step(1) },
    { keys: "<CR>", group: "Panes", desc: "Open (server, channel, member)", in: "lists", run: panes.open },
    { keys: "l", group: "Panes", desc: "Open (server, channel, member)", in: "lists", run: panes.open },
    { keys: "<Space>e", group: "Panes", desc: "Hide / show channels", run: () => toggle("hideChannels") },
    { keys: "<Space>s", group: "Panes", desc: "Hide / show servers", run: () => toggle("hideServers") },
    { keys: "<Space>m", group: "Panes", desc: "Hide / show members", run: () => keybind("TOGGLE_USERS") },
    { keys: "<Space>z", group: "Panes", desc: "Zoom: only the chat (again to undo)", run: panes.toggleZoom },
    { keys: "<C-w>o", group: "Panes", desc: "Zoom: only the chat (again to undo)", run: panes.toggleZoom },
    { keys: "<Space>wm", group: "Panes", desc: "Zoom: only the chat (again to undo)", run: panes.toggleZoom },

    // moving: the message cursor, or the highlight in a list pane
    { keys: "j", group: "Moving", desc: "Down", run: () => panes.move(1) },
    { keys: "k", group: "Moving", desc: "Up", run: () => panes.move(-1) },
    { keys: "gg", group: "Moving", desc: "Top (oldest loaded message)", run: () => panes.edge(false) },
    { keys: "G", group: "Moving", desc: "Bottom (newest message)", run: () => panes.edge(true) },
    { keys: "<C-d>", group: "Moving", desc: "Half page down", run: () => panes.page(0.5) },
    { keys: "<C-u>", group: "Moving", desc: "Half page up", run: () => panes.page(-0.5) },
    { keys: "<C-f>", group: "Moving", desc: "Page down", run: () => panes.page(1) },
    { keys: "<C-b>", group: "Moving", desc: "Page up", run: () => panes.page(-1) },
    { keys: "<C-e>", group: "Moving", desc: "Scroll down a line", in: "messages", run: () => cursor.scrollLines(1) },
    { keys: "<C-y>", group: "Moving", desc: "Scroll up a line", in: "messages", run: () => cursor.scrollLines(-1) },
    { keys: "H", group: "Moving", desc: "Top of screen", in: "messages", run: () => cursor.screen("top") },
    { keys: "M", group: "Moving", desc: "Middle of screen", in: "messages", run: () => cursor.screen("middle") },
    { keys: "L", group: "Moving", desc: "Bottom of screen", in: "messages", run: () => cursor.screen("bottom") },
    { keys: "zz", group: "Moving", desc: "Center the message", in: "messages", run: () => cursor.align("center") },
    { keys: "zt", group: "Moving", desc: "Message to top", in: "messages", run: () => cursor.align("top") },
    { keys: "zb", group: "Moving", desc: "Message to bottom", in: "messages", run: () => cursor.align("bottom") },
    {
        keys: "gd", group: "Moving", desc: "Go to the replied-to message", in: "messages", run: onMessage(m => {
            const ref = m.messageReference;
            if (ref?.message_id) cursor.goTo(ref.channel_id ?? m.channel_id, ref.message_id);
            else toast("not a reply");
        })
    },

    // acting on the message under the cursor
    { keys: "r", group: "Message", desc: "Reply", in: "messages", insert: true, run: onMessage(m => messageShortcut("reply", m)) },
    { keys: "R", group: "Message", desc: "Reply without ping", in: "messages", insert: true, run: onMessage(m => messageShortcut("reply", m, true)) },
    {
        keys: "e", group: "Message", desc: "Edit (your own)", in: "messages", run: onMessage(m => {
            if (own(m)) messageShortcut("edit", m);
            else toast("you can only edit your own messages");
        })
    },
    { keys: "dd", group: "Message", desc: "Delete (asks first)", in: "messages", run: onMessage(m => messageShortcut("delete", m)) },
    { keys: "+", group: "Message", desc: "Add reaction", in: "messages", run: onMessage(openReactionPicker) },
    { keys: "p", group: "Message", desc: "Pin / unpin (asks first)", in: "messages", run: onMessage(m => messageShortcut("pin", m)) },
    { keys: "f", group: "Message", desc: "Forward", in: "messages", run: onMessage(m => messageShortcut("forward", m)) },
    {
        keys: "t", group: "Message", desc: "Open thread (or start one)", in: "messages", run: onMessage(m => {
            messageShortcut(m.hasFlag(HAS_THREAD) ? "openThread" : "createThread", m);
        })
    },
    { keys: "u", group: "Message", desc: "Mark unread from here", in: "messages", run: onMessage(m => void markUnread(m)) },
    // in a list, o opens like Enter
    { keys: "o", group: "Message", desc: "Open the first link", run: () => panes.current() === "messages" ? openLink() : panes.open() },
    {
        keys: "gu", group: "Message", desc: "Author's profile", in: "messages", run: onMessage(m => {
            openUserProfileModal({ userId: m.author.id, guildId: SelectedGuildStore.getGuildId(), channelId: m.channel_id, messageId: m.id });
        })
    },
    { keys: "yy", group: "Message", desc: "Copy text", in: "messages", run: onMessage(m => copyWithToast(m.content, "Copied message text")) },
    { keys: "yl", group: "Message", desc: "Copy link", in: "messages", run: onMessage(m => copyWithToast(link(m), "Copied message link")) },
    { keys: "yi", group: "Message", desc: "Copy ID", in: "messages", run: onMessage(m => copyWithToast(m.id, "Copied message ID")) },

    // going places
    { keys: "J", group: "Going places", desc: "Next channel", run: () => keybind("CHANNEL_NEXT") },
    { keys: "K", group: "Going places", desc: "Previous channel", run: () => keybind("CHANNEL_PREV") },
    { keys: "gt", group: "Going places", desc: "Next server", run: () => keybind("SERVER_NEXT") },
    { keys: "gT", group: "Going places", desc: "Previous server", run: () => keybind("SERVER_PREV") },
    { keys: "]u", group: "Going places", desc: "Next unread channel", run: () => keybind("UNREAD_NEXT") },
    { keys: "[u", group: "Going places", desc: "Previous unread channel", run: () => keybind("UNREAD_PREV") },
    { keys: "]m", group: "Going places", desc: "Next channel with a mention", run: () => keybind("MENTION_CHANNEL_NEXT") },
    { keys: "[m", group: "Going places", desc: "Previous channel with a mention", run: () => keybind("MENTION_CHANNEL_PREV") },
    { keys: "<C-o>", group: "Going places", desc: "Back", run: () => keybind("NAVIGATE_BACK") },
    { keys: "<C-i>", group: "Going places", desc: "Forward", run: () => keybind("NAVIGATE_FORWARD") },
    { keys: "gi", group: "Going places", desc: "First unread message", run: () => keybind("JUMP_TO_FIRST_UNREAD") },
    { keys: "<Space><Space>", group: "Going places", desc: "Quick switcher", run: () => keybind("QUICKSWITCHER_SHOW") },
    { keys: "<Space>f", group: "Going places", desc: "Quick switcher", run: () => keybind("QUICKSWITCHER_SHOW") },
    { keys: "<Space>`", group: "Going places", desc: "Previous server (toggle)", run: () => keybind("TOGGLE_PREVIOUS_GUILD") },
    { keys: "/", group: "Going places", desc: "Search: messages, or the focused channel/server list", run: search },
    { keys: "<Space>/", group: "Going places", desc: "Search everywhere", run: () => keybind("FOCUS_SEARCH", "mod+shift+f") },

    // everything else
    { keys: "i", group: "Other", desc: "Type a message", insert: true, run: focusComposer },
    { keys: "a", group: "Other", desc: "Type a message", insert: true, run: focusComposer },
    { keys: "<Space>p", group: "Other", desc: "Pinned messages", run: () => keybind("TOGGLE_CHANNEL_PINS") },
    { keys: "<Space>i", group: "Other", desc: "Inbox", run: () => keybind("TOGGLE_INBOX") },
    { keys: "<Space>u", group: "Other", desc: "Upload a file", run: () => keybind("UPLOAD_FILE") },
    { keys: "<Space>r", group: "Other", desc: "Mark server read", run: () => keybind("MARK_SERVER_READ") },
];

/** "<Space>gg" -> ["<Space>", "g", "g"] */
export function tokens(keys: string): string[] {
    return keys.match(/<[^>]+>|./g) ?? [];
}

export const byKeys = new Map(bindings.map(b => [b.keys, b]));

/** true if some binding is longer than `pending` and starts with it */
export function isPrefix(pending: string) {
    return bindings.some(b => b.keys !== pending && b.keys.startsWith(pending));
}

/** what can follow `pending`: the next key with its description, or a group name if it leads further */
export function continuations(pending: string) {
    const next = new Map<string, string>();
    const plen = tokens(pending).length;
    for (const b of bindings) {
        if (!b.keys.startsWith(pending)) continue;
        const t = tokens(b.keys);
        if (t.length <= plen || t.slice(0, plen).join("") !== pending) continue;
        const k = t[plen];
        if (t.length === plen + 1) next.set(k, b.desc);
        else if (!next.has(k)) next.set(k, "+" + (prefixNames[pending + k] ?? "more"));
    }
    return [...next];
}
