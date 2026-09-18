// Crypto Tracker — on-device BUSY Bar app (front 72x16)
// Native dev-firmware runtime: draws via fetch->/api/display/draw, input via
// listen("input"), fetches prices itself from CoinGecko over HTTPS (no feeder).
//
// Layout matches the original: coin icon (left), symbol + trend arrow + 24h %
// on the top row, big price on the bottom row. Encoder turns to switch coins,
// with a horizontal slide transition.

var APP = "community.crypto_tracker";
var DRAW_URL = "http://127.0.0.1/api/display/draw";

var COINS = [
  { sym: "BTC", id: "bitcoin", icon: "images/icon_btc.png" },
  { sym: "ETH", id: "ethereum", icon: "images/icon_eth.png" },
  { sym: "BNB", id: "binancecoin", icon: "images/icon_bnb.png" },
  { sym: "SOL", id: "solana", icon: "images/icon_sol.png" },
  { sym: "XRP", id: "ripple", icon: "images/icon_xrp.png" },
  { sym: "TRX", id: "tron", icon: "images/icon_trx.png" },
  { sym: "ZEC", id: "zcash", icon: "images/icon_zec.png" },
  { sym: "HYPE", id: "hyperliquid", icon: "images/icon_hype.png" },
  { sym: "DOGE", id: "dogecoin", icon: "images/icon_doge.png" },
  { sym: "XMR", id: "monero", icon: "images/icon_xmr.png" },
];

var PRICE_URL =
  "https://api.coingecko.com/api/v3/simple/price?ids=" +
  COINS.map(function (c) { return c.id; }).join(",") +
  "&vs_currencies=usd&include_24hr_change=true";

var REFRESH_MS = 20000;
var FLASH_MS = 1500;

var WHITE = "#F0F0F0FF";
var GREEN = "#22D244FF";
var RED = "#FF453AFF";
var GRAY = "#8C8C8CFF";

// layout offsets within a coin's 72px column (from the original)
var TX = 20;   // text x
var CX = 42;   // arrow x
var PX = 49;   // change % x

// static gray backdrop, drawn behind everything (does not slide)
// Explicit z_index so bg stays at the bottom even in frames that don't re-send
// it (the firmware persists ids and sorts by z_index; without this, coin
// elements default to z=0 and collide with bg, hiding the icons).
var BG = { id: "bg", type: "image", display: "front", x: 0, y: 0, path: "images/bg.png", z_index: 0 };

var idx = 0;
var curSlot = "a";   // which element slot currently holds the on-screen coin
var price = {};
var chg = {};
var flashColor = null;
var flashTimer = null;
var busy = false;         // true during a slide
var status = "Loading";

try {
  var saved = localStorage.getItem("idx");
  if (saved !== null && saved !== undefined) {
    var n = parseInt(saved, 10);
    if (n >= 0 && n < COINS.length) idx = n;
  }
} catch (e) {}

function fmtPct(v) {
  var s = v >= 0 ? "+" : "-";
  var a = v < 0 ? -v : v;
  return s + a.toFixed(1) + "%";
}
function fmtPrice(v) {
  if (v >= 1000) return v.toFixed(0);
  if (v >= 100) return v.toFixed(1);
  if (v >= 1) return v.toFixed(2);
  return v.toFixed(4);
}

// Build the elements for one coin at horizontal offset ox. `slot` keeps ids
// unique when two coins are on screen during a slide. `flash` colors the price.
function coinEls(i, ox, slot, flash, lite) {
  var c = COINS[i];
  var els = [];

  els.push({
    id: "ic" + slot, type: "image", display: "front",
    x: ox + 1, y: 1, path: c.icon, z_index: 10,   // 14px icon, 1px inset from edges
  });

  els.push({
    id: "sy" + slot, type: "text", display: "front",
    x: ox + TX, y: -1, align: "top_left",
    text: c.sym, font: "small", color: GRAY, z_index: 12,
  });

  // Trend is carried by the signed, colored % (no arrow image) so each slide
  // frame draws only the coin icon as an image -> higher framerate.
  var ch = chg[c.sym];
  if (ch !== undefined) {
    var col = ch > 0.05 ? GREEN : ch < -0.05 ? RED : GRAY;
    els.push({
      id: "ch" + slot, type: "text", display: "front",
      x: ox + CX, y: -1, align: "top_left",
      text: fmtPct(ch), font: "small", color: col, z_index: 12,
    });
  }

  var p = price[c.sym];
  var priceText, priceColor;
  if (p === undefined) {
    priceText = status || "...";
    priceColor = GRAY;
  } else {
    priceText = fmtPrice(p);
    priceColor = flash && flashColor ? flashColor : WHITE;
  }
  els.push({
    id: "pr" + slot, type: "text", display: "front",
    x: ox + TX, y: 6, align: "top_left",
    text: priceText, font: "normal", color: priceColor, z_index: 12,
  });

  return els;
}

function post(els) {
  return fetch(new Request(DRAW_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ application_name: APP, elements: els }),
  })).catch(function () {});
}

function render() {
  if (busy) return;
  // Draw the current coin in whichever slot it currently occupies.
  post([BG].concat(coinEls(idx, 0, curSlot, true)));
}

// Horizontal slide between coins. Time-based (consistent duration) and paced to
// draw completion (never races ahead of the device), so it's as smooth as the
// hardware allows. Frames are "lite" (no arrow/% ) to keep each draw fast.
var SLIDE_MS = 240;
function slide(to, dir) {
  if (busy || to === idx) return;
  busy = true;
  var from = idx;
  var outSlot = curSlot;                          // outgoing coin stays where it is
  var inSlot = curSlot === "a" ? "b" : "a";       // incoming coin uses the other slot
  var start = Date.now();
  function frame() {
    var p = (Date.now() - start) / SLIDE_MS;
    if (p > 1) p = 1;
    var e = 1 - (1 - p) * (1 - p);            // ease-out quad
    // Double-buffered: the on-screen (outgoing) coin never changes slots, and
    // the incoming coin arrives in the OTHER slot. So neither the start nor the
    // end hands the visible coin between element ids -> no blink at either edge.
    // BG persists (z_index pins it to the bottom), so it's never re-sent here.
    var inOx = Math.round(dir * 72 * (1 - e));     // incoming: dir*72 -> 0
    var outOx = Math.round(-dir * 72 * e);         // outgoing: 0 -> -dir*72
    var els = coinEls(to, inOx, inSlot, false)
      .concat(coinEls(from, outOx, outSlot, false));
    function step() {
      if (p >= 1) {
        idx = to;
        curSlot = inSlot;                          // incoming is now the resting coin
        busy = false;
        try { localStorage.setItem("idx", String(idx)); } catch (e) {}
        // Incoming already rests at 0 in its slot; park the outgoing slot off-screen.
        post(coinEls(idx, 0, curSlot, true).concat(coinEls(from, 400, outSlot, false)));
      } else {
        frame();   // next frame immediately after this draw lands (no artificial delay)
      }
    }
    post(els).then(step, step);
  }
  frame();
}

function switchCoin(dir) {
  var to = (idx + dir + COINS.length) % COINS.length;
  slide(to, dir);
}

function flash(color) {
  flashColor = color;
  if (flashTimer !== null) clearTimeout(flashTimer);
  flashTimer = setTimeout(function () {
    flashColor = null;
    flashTimer = null;
    render();
  }, FLASH_MS);
}

function refresh() {
  fetch(new Request(PRICE_URL, { headers: { accept: "application/json" } }))
    .then(function (r) { return r.json(); })
    .then(function (data) {
      for (var i = 0; i < COINS.length; i++) {
        var c = COINS[i];
        var row = data[c.id];
        if (!row) continue;
        var np = Number(row.usd);
        if (np === np) {
          if (c.sym === COINS[idx].sym && price[c.sym] !== undefined && np !== price[c.sym]) {
            flash(np > price[c.sym] ? GREEN : RED);
          }
          price[c.sym] = np;
        }
        var nv = Number(row.usd_24h_change);
        if (nv === nv) chg[c.sym] = nv;
      }
      status = "";
      render();
    })
    .catch(function () {
      if (price[COINS[idx].sym] === undefined) { status = "No net"; render(); }
    });
}

listen("input", function (event) {
  if (event.key === "encoder") {
    switchCoin(event.delta > 0 ? 1 : -1);
  } else if (event.key === "ok" && event.action === "press") {
    refresh();
  }
});

render();
refresh();
setInterval(refresh, REFRESH_MS);
