# vimcord

Vim-style Discord, as a [Vencord](https://github.com/Vendicated/Vencord) userplugin: lazygit-style panes, a message
cursor you move with `j`/`k`, NORMAL / INSERT / VISUAL modes with a lualine-style bar, which-key hints, a Space
leader, and an optional look that takes nvim's colors and your terminal's font (following Omarchy's current theme).

Press `?` in Discord for every binding, or `/` after any prefix to search them.

## Install

vimcord is a userplugin, so it needs Vencord built from source:

```sh
git clone https://github.com/Vendicated/Vencord && cd Vencord
pnpm install --frozen-lockfile
git clone https://github.com/RyanAHayden/vimcord src/userplugins/vimcord
pnpm build && pnpm inject
```

Then enable **VimCord** in Vencord's plugin settings and restart Discord. To update: `git -C src/userplugins/vimcord pull && pnpm build`.

## Modes

- **NORMAL**: vimcord has the keyboard. The message cursor is always on screen.
- **INSERT**: typing in a text box (`i`, `a`, `r` get you there). `Esc` always goes back to NORMAL, keeping your draft.
- **VISUAL**: `v` selects messages; move to extend, then `y` copies them or `d` deletes them (asks once).
- In NORMAL, each `Esc` backs out of one thing: keys typed so far, visual mode, a list pane, a pending reply, then marks the channel read.

## Keys

| Panes | |
|---|---|
| `1` `2` `3` `4` | focus servers, channels, messages, members |
| `Tab` / `Shift-Tab` | next / previous pane (wraps around) |
| `Ctrl-h` / `Ctrl-l` | pane to the left / right |
| `Enter` `l` `o` | open the highlighted server, channel or member |
| `/` | in the channels or servers pane: fuzzy-find in it |
| `Space e` / `Space m` | hide / show channels, members |
| `Space u` | UI toggles: `e` channels, `m` members, `s` servers, `h` channel header, `z` zoom |
| `Space z`, `Ctrl-w o` | zoom: only the chat |

A hidden pane shows while it's focused. The channel and member lists hide on their own in a narrow window.

| Moving | |
|---|---|
| `j` / `k` | down / up (messages, or the focused list) |
| `gg` / `G` | top / bottom |
| `Ctrl-d` `Ctrl-u` `Ctrl-f` `Ctrl-b` | half page / page |
| `Ctrl-e` / `Ctrl-y` | scroll a line |
| `H` `M` `L`, `zz` `zt` `zb` | screen top/middle/bottom, center/top/bottom the message |
| `gd` | go to the message this one replies to |

| On the message under the cursor | |
|---|---|
| `r` / `R` | reply / reply without ping |
| `e` | edit (yours) |
| `dd` | delete (asks first) |
| `yy` `yl` `yi` | copy text, link, ID |
| `+` | react |
| `p` `f` `t` `u` | pin, forward, open/start thread, mark unread |
| `o`, `gu` | open its first link, author's profile |

| Going places | |
|---|---|
| `J` / `K` | next / previous channel |
| `gt` / `gT` | next / previous server |
| `]u` `[u`, `]m` `[m` | next / previous unread channel, channel with a mention |
| `Ctrl-o` / `Ctrl-i` | back / forward |
| `gi` | first unread message |
| `Space Space`, `Space f` | quick switcher (`Ctrl-j`/`k` to move; `Esc` for `j`/`k`, `Enter`, `i` to type again) |
| `/`, `Space s s` / `Space s g` | search this channel / everywhere |
| ``Space ` `` | previous server |

| Voice | |
|---|---|
| `Space v m` / `Space v d` | mute / deafen |
| `Space v s` | share screen / stop |
| `Space v c` | camera |
| `Space v v` / `Space v x` | go to your voice channel / disconnect |

Plus `Space p` pins, `Space i` inbox, `Space a` attach a file, `Space r` mark server read, `Space s k` search keys.

## The look

Two settings (Settings → Plugins → VimCord), in any combination:

- **TUI style**: [system24](https://github.com/refact0r/system24)'s (refact0r, MIT) bordered panels with lazygit-style numbered labels, in your terminal's font. Off keeps Discord's layout: the bar, popups and keys stay, and themed colors use [midnight](https://github.com/refact0r/midnight-discord), the flat theme system24 is built on.
- **Colors**:
  - **Your theme** (default): **nvim's own highlight groups**. vimcord runs nvim headless with your config (about 0.4s, and only when your terminal's palette changes) and copies lualine's mode colors, CursorLine, Visual, FloatBorder and which-key's colors. Without nvim, your terminal's palette stands in: Omarchy's current theme (`~/.config/omarchy/current/theme/colors.toml`), else Ghostty (following `config-file` includes), Alacritty or Kitty, re-read every few seconds so switching Omarchy themes switches Discord's too. With no theme anywhere, it's Discord's own colors.
  - **A fixed theme**: Tokyo Night, Catppuccin Mocha, Gruvbox, Nord, Rosé Pine or Kanagawa, with their nvim colorschemes' mode and highlight colors.
  - **Discord's own colors**.

With a Nerd Font, the bar gets powerline arrows. The window's own buttons are hidden (a setting brings them back).

## Settings

TUI style, colors, colors file and font overrides, hiding channels/servers/header, the auto-hide width, the bar and
its hints, scrolloff, the which-key delay, whether stray letters are ignored in NORMAL, whether `Esc` leaves text
boxes, and whether Discord's own keyboard mode (Tab hopping between buttons, with focus outlines) may stay on. It's
off by default: vimcord switches it off and Tab cycles its panes instead.

## How it works

No patches to Discord's code: vimcord listens for keys before Discord does, and calls Discord's own keybind actions
and message helpers (found by what they do, so a Discord update breaks one action at a time, with a toast, rather
than the plugin). The message cursor and highlights are data attributes on Discord's elements.

## License

GPL-3.0-or-later, like Vencord.
