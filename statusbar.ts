/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 RyanAHayden
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// The bottom bar, lualine style: the mode, the focused pane, where you are, keys typed so far, and hints for what
// you can press here. It sits under Discord, which shrinks to make room.

import { ChannelStore, GuildStore, MediaEngineStore, RTCConnectionStore, SelectedChannelStore } from "@webpack/common";

import { selected } from "./cursor";
import { isStreaming } from "./discord";
import { Mode } from "./mode";
import { PaneId } from "./panes";

let bar: HTMLElement | null = null;
let last = "";

const HINTS: Record<string, string[][]> = {
    messages: [["j/k", "move"], ["r", "reply"], ["e", "edit"], ["+", "react"], ["i", "type"], ["1-4", "panes"], ["␣", "leader"], ["?", "help"]],
    list: [["j/k", "move"], ["⏎", "open"], ["esc", "back"], ["1-4", "panes"], ["?", "help"]],
    VISUAL: [["j/k", "extend"], ["y", "copy"], ["d", "delete"], ["o", "other end"], ["esc", "cancel"]],
    INSERT: [["esc", "normal"], ["⏎", "send"], ["^j/^k", "suggestions"]],
    SWITCHER: [["j/k", "move"], ["⏎", "open"], ["i", "type"], ["esc", "close"]],
    POPUP: [["esc", "close"], ["keys go to Discord", ""]],
};

function where() {
    const ch = ChannelStore.getChannel(SelectedChannelStore.getChannelId());
    if (!ch) return "";
    const guild = ch.guild_id ? GuildStore.getGuild(ch.guild_id)?.name : null;
    const name = ch.name || (ch.isDM() ? "DM" : "group");
    return guild ? `${guild} › #${name}` : `@${ch.rawRecipients?.map((r: any) => r.global_name ?? r.username).join(", ") || name}`;
}

/** voice state: the channel you're in, and muted / deafened / live / cam. Muted and deafened show even when not in a call,
 * since they carry into the next one. */
function voice(): [string, string][] {
    const out: [string, string][] = [];
    const id = RTCConnectionStore.isConnected() ? RTCConnectionStore.getChannelId() : null;
    if (id) out.push(["vimcord-bar-voice", "🔊 " + (ChannelStore.getChannel(id)?.name ?? "voice")]);
    if (MediaEngineStore.isSelfDeaf()) out.push(["vimcord-bar-off", "deafened"]);
    else if (MediaEngineStore.isSelfMute()) out.push(["vimcord-bar-off", "muted"]);
    if (id && isStreaming()) out.push(["vimcord-bar-live", "live"]);
    if (id && MediaEngineStore.isVideoEnabled()) out.push(["vimcord-bar-live", "cam"]);
    return out;
}

export function render(m: Mode, pane: PaneId, pending: string, hints: boolean) {
    const ctx = m === "NORMAL" ? pane === "messages" ? "messages" : "list" : m;
    if (m === "VISUAL") pending ||= `${selected().length} selected`;
    // the chat panel's label (nvim look) shows the channel, like nvim's winbar shows the file
    document.body.style.setProperty("--vc-chat-label", JSON.stringify(where().split(" › ").pop() || "chat"));
    const v = voice();
    const key = [m, pane, pending, hints, where(), v.join()].join("|");
    if (key === last && bar) return;
    last = key;

    bar ??= document.body.appendChild(Object.assign(document.createElement("div"), { className: "vimcord-bar" }));
    bar.dataset.mode = m === "SWITCHER" ? "normal" : m.toLowerCase();
    bar.replaceChildren();
    const span = (cls: string, text: string) => bar!.appendChild(Object.assign(document.createElement("span"), { className: cls, textContent: text }));

    span("vimcord-bar-mode", m === "SWITCHER" ? "NORMAL" : m);
    if (m === "NORMAL" || m === "VISUAL") span("vimcord-bar-pane", pane);
    if (m === "SWITCHER") span("vimcord-bar-pane", "switcher");
    span("vimcord-bar-where", where());
    span("vimcord-bar-fill", "");
    if (pending) span("vimcord-bar-pending", pending.replaceAll("<Space>", "␣"));
    for (const [cls, text] of v) span(cls, text);
    if (hints) {
        const h = span("vimcord-bar-hints", "");
        for (const [k, d] of HINTS[ctx]) {
            const item = h.appendChild(document.createElement("span"));
            item.append(Object.assign(document.createElement("b"), { textContent: k }), d ? " " + d : "");
        }
    }
}

export function remove() {
    document.body.style.removeProperty("--vc-chat-label");
    bar?.remove();
    bar = null;
    last = "";
}
