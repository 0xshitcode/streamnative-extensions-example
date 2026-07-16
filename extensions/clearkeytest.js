// clearkeytest.js
// Reference extension exercising the ClearKey DRM pipeline in StreamNative.
//
// ClearKey is a W3C EME open standard — every browser (WebKitGTK, WebView2,
// Chromium, Firefox) supports the "org.w3.clearkey" key-system natively,
// with no proprietary CDM binary required. This makes it the only DRM
// scheme StreamNative can realistically play inside a Tauri webview.
//
// Widevine and PlayReady are NOT supported — they need CDMs that neither
// WebKitGTK nor WebView2 ship. See docs/EXTENSION-API.md.
//
// The test vectors here are hosted by Axinom and served through dash.js's
// public reference-player configuration. Both the KID and the key are
// well-known and publicly documented; playing them proves the pipeline
// works end-to-end.

const metadata = {
  name: "ClearKey DRM Test",
  description:
    "Reference test manifests protected with W3C ClearKey. Verifies StreamNative's DRM pipeline (dash.js + browser-native EME). Not a real content provider.",
  language: "en",
  authors: ["0xshitcode"],
  status: 1,
  tvTypes: ["Documentary", "Other"],
  iconUrl: null,
  version: 1
};

// Test vectors from dash.js reference-player sources.json.
// KID / key values are base64url-encoded, no padding — the exact format
// W3C EME session messages require.
var CATALOG = [
  {
    id: "axinom-1080p-single",
    title: "Axinom 1080p — Single-Key ClearKey",
    year: 2020,
    plot:
      "Axinom's MultiDRM-SingleKey test vector at 1080p. One KID/key " +
      "pair. Streamed through dash.js + browser-native org.w3.clearkey.",
    image: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerFun.jpg",
    manifest: "https://media.axprod.net/TestVectors/v7-MultiDRM-SingleKey/Manifest_1080p_ClearKey.mpd",
    keys: {
      // KID base64url  → Key base64url (dash.js protData.clearkeys shape)
      "nrQFDeRLSAKTLifXUIPiZg": "FmY0xnWCPCNaSpRG-tUuTQ"
    }
  },
  {
    id: "axinom-1080p-multi",
    title: "Axinom 1080p — Multi-Key ClearKey",
    year: 2020,
    plot:
      "Same Axinom test set, but rotates through five KID/key pairs — " +
      "exercises the dash.js/EME key-rotation path.",
    image: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ElephantsDream.jpg",
    manifest: "https://media.axprod.net/TestVectors/v7-MultiDRM-MultiKey/Manifest_1080p_ClearKey.mpd",
    keys: {
      "gDmb9YohQBSAU-J-dI6YwA": "3aHppzZ2g3Y3wK1uNnUXmg",
      "kJU-CWyySaOiYHpf7-rUmQ": "zsmKW7Mq9Unz5R7oUGeF8w",
      "Dk2pK9DoSmaMP8Jal-tlMg": "UmYYfGb7znuoFAQM79ayHw",
      "WF8jPzByRvGfpG3CLGagFA": "jayKpC3tmPq4YKXkapa8FA",
      "QiK9eLxFQb-2Pm-BTcOR3w": "GAMi9v92b9ca5yBwaptN-Q"
    }
  },
  {
    id: "axinom-2160p-single",
    title: "Axinom 2160p — 4K Single-Key ClearKey",
    year: 2020,
    plot: "Higher-resolution variant. Same KID/key pair as the 1080p asset.",
    image: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg",
    manifest: "https://media.axprod.net/TestVectors/v7-MultiDRM-SingleKey/Manifest_ClearKey.mpd",
    keys: {
      "nrQFDeRLSAKTLifXUIPiZg": "FmY0xnWCPCNaSpRG-tUuTQ"
    }
  }
];

function toCard(item) {
  return {
    title: item.title,
    image: item.image,
    backdrop: item.image,
    url: "clearkey://" + item.id,
    plot: item.plot,
    year: item.year,
    tvType: "Documentary"
  };
}

function home() {
  return [{ name: "ClearKey DRM test streams", items: CATALOG.map(toCard) }];
}

function search(query) {
  var q = (query || "").trim().toLowerCase();
  return CATALOG
    .filter(function (i) { return q.length === 0 || i.title.toLowerCase().indexOf(q) !== -1; })
    .map(toCard);
}

function load(url) {
  var id = url.replace("clearkey://", "");
  var item = pickItem(id);
  return {
    title: item.title,
    url: url,
    tvType: "Documentary",
    image: item.image,
    backdrop: item.image,
    plot: item.plot,
    year: item.year,
    tags: ["DASH", "DRM", "ClearKey"]
  };
}

function loadLinks(url) {
  var id = url.replace("clearkey://", "");
  var item = pickItem(id);
  return [{
    name: "DASH-IF / Axinom (ClearKey)",
    url: item.manifest,
    isM3u8: false,
    isDash: true,
    quality: "auto",
    referer: null,
    drm: {
      scheme: "clearkey",
      keys: item.keys
    }
  }];
}

function pickItem(id) {
  for (var i = 0; i < CATALOG.length; i++) {
    if (CATALOG[i].id === id) return CATALOG[i];
  }
  throw new Error("clearkeytest: unknown id " + id);
}
