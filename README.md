# BUSY Bar — Crypto Tracker

An on-device JavaScript app for the [BUSY Bar](https://busy.app) that shows live
crypto prices on the 72×16 front display. It runs **on the bar** (JerryScript)
and fetches prices **itself** over HTTPS — no companion app or host feeder
required.

![coins](icons/16px/spritesheet-160x16.png)

- **Coins:** BTC · ETH · BNB · SOL · XRP · TRX · ZEC · HYPE · DOGE · XMR
- **Source:** [CoinGecko](https://www.coingecko.com) public API (USD price + 24h change), one request every 20s
- **Controls:** turn the **encoder** to switch coins · press **OK** to force a refresh
- **Display:** coin icon (left), symbol + signed 24h % (top, green/red), price (bottom); smooth slide when switching coins

## Requirements

A BUSY Bar running firmware that includes the **on-device JS runner** — i.e. the
runtime that provides the global `listen("input", …)` and `fetch()` APIs and
lists JS apps in the **Apps** menu. (On official *release* firmware the JS SDK is
still "coming soon"; this app targets the dev/JS-runner firmware.)

## Install

USB (default address `10.0.4.20`):

```bash
./install_crypto.sh 10.0.4.20
```

Wi-Fi (set your HTTP-API password):

```bash
BAR_TOKEN=<http-access-password> ./install_crypto.sh <bar-ip>
```

The script uploads the app to `/ext/user_assets/community.crypto_tracker/` and
writes the `js_apps_enabled` flag. Then on the bar: **mode switch → Apps →
Crypto Tracker → Start**.

To update after changing files, just run the installer again and reopen the app.

## Layout

```
community.crypto_tracker/
├── appmeta/
│   ├── manifest.json          # id, name, heap_size_kib, etc.
│   ├── icon_front_8x8.png     # Apps-menu icon (front, colour)
│   └── icon_back_11x11.png    # Apps-menu icon (back, greyscale)
├── images/                    # bg + 14×14 coin icons
└── scripts/
    └── main.js                # the app
```

## How it works

- **Draw:** each frame is a `POST http://127.0.0.1/api/display/draw` with a JSON
  element list (loopback skips auth). Elements are keyed by `id`; the firmware
  merges by id, so the app uses explicit `z_index` and a fixed element roster.
- **Input:** `listen("input", …)` — the encoder reports `clockwise` /
  `counterclockwise`; OK/Start/Back report press/release.
- **Transition:** a time-based (~240 ms) horizontal slide, double-buffered across
  two element slots so the incoming coin never hands off ids mid-animation (no
  flicker). The background persists via `z_index` and isn't redrawn per frame, so
  the slide stays fast.
- **State:** the selected coin is remembered with `localStorage`.

## Icons

`icons/14px/` and `icons/16px/` hold the pixel-art coin sets (individual PNGs, a
`spritesheet`, and `icons.json` with per-pixel data). The app ships the 14px set
in `community.crypto_tracker/images/`.

Coin logos are trademarks of their respective projects and are included here only
as small pixel-art renditions for display on the device.

## Credits

Built for the BUSY Bar. Prices by CoinGecko.
