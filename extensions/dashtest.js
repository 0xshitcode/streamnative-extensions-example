// dashtest.js
// Reference "extension" that demonstrates MPEG-DASH playback + subtitle
// tracks through StreamNative — the two playback capabilities that
// Cloudstream itself supports but real Indonesian providers rarely
// expose (Cinemax21 and Drakor are the exceptions, both TMDB-driven
// and too heavy to port).
//
// This is intentionally NOT a scraper — it returns a curated set of
// well-known public DASH-IF and Google Shaka test streams. Every URL
// is hosted by a public reference server (dash.akamaized.net,
// storage.googleapis.com), safe to embed, and unlikely to disappear.
// Subtitle VTT files live in the same repo (samples/subtitles/) so
// the whole pipeline can be verified end-to-end without third-party
// dependencies.
//
// Use this as a template when porting a real DASH-serving provider
// (structure of `LoadResponse` and `MediaLink { isDash, subtitles }`
// is the important bit, the URLs themselves are dummies).

const metadata = {
  name: "DASH & Subtitles Test",
  description:
    "Reference test streams (MPEG-DASH manifests + WebVTT subtitle tracks). Verifies dash.js + <track> pipeline against public DASH-IF and Google Shaka assets. Not a real content provider.",
  language: "en",
  authors: ["0xshitcode"],
  status: 1,
  tvTypes: ["Documentary", "Other"],
  iconUrl: null,
  version: 1
};

// Where our own hosted subtitle VTTs live (GitHub Pages base for this repo).
var REPO_BASE =
  "https://0xshitcode.github.io/streamnative-extensions-example";

// Fixed test catalogue. Each item has a specific DASH manifest + one or
// two subtitle tracks so a wide range of scenarios is covered:
//
//   - Big Buck Bunny (Akamai)            — canonical DASH-IF fixture
//   - MultiRate qualcomm                  — ABR adaptive test
//   - Angel One (Shaka)                   — multi-audio-track DASH
//
var CATALOG = [
  {
    id: "bbb",
    title: "Big Buck Bunny — DASH (Akamai)",
    year: 2008,
    plot:
      "Canonical DASH-IF reference: 30fps H.264 in an MPEG-DASH " +
      "manifest served by Akamai. Ships with a self-hosted WebVTT track.",
    image: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/BigBuckBunny.jpg",
    manifest: "https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd",
    subtitles: [
      { lang: "English",   file: "/samples/subtitles/dashtest-en.vtt", default: true },
      { lang: "Indonesia", file: "/samples/subtitles/dashtest-id.vtt", default: false }
    ]
  },
  {
    id: "multirate",
    title: "MultiRate ABR Test (Qualcomm)",
    year: 2020,
    plot:
      "DASH-IF adaptive bitrate ladder — dash.js will switch between " +
      "renditions as bandwidth changes.",
    image: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/SubaruOutbackOnStreetAndDirt.jpg",
    manifest: "https://dash.akamaized.net/dash264/TestCases/1a/qualcomm/1/MultiRate.mpd",
    subtitles: [
      { lang: "English", file: "/samples/subtitles/dashtest-en.vtt", default: true }
    ]
  },
  {
    id: "angelone",
    title: "Angel One — Multi-Language (Shaka)",
    year: 2019,
    plot:
      "Google Shaka Player reference: DASH manifest with multiple " +
      "audio languages selectable via the player's audio-track menu.",
    image: "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/images/ForBiggerBlazes.jpg",
    manifest: "https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd",
    subtitles: [
      { lang: "English",   file: "/samples/subtitles/dashtest-en.vtt", default: true },
      { lang: "Indonesia", file: "/samples/subtitles/dashtest-id.vtt", default: false }
    ]
  }
];

function toCard(item) {
  return {
    title: item.title,
    image: item.image,
    backdrop: item.image,
    url: "dashtest://" + item.id,
    plot: item.plot,
    year: item.year,
    tvType: "Documentary"
  };
}

function home() {
  return [{ name: "DASH reference streams", items: CATALOG.map(toCard) }];
}

function search(query) {
  var q = (query || "").trim().toLowerCase();
  return CATALOG
    .filter(function (i) { return q.length === 0 || i.title.toLowerCase().indexOf(q) !== -1; })
    .map(toCard);
}

function load(url) {
  var id = url.replace("dashtest://", "");
  var item = null;
  for (var i = 0; i < CATALOG.length; i++) {
    if (CATALOG[i].id === id) { item = CATALOG[i]; break; }
  }
  if (!item) throw new Error("dashtest: unknown id " + id);
  return {
    title: item.title,
    url: url,
    tvType: "Documentary",
    image: item.image,
    backdrop: item.image,
    plot: item.plot,
    year: item.year,
    tags: ["DASH", "Subtitles"]
  };
}

function loadLinks(url) {
  var id = url.replace("dashtest://", "");
  var item = null;
  for (var i = 0; i < CATALOG.length; i++) {
    if (CATALOG[i].id === id) { item = CATALOG[i]; break; }
  }
  if (!item) throw new Error("dashtest: unknown id " + id);

  return [{
    name: "DASH-IF / Shaka",
    url: item.manifest,
    isM3u8: false,
    isDash: true,
    quality: "auto",
    referer: null,
    subtitles: item.subtitles.map(function (s) {
      return {
        lang: s.lang,
        url: REPO_BASE + s.file,
        referer: null,
        default: !!s.default
      };
    })
  }];
}
