// kuronime.js
// StreamNative port of KuronimeProvider from cloudstream-extensions-uwu.
// Source: https://kuronime.sbs  (Indonesian anime, sub-Indo)
//
// The interesting bit: Kuronime obfuscates its stream URLs via an
// AES-CBC-encrypted JSON blob returned by animeku.org/api/v9/sources,
// wrapped in CryptoJS's OpenSSL passphrase format (ct + iv + salt fields,
// key derived via MD5-based EVP_BytesToKey with 32-byte AES-256 key).
//
// This file contains a pure-JS port of:
//   • MD5 (RFC 1321)
//   • EVP_BytesToKey with MD5 (OpenSSL / CryptoJS compatible)
//   • AES-128 encryption / AES-256 key schedule
//   • AES-CBC decryption with PKCS7 unpad
//
// End-to-end flow:
//   home()      → GET /anime/ list
//   search(q)   → GET ?s=q
//   load(url)   → parse .listeps / eps a
//   loadLinks() → extract `_0xa100d42aa = "..."` script variable
//                 → POST animeku.org/api/v9/sources { id }
//                 → base64Decode → JSON { ct, iv, s }
//                 → decrypt with passphrase "3&!Z0M,VIZ;dZW=="
//                 → { token, src: "https://.../index.m3u8" }

const metadata = {
  name: "Kuronime",
  description: "Anime subtitle Indonesia. Ported from cloudstream-extensions-uwu — includes AES-CBC key-derivation for the encrypted API response.",
  language: "id",
  authors: ["hexated (original)", "0xshitcode (port)"],
  status: 1,
  tvTypes: ["Anime", "AnimeMovie", "Ova"],
  iconUrl: "https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://kuronime.sbs&size=128",
  version: 1
};

var MAIN = "https://kuronime.sbs";
var ANIMEKU = "https://animeku.org";
var CRYPTO_PASSPHRASE = "3&!Z0M,VIZ;dZW==";

// ── shared helpers ────────────────────────────────────────────────────
function absolutize(u, base) {
  if (!u) return null;
  if (u.startsWith("//")) return "https:" + u;
  if (u.startsWith("http")) return u;
  if (u.startsWith("/")) return base + u;
  return base + "/" + u;
}
function firstMatch(re, s) { var m = re.exec(s); return m ? m[1] : null; }
function findAll(re, s) {
  var out = [], m, g = new RegExp(re.source, re.flags.indexOf('g') >= 0 ? re.flags : re.flags + 'g');
  while ((m = g.exec(s)) !== null) out.push(m);
  return out;
}
function decodeHtmlEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 10)); });
}
function b64Decode(s) { return typeof atob === "function" ? atob(s) : ""; }

// ── article card → SearchResult ────────────────────────────────────────
function articleToCard(html) {
  var m = /<a\s+href="([^"]+)"[^>]*\btitle="([^"]*)"/.exec(html);
  var href, title;
  if (m) { href = m[1]; title = m[2]; }
  else {
    href = firstMatch(/<a\s+href="([^"]+)"/, html);
    title = firstMatch(/<img[^>]+alt="([^"]+)"/, html);
  }
  if (!href || !title) return null;
  var poster = firstMatch(/<img[^>]+data-src="([^"]+)"/, html)
    || firstMatch(/<img[^>]+src="([^"]+)"/, html);
  return {
    title: decodeHtmlEntities(title).trim(),
    url: absolutize(href, MAIN),
    image: poster ? absolutize(poster, MAIN) : null,
    tvType: "Anime"
  };
}
function parseArticleList(html) {
  var out = [];
  var arts = findAll(/<article\b[^>]*>([\s\S]*?)<\/article>/, html);
  for (var i = 0; i < arts.length; i++) {
    var c = articleToCard(arts[i][1]);
    if (c) out.push(c);
  }
  var seen = {}, dedup = [];
  for (var j = 0; j < out.length; j++) {
    if (!seen[out[j].url]) { seen[out[j].url] = true; dedup.push(out[j]); }
  }
  return dedup;
}

// ── home() ─────────────────────────────────────────────────────────────
function home() {
  var rails = [
    { name: "Ongoing Anime",  path: "/anime/?status=ongoing&order=update" },
    { name: "Complete Anime", path: "/anime/?status=completed&order=update" },
    { name: "Latest",         path: "/anime/?order=update" }
  ];
  var out = [];
  for (var i = 0; i < rails.length; i++) {
    try {
      var r = http.get(MAIN + rails[i].path);
      if (r.status !== 200) continue;
      var items = parseArticleList(r.body);
      if (items.length > 0) out.push({ name: rails[i].name, items: items });
    } catch (e) { console.log("kuronime home:", rails[i].name, String(e)); }
  }
  return out;
}

// ── search(query) ──────────────────────────────────────────────────────
function search(query) {
  var q = (query || "").trim();
  if (q.length === 0) return [];
  var all = [];
  for (var i = 1; i <= 2; i++) {
    var r = http.get(MAIN + "/page/" + i + "/?s=" + encodeURIComponent(q));
    if (r.status !== 200) break;
    var items = parseArticleList(r.body);
    if (items.length === 0) break;
    for (var j = 0; j < items.length; j++) all.push(items[j]);
  }
  return all;
}

// ── load(url) ──────────────────────────────────────────────────────────
function load(url) {
  var r = http.get(url);
  if (r.status !== 200) throw new Error("Kuronime load HTTP " + r.status);
  var h = r.body;
  var title = firstMatch(/<h1\s+class="[^"]*entry-title[^"]*"[^>]*>([^<]+)</, h) || "Untitled";
  title = decodeHtmlEntities(title).trim();
  var poster = firstMatch(/<div\s+class="thumb"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/, h)
    || firstMatch(/<meta\s+property="og:image"\s+content="([^"]+)"/, h);
  var plot = firstMatch(/<div\s+class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/, h);
  if (plot) plot = decodeHtmlEntities(plot.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

  // Kuronime episode list uses `<span class="lchx"><a href="...">Episode N</a>`.
  var epLinks = findAll(
    /<span\s+class="lchx"[^>]*>\s*<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/,
    h
  );
  var episodes = [];
  var seen = {};
  for (var i = 0; i < epLinks.length; i++) {
    var href = absolutize(epLinks[i][1], MAIN);
    if (seen[href]) continue;
    seen[href] = true;
    var text = decodeHtmlEntities(epLinks[i][2].replace(/<[^>]+>/g, " ")).trim();
    var epM = /(\d+)/.exec(text);
    var epNum = epM ? parseInt(epM[1], 10) : (i + 1);
    episodes.push({
      name: text || ("Episode " + epNum),
      url: href,
      episode: epNum
    });
  }
  // Ordered newest → oldest on page; reverse so ep 1 is first.
  episodes.reverse();

  var isMovie = episodes.length <= 1;
  var base = {
    title: title, url: url,
    tvType: isMovie ? "AnimeMovie" : "Anime",
    image: poster, backdrop: poster,
    plot: plot, tags: []
  };
  if (isMovie && episodes.length === 1) {
    base.url = episodes[0].url;
  } else if (episodes.length > 0) {
    base.episodes = episodes;
  }
  return base;
}

// ── loadLinks(url) ─────────────────────────────────────────────────────
function loadLinks(url) {
  var r = http.get(url);
  if (r.status !== 200) throw new Error("Kuronime loadLinks HTTP " + r.status);
  var h = r.body;

  var id = firstMatch(/_0xa100d42aa\s*=\s*"([^"]+)"/, h);
  if (!id) throw new Error("Kuronime: id script variable not found in episode page");

  var api = http.post(ANIMEKU + "/api/v9/sources", {
    referer: MAIN + "/",
    headers: {
      "Origin": MAIN,
      "Content-Type": "application/json",
      "Accept": "application/json"
    },
    body: JSON.stringify({ id: id })
  });
  if (api.status !== 200) {
    throw new Error("Kuronime: animeku.org returned HTTP " + api.status);
  }

  var parsed = JSON.parse(api.body);
  if (!parsed.src) {
    throw new Error("Kuronime: API response missing `src` field");
  }
  // parsed.src is base64 of JSON: { ct, iv, s }
  var decoded = decryptCryptoJSPayload(b64Decode(parsed.src), CRYPTO_PASSPHRASE);
  var inner = JSON.parse(decoded);
  if (!inner.src) {
    throw new Error("Kuronime: decrypted payload has no stream URL");
  }
  var streamUrl = inner.src.replace(/\\\//g, "/");
  return [{
    name: "Kuroplayer",
    url: streamUrl,
    isM3u8: streamUrl.indexOf(".m3u8") !== -1,
    quality: "auto",
    referer: MAIN + "/",
    headers: { "Origin": ANIMEKU }
  }];
}

// ══════════════════════════════════════════════════════════════════════
// Pure-JS crypto primitives
// ══════════════════════════════════════════════════════════════════════

/// Decrypt a CryptoJS-style OpenSSL passphrase blob: { ct, iv, s }.
///   ciphertext = base64(ct)
///   iv         = hex(iv)     — 16 bytes
///   salt       = hex(s)      — 8 bytes
///   key        = EVP_BytesToKey(passphrase, salt, keyLen=32, ivLen=16)[0..32]
///   plaintext  = AES-256-CBC(key, iv, ciphertext) w/ PKCS7 unpad
function decryptCryptoJSPayload(payloadJson, passphrase) {
  var obj = JSON.parse(payloadJson);
  var ct = b64ToBytes(obj.ct);
  var iv = hexToBytes(obj.iv);
  var salt = hexToBytes(obj.s);
  var derived = evpBytesToKey(strToBytes(passphrase), salt, 32, 16);
  var key = derived.key;
  var pt = aesCbcDecrypt(key, iv, ct);
  return bytesToStr(pkcs7Unpad(pt));
}

// ── byte helpers ──────────────────────────────────────────────────────
function strToBytes(s) {
  var out = [];
  for (var i = 0; i < s.length; i++) out.push(s.charCodeAt(i) & 0xff);
  return out;
}
function bytesToStr(b) {
  var s = "";
  for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
  return s;
}
function hexToBytes(h) {
  var out = [];
  for (var i = 0; i < h.length; i += 2) out.push(parseInt(h.substr(i, 2), 16));
  return out;
}
function b64ToBytes(s) {
  var raw = b64Decode(s);
  return strToBytes(raw);
}
function pkcs7Unpad(b) {
  if (!b.length) return b;
  var pad = b[b.length - 1];
  if (pad < 1 || pad > 16 || pad > b.length) return b; // best-effort
  return b.slice(0, b.length - pad);
}

// ── MD5 (RFC 1321) ────────────────────────────────────────────────────
function md5(bytes) {
  // From https://en.wikipedia.org/wiki/MD5 pseudocode
  var s = [
    7,12,17,22,7,12,17,22,7,12,17,22,7,12,17,22,
    5, 9,14,20,5, 9,14,20,5, 9,14,20,5, 9,14,20,
    4,11,16,23,4,11,16,23,4,11,16,23,4,11,16,23,
    6,10,15,21,6,10,15,21,6,10,15,21,6,10,15,21
  ];
  var K = [
    0xd76aa478,0xe8c7b756,0x242070db,0xc1bdceee,0xf57c0faf,0x4787c62a,0xa8304613,0xfd469501,
    0x698098d8,0x8b44f7af,0xffff5bb1,0x895cd7be,0x6b901122,0xfd987193,0xa679438e,0x49b40821,
    0xf61e2562,0xc040b340,0x265e5a51,0xe9b6c7aa,0xd62f105d,0x02441453,0xd8a1e681,0xe7d3fbc8,
    0x21e1cde6,0xc33707d6,0xf4d50d87,0x455a14ed,0xa9e3e905,0xfcefa3f8,0x676f02d9,0x8d2a4c8a,
    0xfffa3942,0x8771f681,0x6d9d6122,0xfde5380c,0xa4beea44,0x4bdecfa9,0xf6bb4b60,0xbebfbc70,
    0x289b7ec6,0xeaa127fa,0xd4ef3085,0x04881d05,0xd9d4d039,0xe6db99e5,0x1fa27cf8,0xc4ac5665,
    0xf4292244,0x432aff97,0xab9423a7,0xfc93a039,0x655b59c3,0x8f0ccc92,0xffeff47d,0x85845dd1,
    0x6fa87e4f,0xfe2ce6e0,0xa3014314,0x4e0811a1,0xf7537e82,0xbd3af235,0x2ad7d2bb,0xeb86d391
  ];
  var a0 = 0x67452301, b0 = 0xefcdab89, c0 = 0x98badcfe, d0 = 0x10325476;

  // Pad
  var origLen = bytes.length;
  bytes = bytes.slice();
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  var bitLen = origLen * 8;
  for (var i = 0; i < 8; i++) bytes.push((bitLen / Math.pow(2, 8 * i)) & 0xff);

  // Process each 512-bit block
  for (var off = 0; off < bytes.length; off += 64) {
    var M = new Array(16);
    for (var i = 0; i < 16; i++) {
      M[i] = (bytes[off + i * 4]) |
             (bytes[off + i * 4 + 1] << 8) |
             (bytes[off + i * 4 + 2] << 16) |
             (bytes[off + i * 4 + 3] << 24);
      M[i] = M[i] >>> 0;
    }
    var A = a0, B = b0, C = c0, D = d0, F, g;
    for (var i = 0; i < 64; i++) {
      if (i < 16)      { F = (B & C) | ((~B >>> 0) & D); g = i; }
      else if (i < 32) { F = (D & B) | ((~D >>> 0) & C); g = (5 * i + 1) % 16; }
      else if (i < 48) { F = B ^ C ^ D;                 g = (3 * i + 5) % 16; }
      else             { F = C ^ (B | (~D >>> 0));      g = (7 * i)     % 16; }
      F = (F + A + K[i] + M[g]) >>> 0;
      A = D;
      D = C;
      C = B;
      var rot = s[i];
      B = (B + (((F << rot) | (F >>> (32 - rot))) >>> 0)) >>> 0;
    }
    a0 = (a0 + A) >>> 0; b0 = (b0 + B) >>> 0; c0 = (c0 + C) >>> 0; d0 = (d0 + D) >>> 0;
  }
  function u32Le(x) {
    return [x & 0xff, (x >>> 8) & 0xff, (x >>> 16) & 0xff, (x >>> 24) & 0xff];
  }
  return u32Le(a0).concat(u32Le(b0)).concat(u32Le(c0)).concat(u32Le(d0));
}

// EVP_BytesToKey with MD5, used by OpenSSL and CryptoJS to derive
// key+iv from a passphrase.
function evpBytesToKey(passphrase, salt, keyLen, ivLen) {
  var derived = [];
  var d = [];
  while (derived.length < keyLen + ivLen) {
    d = md5(d.concat(passphrase).concat(salt));
    derived = derived.concat(d);
  }
  return {
    key: derived.slice(0, keyLen),
    iv:  derived.slice(keyLen, keyLen + ivLen)
  };
}

// ── AES (128/192/256, CBC) ────────────────────────────────────────────
// Minimal AES: forward S-box for KeySchedule, inverse S-box for
// decryption, Rcon, mix/unmix columns. Enough for AES-256-CBC decrypt.
var SBOX = [
  0x63,0x7c,0x77,0x7b,0xf2,0x6b,0x6f,0xc5,0x30,0x01,0x67,0x2b,0xfe,0xd7,0xab,0x76,
  0xca,0x82,0xc9,0x7d,0xfa,0x59,0x47,0xf0,0xad,0xd4,0xa2,0xaf,0x9c,0xa4,0x72,0xc0,
  0xb7,0xfd,0x93,0x26,0x36,0x3f,0xf7,0xcc,0x34,0xa5,0xe5,0xf1,0x71,0xd8,0x31,0x15,
  0x04,0xc7,0x23,0xc3,0x18,0x96,0x05,0x9a,0x07,0x12,0x80,0xe2,0xeb,0x27,0xb2,0x75,
  0x09,0x83,0x2c,0x1a,0x1b,0x6e,0x5a,0xa0,0x52,0x3b,0xd6,0xb3,0x29,0xe3,0x2f,0x84,
  0x53,0xd1,0x00,0xed,0x20,0xfc,0xb1,0x5b,0x6a,0xcb,0xbe,0x39,0x4a,0x4c,0x58,0xcf,
  0xd0,0xef,0xaa,0xfb,0x43,0x4d,0x33,0x85,0x45,0xf9,0x02,0x7f,0x50,0x3c,0x9f,0xa8,
  0x51,0xa3,0x40,0x8f,0x92,0x9d,0x38,0xf5,0xbc,0xb6,0xda,0x21,0x10,0xff,0xf3,0xd2,
  0xcd,0x0c,0x13,0xec,0x5f,0x97,0x44,0x17,0xc4,0xa7,0x7e,0x3d,0x64,0x5d,0x19,0x73,
  0x60,0x81,0x4f,0xdc,0x22,0x2a,0x90,0x88,0x46,0xee,0xb8,0x14,0xde,0x5e,0x0b,0xdb,
  0xe0,0x32,0x3a,0x0a,0x49,0x06,0x24,0x5c,0xc2,0xd3,0xac,0x62,0x91,0x95,0xe4,0x79,
  0xe7,0xc8,0x37,0x6d,0x8d,0xd5,0x4e,0xa9,0x6c,0x56,0xf4,0xea,0x65,0x7a,0xae,0x08,
  0xba,0x78,0x25,0x2e,0x1c,0xa6,0xb4,0xc6,0xe8,0xdd,0x74,0x1f,0x4b,0xbd,0x8b,0x8a,
  0x70,0x3e,0xb5,0x66,0x48,0x03,0xf6,0x0e,0x61,0x35,0x57,0xb9,0x86,0xc1,0x1d,0x9e,
  0xe1,0xf8,0x98,0x11,0x69,0xd9,0x8e,0x94,0x9b,0x1e,0x87,0xe9,0xce,0x55,0x28,0xdf,
  0x8c,0xa1,0x89,0x0d,0xbf,0xe6,0x42,0x68,0x41,0x99,0x2d,0x0f,0xb0,0x54,0xbb,0x16
];
var INV_SBOX = new Array(256);
for (var i = 0; i < 256; i++) INV_SBOX[SBOX[i]] = i;
var RCON = [0x00,0x01,0x02,0x04,0x08,0x10,0x20,0x40,0x80,0x1b,0x36,0x6c,0xd8,0xab,0x4d];

function xtime(x) { return ((x << 1) ^ (((x >> 7) & 1) * 0x1b)) & 0xff; }
function gmul(a, b) {
  var r = 0;
  for (var i = 0; i < 8; i++) {
    if (b & 1) r ^= a;
    var hi = a & 0x80;
    a = (a << 1) & 0xff;
    if (hi) a ^= 0x1b;
    b >>= 1;
  }
  return r;
}

function keyExpansion(key) {
  var Nk = key.length / 4;                  // 4/6/8 for AES-128/192/256
  var Nr = Nk + 6;                          // 10/12/14 rounds
  var w = new Array(4 * (Nr + 1) * 4);
  for (var i = 0; i < key.length; i++) w[i] = key[i];
  for (var i = Nk; i < 4 * (Nr + 1); i++) {
    var t0 = w[(i - 1) * 4], t1 = w[(i - 1) * 4 + 1], t2 = w[(i - 1) * 4 + 2], t3 = w[(i - 1) * 4 + 3];
    if (i % Nk === 0) {
      // RotWord + SubWord + Rcon
      var s0 = SBOX[t1], s1 = SBOX[t2], s2 = SBOX[t3], s3 = SBOX[t0];
      s0 ^= RCON[i / Nk];
      t0 = s0; t1 = s1; t2 = s2; t3 = s3;
    } else if (Nk > 6 && i % Nk === 4) {
      t0 = SBOX[t0]; t1 = SBOX[t1]; t2 = SBOX[t2]; t3 = SBOX[t3];
    }
    w[i * 4]     = w[(i - Nk) * 4]     ^ t0;
    w[i * 4 + 1] = w[(i - Nk) * 4 + 1] ^ t1;
    w[i * 4 + 2] = w[(i - Nk) * 4 + 2] ^ t2;
    w[i * 4 + 3] = w[(i - Nk) * 4 + 3] ^ t3;
  }
  return { w: w, Nr: Nr };
}

function invShiftRows(state) {
  var s = state;
  var t = s[13]; s[13] = s[9];  s[9]  = s[5];  s[5]  = s[1];  s[1]  = t;
  t = s[10]; s[10] = s[2];  s[2]  = t;
  t = s[14]; s[14] = s[6];  s[6]  = t;
  t = s[3];  s[3]  = s[7];  s[7]  = s[11]; s[11] = s[15]; s[15] = t;
}
function invSubBytes(state) {
  for (var i = 0; i < 16; i++) state[i] = INV_SBOX[state[i]];
}
function addRoundKey(state, w, round) {
  for (var i = 0; i < 16; i++) state[i] ^= w[round * 16 + i];
}
function invMixColumns(state) {
  for (var c = 0; c < 4; c++) {
    var s0 = state[c * 4], s1 = state[c * 4 + 1], s2 = state[c * 4 + 2], s3 = state[c * 4 + 3];
    state[c * 4]     = gmul(s0, 0x0e) ^ gmul(s1, 0x0b) ^ gmul(s2, 0x0d) ^ gmul(s3, 0x09);
    state[c * 4 + 1] = gmul(s0, 0x09) ^ gmul(s1, 0x0e) ^ gmul(s2, 0x0b) ^ gmul(s3, 0x0d);
    state[c * 4 + 2] = gmul(s0, 0x0d) ^ gmul(s1, 0x09) ^ gmul(s2, 0x0e) ^ gmul(s3, 0x0b);
    state[c * 4 + 3] = gmul(s0, 0x0b) ^ gmul(s1, 0x0d) ^ gmul(s2, 0x09) ^ gmul(s3, 0x0e);
  }
}

function aesDecryptBlock(w, Nr, block) {
  var state = block.slice();
  addRoundKey(state, w, Nr);
  for (var r = Nr - 1; r >= 1; r--) {
    invShiftRows(state);
    invSubBytes(state);
    addRoundKey(state, w, r);
    invMixColumns(state);
  }
  invShiftRows(state);
  invSubBytes(state);
  addRoundKey(state, w, 0);
  return state;
}

function aesCbcDecrypt(key, iv, ct) {
  var sched = keyExpansion(key);
  var out = new Array(ct.length);
  var prev = iv.slice();
  for (var i = 0; i < ct.length; i += 16) {
    var block = ct.slice(i, i + 16);
    var dec = aesDecryptBlock(sched.w, sched.Nr, block);
    for (var j = 0; j < 16; j++) out[i + j] = dec[j] ^ prev[j];
    prev = block;
  }
  return out;
}
