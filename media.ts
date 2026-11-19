/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 RyanAHayden
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// GIFs and videos in the message under the cursor. With autoplay off, Discord plays a GIF while the mouse is over it,
// through React's onMouseEnter/Leave; the cursor fakes that hover. React builds enter/leave from mouseout's target and
// relatedTarget, so a mouseout from the message to its media enters only the media (not the message, whose hover
// toolbar would pop up), and one back leaves it.

import { Message } from "@vencord/discord-types";

const MEDIA = '[id^="message-accessories-"] :is(img, video)';

let hovered: { li: HTMLElement; media: HTMLElement[]; } | null = null;

const mouseout = (from: Element, to: Element) =>
    from.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, cancelable: true, relatedTarget: to, view: window }));

// GIFs from Tenor/Giphy are looping, muted <video>s; a real video doesn't loop
const gifVideos = (els: HTMLElement[]) => els.filter((el): el is HTMLVideoElement => el instanceof HTMLVideoElement && el.loop);

/** hover the GIFs in the cursor's message (li), leaving the last one's */
export function hover(li: HTMLElement | null) {
    if (hovered?.li === li) return;
    if (hovered) {
        // what's there now: hovering can swap a still image for the animated one
        const media = hovered.li.isConnected ? [...hovered.li.querySelectorAll<HTMLElement>(MEDIA)] : [];
        for (const el of new Set([...hovered.media, ...media])) if (el.isConnected) mouseout(el, hovered.li);
        for (const v of gifVideos(media)) if (!v.autoplay) v.pause();
    }
    hovered = null;
    if (!li) return;
    const media = [...li.querySelectorAll<HTMLElement>(MEDIA)];
    hovered = { li, media };
    for (const el of media) mouseout(li, el);
    // in case Discord's hover handling moved: a GIF video plays either way
    for (const v of gifVideos(media)) if (v.paused) v.play().catch(() => { });
}

/** whether the message has a video to play: an uploaded one, or an embed's (YouTube...) */
export function hasVideo(m: Message) {
    return m.attachments?.some(a => a.content_type?.startsWith("video/"))
        || m.embeds?.some(e => e.type === "video" || (e.video && e.type !== "gifv"));
}

/** Enter on a message with a video: plays it (again to pause). Returns false if there was nothing to play on screen. */
export function playVideo(li: HTMLElement) {
    const acc = li.querySelector<HTMLElement>('[id^="message-accessories-"]');
    if (!acc) return false;
    const video = [...acc.querySelectorAll("video")].find(v => !v.loop);
    if (video) {
        if (video.paused) video.play().catch(() => { });
        else video.pause();
        return true;
    }
    // an embed (YouTube...) shows a thumbnail with a play button until it's clicked, which loads the player
    const play = acc.querySelector<HTMLElement>('[class*="iconPlay"]')?.closest<HTMLElement>('[role="button"], button')
        ?? acc.querySelector<HTMLElement>('[class*="embedVideo"] [role="button"], [class*="embedVideo"] button');
    if (!play) return false;
    play.click();
    return true;
}
