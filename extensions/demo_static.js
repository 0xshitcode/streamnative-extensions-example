// demo_static.js
// A pure-JS demo extension. No network calls. Ships a fixed catalog of
// six titles and streams the public Mux HLS test asset. Use this as a
// smoke-test that the extension pipeline is working end-to-end.

const metadata = {
  name: "Demo (Static)",
  description: "Static in-memory catalog. Streams Mux's public HLS test asset. No network access — great for a first install to verify everything works.",
  language: "en",
  authors: ["StreamNative"],
  status: 1,
  tvTypes: ["Movie", "TvSeries"],
  iconUrl: null,
  version: 1
};

// Public HLS test stream (Big Buck Bunny variants). Safe to embed.
var DEMO_HLS = "https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8";

var CATALOG = [
  { id: "neon",    title: "Neon Skyline",       year: 2024, tvType: "Movie",
    plot: "A rogue detective uncovers a conspiracy in a rain-soaked metropolis.",
    color: "E50914" },
  { id: "kernel",  title: "Kernel Panic",       year: 2023, tvType: "Movie",
    plot: "An engineer patches reality itself when a quantum kernel recompiles physics.",
    color: "141414" },
  { id: "silent",  title: "The Silent Compiler",year: 2025, tvType: "TvSeries",
    plot: "A retired compiler engineer is pulled back when binaries turn sentient.",
    color: "1f1f1f" },
  { id: "latency", title: "Latency",            year: 2022, tvType: "Movie",
    plot: "Two lovers separated by 200ms of jitter race to sync before disconnect.",
    color: "3a3a3a" },
  { id: "rust",    title: "Rustacean Rising",   year: 2024, tvType: "Movie",
    plot: "A young borrow-checker rises against an army of segmentation faults.",
    color: "8b5cf6" },
  { id: "tauri",   title: "Tauri Nights",       year: 2023, tvType: "TvSeries",
    plot: "Every 3AM the desktop apps come alive. A frameless window is all that stands.",
    color: "0ea5e9" }
];

function toCard(item) {
  var enc = encodeURIComponent(item.title);
  return {
    title: item.title,
    image:    "https://placehold.co/400x600/" + item.color + "/ffffff?text=" + enc,
    backdrop: "https://placehold.co/1600x900/" + item.color + "/ffffff?text=" + enc,
    url: "demo-static://" + item.id,
    plot: item.plot,
    year: item.year,
    tvType: item.tvType,
    streamUrl: item.tvType === "Movie" ? DEMO_HLS : null
  };
}

function home() {
  return [
    { name: "Movies", items: CATALOG.filter(function (i) { return i.tvType === "Movie"; }).map(toCard) },
    { name: "Series", items: CATALOG.filter(function (i) { return i.tvType === "TvSeries"; }).map(toCard) }
  ];
}

function search(query) {
  var q = (query || "").trim().toLowerCase();
  return CATALOG
    .filter(function (i) { return q.length === 0 || i.title.toLowerCase().indexOf(q) !== -1; })
    .map(toCard);
}

function load(url) {
  var id = url.replace("demo-static://", "");
  var item = null;
  for (var i = 0; i < CATALOG.length; i++) {
    if (CATALOG[i].id === id) { item = CATALOG[i]; break; }
  }
  if (!item) throw new Error("not found: " + url);

  var base = {
    title: item.title,
    url: url,
    tvType: item.tvType,
    image:    "https://placehold.co/400x600/" + item.color + "/ffffff?text=" + encodeURIComponent(item.title),
    backdrop: "https://placehold.co/1600x900/" + item.color + "/ffffff?text=" + encodeURIComponent(item.title),
    plot: item.plot,
    year: item.year,
    tags: ["Demo"],
    rating: 8.2,
    durationMinutes: 108
  };
  if (item.tvType === "TvSeries") {
    base.episodes = [
      { name: "Pilot",           url: url + "/e1", season: 1, episode: 1 },
      { name: "The Second Trap", url: url + "/e2", season: 1, episode: 2 },
      { name: "Finale",          url: url + "/e3", season: 1, episode: 3 }
    ];
  } else {
    base.streamUrl = DEMO_HLS;
  }
  return base;
}

function loadLinks(url) {
  return [
    { name: "Mux CDN (1080p)", url: DEMO_HLS, isM3u8: true, quality: "1080p" },
    { name: "Mux CDN (Auto)",  url: DEMO_HLS, isM3u8: true, quality: "auto"  }
  ];
}
