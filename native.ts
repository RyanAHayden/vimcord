/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 RyanAHayden
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

// Reads the terminal's colors and font for the nvim look, the way nvim gets them: Omarchy's current theme
// (colors.toml, or alacritty.toml in older themes), else the terminal's own config (Ghostty, Alacritty, Kitty).

import { IpcMainInvokeEvent } from "electron";
import { readFile } from "fs/promises";
import { homedir } from "os";
import { join } from "path";

export interface Terminal {
    /** background, foreground, accent, cursor, selection_background, selection_foreground, color0..color15 */
    colors: Record<string, string>;
    font: string | null;
    /** where the colors came from, for the settings page */
    source: string | null;
}

const home = homedir();
const config = (...p: string[]) => join(process.env.XDG_CONFIG_HOME || join(home, ".config"), ...p);

async function read(path: string) {
    try {
        return await readFile(path.replace(/^~(?=\/)/, home), "utf8");
    } catch {
        return null;
    }
}

const HEX = /#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i;
const ANSI = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"];

/** Omarchy's colors.toml: flat `key = "#hex"` lines */
function parseColorsToml(text: string) {
    const out: Record<string, string> = {};
    for (const m of text.matchAll(/^\s*([a-z0-9_]+)\s*=\s*["']?(#[0-9a-f]{3,8})/gim)) out[m[1].toLowerCase()] = m[2];
    return out;
}

/** alacritty.toml: [colors.primary] background/foreground, [colors.normal]/[colors.bright] black..white */
function parseAlacritty(text: string) {
    const out: Record<string, string> = {};
    let section = "";
    for (const line of text.split("\n")) {
        const sec = line.match(/^\s*\[([^\]]+)\]/);
        if (sec) { section = sec[1].trim(); continue; }
        const kv = line.match(/^\s*([a-z_]+)\s*=\s*["']?(#[0-9a-f]{3,8}|0x[0-9a-f]{6})/i);
        if (!kv) continue;
        const [, key, raw] = kv;
        const v = raw.replace(/^0x/i, "#");
        if (section === "colors.primary" && (key === "background" || key === "foreground")) out[key] = v;
        else if (section === "colors.cursor" && key === "cursor") out.cursor = v;
        else if (section === "colors.selection" && key === "background") out.selection_background = v;
        else if (section === "colors.selection" && key === "text") out.selection_foreground = v;
        else if (section === "colors.normal" && ANSI.includes(key)) out[`color${ANSI.indexOf(key)}`] = v;
        else if (section === "colors.bright" && ANSI.includes(key)) out[`color${ANSI.indexOf(key) + 8}`] = v;
    }
    return out;
}

/** ghostty: `background = #..`, `palette = 4=#..`, `cursor-color`, `selection-background` */
function parseGhostty(text: string) {
    const out: Record<string, string> = {};
    for (const line of text.split("\n")) {
        const m = line.match(/^\s*([a-z-]+)\s*=\s*(.+?)\s*$/);
        if (!m) continue;
        const [, key, val] = m;
        if (key === "palette") {
            const p = val.match(/^(\d+)\s*=\s*(#?[0-9a-f]{6})/i);
            if (p) out[`color${p[1]}`] = p[2].startsWith("#") ? p[2] : "#" + p[2];
            continue;
        }
        const hex = val.match(HEX)?.[0] ?? (/^[0-9a-f]{6}$/i.test(val) ? "#" + val : null);
        if (!hex) continue;
        if (key === "background" || key === "foreground") out[key] = hex;
        else if (key === "cursor-color") out.cursor = hex;
        else if (key === "selection-background") out.selection_background = hex;
        else if (key === "selection-foreground") out.selection_foreground = hex;
    }
    return out;
}

/** kitty.conf: `background #..`, `color4 #..`, `cursor #..` */
function parseKitty(text: string) {
    const out: Record<string, string> = {};
    for (const m of text.matchAll(/^\s*(background|foreground|cursor|selection_background|selection_foreground|color\d+)\s+(#[0-9a-f]{6})/gim))
        out[m[1].toLowerCase()] = m[2];
    return out;
}

const complete = (c: Record<string, string>) => !!(c.background && c.foreground && c.color4);

async function colors(custom: string): Promise<[Record<string, string>, string] | null> {
    const candidates: [string, (t: string) => Record<string, string>][] = [];
    if (custom) candidates.push([custom, custom.endsWith(".toml") && !custom.includes("alacritty") ? parseColorsToml : custom.includes("ghostty") ? parseGhostty : custom.includes("kitty") ? parseKitty : parseAlacritty]);
    candidates.push(
        [config("omarchy/current/theme/colors.toml"), parseColorsToml],
        [config("omarchy/current/theme/alacritty.toml"), parseAlacritty],
        [config("ghostty/config"), parseGhostty],
        [config("ghostty/config.ghostty"), parseGhostty],
        [join(home, "Library/Application Support/com.mitchellh.ghostty/config"), parseGhostty],
        [config("alacritty/alacritty.toml"), parseAlacritty],
        [config("kitty/kitty.conf"), parseKitty],
    );
    for (const [path, parse] of candidates) {
        const text = await read(path);
        if (!text) continue;
        const c = parse(text);
        if (complete(c)) return [c, path.replace(home, "~")];
    }
    return null;
}

async function font(): Promise<string | null> {
    const sources: [string, RegExp][] = [
        [config("ghostty/config"), /^\s*font-family\s*=\s*"?([^"\n]+?)"?\s*$/m],
        [config("ghostty/config.ghostty"), /^\s*font-family\s*=\s*"?([^"\n]+?)"?\s*$/m],
        [config("alacritty/alacritty.toml"), /\[font\.normal\][^[]*?family\s*=\s*"([^"]+)"/],
        [config("kitty/kitty.conf"), /^\s*font_family\s+(.+?)\s*$/m],
    ];
    for (const [path, re] of sources) {
        const m = (await read(path))?.match(re);
        if (m) return m[1].trim();
    }
    return null;
}

export async function readTerminal(_: IpcMainInvokeEvent, customColorsPath = ""): Promise<Terminal> {
    const [c, f] = await Promise.all([colors(customColorsPath), font()]);
    return { colors: c?.[0] ?? {}, source: c?.[1] ?? null, font: f };
}
