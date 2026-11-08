/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 RyanAHayden
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Everything vimcord needs from Discord's own code, found by what it does rather than by patching it. If Discord
// renames something, only the action using it stops working (with a toast), not the whole plugin.

import { Logger } from "@utils/Logger";
import { Channel, Message } from "@vencord/discord-types";
import { filters, findByCodeLazy, findByPropsLazy, findLazy, findStoreLazy, mapMangledModuleLazy } from "@webpack";
import { ChannelStore, ComponentDispatch, MediaEngineStore, MessageStore, SelectedChannelStore, showToast } from "@webpack/common";

export const logger = new Logger("VimCord");

// Discord's keybind table: { SERVER_NEXT: { binds: ["mod+alt+down", ...], action(event, combo) }, ... }
const Keybinds: Record<string, { binds: string[]; action?(e: any, combo: string): unknown; }> =
    findLazy(m => m?.SERVER_NEXT?.action && m?.CHANNEL_NEXT?.action && m?.QUICKSWITCHER_SHOW?.action);

// the helpers behind Discord's own message shortcuts (keyboard mode's r/e/p/backspace...). They take
// (channel, message, event) and read event.shiftKey the way Discord's shortcuts do: shift skips the confirm on
// delete/pin and the mention on reply.
const MessageShortcuts: Record<"reply" | "edit" | "delete" | "pin" | "forward" | "openThread" | "createThread", (channel: Channel, message: Message, event: any) => void> =
    mapMangledModuleLazy(["confirmPin(", "startEditMessageRecord("], {
        reply: filters.byCode(".FOCUS_CHANNEL_TEXT_AREA"),
        edit: filters.byCode("startEditMessageRecord("),
        delete: filters.byCode("confirmDelete("),
        pin: filters.byCode("confirmPin("),
        forward: filters.byCode('source:"message-actions"'),
        openThread: filters.byCode("castMessageIdAsChannelId("),
        createThread: filters.byCode('"Message")'),
    });

const markUnreadFn: (channelId: string, messageId: string) => Promise<void> = findByCodeLazy("Marking unread");

const VoiceActions: { disconnect(): void; } = findByPropsLazy("selectVoiceChannel", "disconnect");
const MediaActions: { setVideoEnabled(on: boolean): void; } = findByPropsLazy("toggleSelfMute", "setVideoEnabled");
const ApplicationStreamingStore = findStoreLazy("ApplicationStreamingStore") as { getCurrentUserActiveStream(): unknown; };
const stopOwnStream: () => void = findByCodeLazy("getCurrentUserActiveStream();null!=");

export const LayerStore = findStoreLazy("LayerStore") as { hasLayers(): boolean; };

const fakeEvent = (shiftKey = false) => ({
    preventDefault() { },
    stopPropagation() { },
    shiftKey,
    repeat: false,
    target: document.body,
});

export function toast(text: string, critical = false) {
    showToast({ text: `vimcord: ${text}`, ...(critical && { variant: "critical" }) } as any);
}

function unavailable(what: string, err: unknown) {
    logger.error(`${what} failed (Discord may have changed)`, err);
    toast(`${what} isn't available`, true);
}

/** Runs one of Discord's built-in keybind actions by name, e.g. "CHANNEL_NEXT". */
export function keybind(name: string, combo?: string) {
    try {
        const k = Keybinds[name];
        if (!k?.action) throw new Error(`no keybind ${name}`);
        k.action(fakeEvent(), combo ?? k.binds[0]);
    } catch (e) {
        unavailable(name.toLowerCase().replaceAll("_", " "), e);
    }
}

export function messageShortcut(name: keyof typeof MessageShortcuts, message: Message, shift = false) {
    const channel = ChannelStore.getChannel(message.channel_id);
    try {
        MessageShortcuts[name](channel, message, fakeEvent(shift));
    } catch (e) {
        unavailable(name, e);
    }
}

export async function markUnread(message: Message) {
    try {
        await markUnreadFn(message.channel_id, message.id);
    } catch (e) {
        unavailable("mark unread", e);
    }
}

export function openReactionPicker(message: Message) {
    ComponentDispatch.dispatchKeyed("TOGGLE_REACTION_POPOUT", message.id, { emojiPicker: true });
}

export function focusComposer() {
    ComponentDispatch.dispatchToLastSubscribed("TEXTAREA_FOCUS");
}

export function scrollToPresent() {
    ComponentDispatch.dispatchToLastSubscribed("SCROLLTO_PRESENT");
}

export function getMessage(messageId: string, channelId = SelectedChannelStore.getChannelId()): Message | undefined {
    return MessageStore.getMessage(channelId, messageId) ?? undefined;
}

export function hasMoreAfter(channelId = SelectedChannelStore.getChannelId()) {
    return !!(MessageStore.getMessages(channelId) as any)?.hasMoreAfter;
}

// voice: mute and deafen are Discord's keybind actions; the rest its voice/media functions

export const isStreaming = () => ApplicationStreamingStore.getCurrentUserActiveStream() != null;

export function toggleStream() {
    try {
        if (isStreaming()) return stopOwnStream();
        // starting one goes through Discord's own picker (screen, window, game), behind its button in the voice panel
        const button = [...document.querySelectorAll<HTMLElement>('[class*="panels_"] button')]
            .find(b => /share your screen|go live|stream/i.test(b.getAttribute("aria-label") ?? ""));
        if (button) button.click();
        else toast("join a voice channel to stream");
    } catch (e) {
        unavailable("streaming", e);
    }
}

export function toggleCamera() {
    try {
        MediaActions.setVideoEnabled(!MediaEngineStore.isVideoEnabled());
    } catch (e) {
        unavailable("camera", e);
    }
}

export function disconnectVoice() {
    try {
        VoiceActions.disconnect();
    } catch (e) {
        unavailable("disconnect", e);
    }
}
