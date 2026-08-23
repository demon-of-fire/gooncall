# GoonCall

Private P2P voice calls & screen sharing for Windows. Discord-style calling —
ringing, accept/decline, chat, presence — minus the accounts, tracking, and Nitro upsells.
**No video calls. No invite codes. Ever.**

Formerly AeroCall (your data migrates automatically on first launch).

---

## Install & run

From source:

```
npm install
npm start
```

Windows installer: run **`gooncall setup.exe`**, pick a folder, done.
(Rebuild it yourself with `npm run dist`.)

> SmartScreen may warn because the exe is unsigned. Click *More info → Run anyway*.

## The 60-second guide

1. First launch gives you an **8-character code** (e.g. K7P2XQ9M) — that's your identity. Copy it with the clipboard button in the sidebar. A starter soundboard pack (airhorn, drum, laser, explosion, coin, tada & more) is generated for you.
2. Click **+ Add acquaintance**, paste *their* code. You'll see them as `[pending]` until they add you back.
3. When you're both running, green dots light up. Type in the DM that opens, or hit the phone icon.
4. Their side rings: **Accept / Decline**. Talk. Hang up whenever. That's it.

No codes per call. No links. No rooms. Friends are forever.

---

## Calling

| Thing | How |
|---|---|
| Start a call | Phone icon on a friend row, or **Call** button inside their chat |
| Answer | Ringing dialog → **Accept** (or Decline) |
| Mute mic | Header button or press **M** (works app-wide) |
| Global mute | Enable in Settings, then **Ctrl+Shift+M works even when unfocused/minimized** |
| Deafen | Header button or **D** — they see a "deafened" chip |
| Voice effects | **FX** button cycles Clean → Robot → Telephone → Cave → Deep, live mid-call |
| Soundboard | **Board** button; tiles play into the call. Keys **1–9, 0** fire clips while the board is open |
| Screen share | **Share** button → pick screen/window (+ system audio). Stop anytime |
| Voice quality | Opus tuned to 66 kbps with forward error correction + speech-optimized uplink — noticeably fuller than stock Discord-quality defaults |
| Voice effects | Robot / Telephone / Cave / Deep, hot-swappable mid-call |
| Share quality | Settings → Fluid 720p30 / Balanced 1080p15 / Crisp 1440p10 |
| Connection quality | The pill in the call header shows HD / OK / LAG — click it for bitrate/RTT/jitter/loss |
| Leave | Red **Leave** button. Either side leaving ends it for both |

Blips in your network auto-heal (ICE restart + 12 s grace) instead of dropping the call.
If someone's already in a call, callers hear "busy". No answer after 45 s = missed-call toast + notification.

### Soundboard tips

- Ships with a **bundled pack of 10 synthesized clips** (Airhorn, Drum hit, Snare, Laser, Explosion, Coin, Boop, Buzzer, Trombone, Tada) — generated locally, royalty-free forever.
- Add clips via **+ Add sounds** (mp3/wav/ogg/m4a/flac/webm) or dump files into your sounds folder (Settings → Sounds folder).
- Clips route through the call mix bus — your mic ducks automatically while a clip plays.
- "Hear clips locally" toggles local monitoring so you can hear what you're blasting.

## Messaging

- Text, **`**bold**`**, `*italic*`, `` `code` ``, clickable links (open outside the app)
- Emoji picker, reactions (hover a message), reply-to quoting (↩ or right-click)
- Right-click any message → Reply / Copy text / **Delete** (deleting removes it from both sides, replaced by "message deleted")
- In-chat search (🔍 icon) with match count
- Unread badges persist across restarts; window title shows `(n)`; taskbar flashes on new messages
- "New messages" divider marks where you left off; jump-to-latest arrow when scrolled up
- Drafts save per-friend, even if you close the app mid-sentence
- Drag files onto the chat or paste an image (Ctrl+V) to send instantly
- Voice messages: 🎤 button records, click again to send

### Delivery ticks (important)

| Tick | Meaning |
|---|---|
| ⏳ *(spinner)* | Queued on YOUR machine — theirs wasn't reachable yet. Retried every 12 s automatically, survives restarts |
| ✓ | Handed to their connection |
| ✓✓ | **Stored on their machine's disk.** Guaranteed by write-then-ack |

The only way a message fails permanently is if it never leaves your outbox — and it won't stop trying. Plus a subtle **Seen** label once they've had the chat open.

### File transfer

- Up to **4 GB per file**, P2P, no server ever touches it
- Big files stream straight to disk on the receiving end (no RAM hogging), with progress %, speed, and cancel buttons on both sides
- Small files/images keep inline previews; everything lands in `Settings → Received files`
- Images <200 KB stay viewable in chat history forever

## Social

- **Friend requests**: strangers who connect show up under Requests — accept or dismiss. Dismissed codes can't re-request.
- **Nicknames + notes**: ✎ in any chat header. Notes are private, shown as dotted underline.
- **Per-friend ringtones**: set in the rename dialog; falls back to your global ring (Classic/Futuristic/Marimba/Chirp/Silent).
- **Statuses**: set yours in Settings; friends see it next to your name. Idle (5 min no activity) shows amber dot.
- **Recent calls** panel on home — every call logged with result (completed/missed/declined/busy/no-answer) and one-click callback.

## Settings walkthrough (`Ctrl+,`)

- **Identity**: display name + status broadcast live to friends; your code never changes
- **Audio**: mic/speaker pickers (mic switches hot-mid-call), echo/noise/AGC, noise gate slider, mic test with live meter, ring volume, ringtone preview (change the dropdown to hear it)
- **Look**: 6 accent colors, AMOLED black mode
- **Life**: quiet hours (mutes notifications + ringtones during the window), notification toggle
- **System**: close-to-tray, global mute hotkey, start-with-Windows
- **Maintenance**: received/sounds folders, error logs, version + update check

Tray icon lives in the system tray — closing the window hides to tray by default (changeable). Quit from the tray menu actually quits.

### Window controls

The app is chromeless — there are no min/max/close buttons:

- **Move** — drag the top bar
- **Maximize/restore** — double-click the top bar
- **Minimize / restore / hide / quit** — right-click the top bar
- **Close** — Alt+F4 or right-click menu (goes to tray unless Quit)
- Everything also lives in the **tray icon**: left-click to show, right-click for Open/Quit

## Data & privacy

- Everything lives locally: `%APPDATA%\GoonCall\` (identity, friends, chats, history, sounds, received files)
- Media flows **directly peer-to-peer** over WebRTC (DTLS-SRTP encrypted). The PeerJS public broker handles only signaling/handshake and sees nothing but codes.
- **Portable mode**: drop an empty `portable.dat` next to the exe → all data stays beside it (USB-stick friendly).
- Old AeroCall installs are migrated automatically on first run.

## Building, releases & updates

```
npm install
npm run dist          # local build -> dist\gooncall setup.exe
```

**Shipping an update** (the easy way):

```
npm run release       # commits changes, bumps version, pushes tag
```

That triggers GitHub Actions, which builds the installer on Windows and publishes a
GitHub Release (`vX.Y.Z` with `gooncall setup.exe` + `latest.yml`). Installed apps
detect it via Settings → **Check updates** → download → *Install now*.

> The repo is **public**, so the in-app updater is fully live: releases published here are detected by every installed copy.

Automated end-to-end test (two instances calling each other for real — call, chat, file transfer, screen share):

```
# terminal 1                      # terminal 2
$env:SMOKE_PEER='A'; npm start    $env:SMOKE_PEER='B'; npm start
```

Expect `CALL_CONNECTED … chat-ok / FILE_OK / BIGFILE_DISK_OK / SHARE_LIVE`.

Quick boot check: `$env:SMOKE_TEST='1'; npm start` → prints `SMOKE_OK` plus a broker-connectivity probe.

## Troubleshooting

- **Can't connect at all** — both sides need UDP egress; STUN covers most NATs. Corporate symmetric NAT may need a TURN server added to `RTC_CFG` in `renderer/app.js`.
- **"X is offline" but they're not** — presence can lag ~20 s; the call dialer retries 3× before giving up. Messages don't care: they queue.
- **Mic doesn't work** — check Windows Settings → Privacy → Microphone (allow desktop apps), then GoonCall Settings → Test mic.
- **Something's broken weirdly** — Settings → Open logs, send `app.log`.
