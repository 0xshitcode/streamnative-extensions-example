// donghub.js
// StreamNative port of DonghubProvider from cloudstream-extensions-uwu.
// Source: https://donghub.vip  (Indonesian donghua, sub-Indo)
//
// Flow:
//   home()      → /anime/?order=update, /?status=ongoing, /?status=completed
//   search(q)   → /page/N/?s=Q
//   load(url)   → parse .eplister list (or `.spe` "Movie" tag)
//   loadLinks() → base64-decode each `.mobius option[value]`,
//                 extract <iframe src>, resolve Dailymotion → m3u8

const metadata = {
  name: "Donghub",
  description: "Donghua subtitle Indonesia. Ported from cloudstream-extensions-uwu (via Dailymotion).",
  language: "id",
  authors: ["hexated (original)", "0xshitcode (port)"],
  status: 1,
  tvTypes: ["Anime", "AnimeMovie", "Cartoon"],
  iconUrl: "https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://donghub.vip&size=128",
  version: 1
};

var MAIN = "https://donghub.vip";

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
  var out=[],m,g=new RegExp(re.source, re.flags.indexOf('g')>=0?re.flags:re.flags+'g');
  while((m=g.exec(s))!==null) out.push(m); return out;
}
function decodeHtmlEntities(s) {
  return String(s || "")
    .replace(/&amp;/g,"&").replace(/&lt;/g,"<").replace(/&gt;/g,">")
    .replace(/&quot;/g,'"').replace(/&#039;/g,"'")
    .replace(/&#(\d+);/g,function(_,n){return String.fromCharCode(parseInt(n,10));});
}
function b64Decode(s) {
  if (typeof atob === "function") return atob(s);
  return "";
}

// ── article card → SearchResult ────────────────────────────────────────
function articleToCard(html) {
  // Match `<a href="..." (any attrs) title="...">`
  var m = /<a\s+href="([^"]+)"[^>]*\btitle="([^"]*)"/.exec(html);
  var href, title;
  if (m) {
    href = m[1];
    title = m[2];
  } else {
    href = firstMatch(/<a\s+href="([^"]+)"/, html);
    title = firstMatch(/<img[^>]+alt="([^"]+)"/, html);
  }
  if (!href) return null;
  title = decodeHtmlEntities(title || "").trim();
  if (!title) return null;
  var poster = firstMatch(/<img[^>]+data-src="([^"]+)"/, html)
    || firstMatch(/<img[^>]+src="([^"]+)"/, html);
  return {
    title: title,
    url: absolutize(href, MAIN),
    image: poster ? absolutize(poster, MAIN) : null,
    tvType: "Anime"
  };
}

function parseArticleList(html) {
  // Cloudstream uses "div.listupd > article"
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
    { name: "Latest Releases",  path: "/anime/?order=update" },
    { name: "Series Ongoing",   path: "/anime/?status=ongoing&order=update" },
    { name: "Series Completed", path: "/anime/?status=completed&order=update" },
    { name: "Movies",           path: "/anime/?type=movie&order=update" }
  ];
  var out = [];
  for (var i = 0; i < rails.length; i++) {
    try {
      var url = MAIN + rails[i].path + "&page=1";
      var r = http.get(url);
      if (r.status !== 200) continue;
      var items = parseArticleList(r.body);
      if (items.length > 0) out.push({ name: rails[i].name, items: items });
    } catch (e) { console.log("donghub home:", rails[i].name, String(e)); }
  }
  return out;
}

// ── search(query) ──────────────────────────────────────────────────────
function search(query) {
  var q = (query || "").trim();
  if (q.length === 0) return [];
  var all = [];
  for (var i = 1; i <= 3; i++) {
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
  if (r.status !== 200) throw new Error("Donghub load HTTP " + r.status);
  var h = r.body;
  var title = firstMatch(/<h1\s+class="[^"]*entry-title[^"]*"[^>]*>([^<]+)</, h) || "Untitled";
  title = decodeHtmlEntities(title).trim();
  var plot = firstMatch(/<div\s+class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/, h);
  if (plot) plot = decodeHtmlEntities(plot.replace(/<[^>]+>/g," ")).replace(/\s+/g," ").trim();
  var poster = firstMatch(/<div\s+class="ime"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/, h)
    || firstMatch(/<meta\s+property="og:image"\s+content="([^"]+)"/, h);
  var typeText = firstMatch(/<div\s+class="spe"[^>]*>([\s\S]*?)<\/div>/, h) || "";
  var isMovie = /Movie/i.test(typeText);

  // Episode list. `.eplister` block contains a <ul>…</ul> — extract that.
  var eplisterOuter = firstMatch(/class="[^"]*\beplister\b[^"]*"[^>]*>([\s\S]*?)<script/, h)
    || "";
  var epContainer =
    firstMatch(/<ul[^>]*>([\s\S]*?)<\/ul>/, eplisterOuter)
    || firstMatch(/<ul[^>]+class="[^"]*\beplister\b[^"]*"[^>]*>([\s\S]*?)<\/ul>/, h)
    || firstMatch(/<div\s+class="[^"]*\blist-episode\b[^"]*"[^>]*>([\s\S]*?)<\/div>/, h)
    || firstMatch(/<div\s+id="episodes"[^>]*>([\s\S]*?)<\/div>/, h)
    || "";
  var epLinks = findAll(/<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/, epContainer);
  var episodes = [];
  for (var i = 0; i < epLinks.length; i++) {
    var href = absolutize(epLinks[i][1], MAIN);
    var label = decodeHtmlEntities(epLinks[i][2].replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
    var epM = /Episode\s*(\d+)/i.exec(label);
    episodes.push({
      name: label || ("Episode " + (i + 1)),
      url: href,
      episode: epM ? parseInt(epM[1], 10) : (i + 1)
    });
  }
  episodes.reverse(); // Cloudstream reverses so ep 1 is first

  var base = {
    title: title, url: url,
    tvType: isMovie ? "AnimeMovie" : "Anime",
    image: poster, backdrop: poster,
    plot: plot, tags: []
  };
  if (isMovie && episodes.length > 0) {
    base.url = episodes[0].url; // point at the single-ep player page
  } else if (episodes.length > 0) {
    base.episodes = episodes;
  }
  return base;
}

// ── loadLinks(url) ─────────────────────────────────────────────────────
function loadLinks(url) {
  var r = http.get(url);
  if (r.status !== 200) throw new Error("Donghub loadLinks HTTP " + r.status);
  var h = r.body;

  // Grab the <select class="mobius"> option[value] base64 payloads.
  var opts = findAll(/<option\s+value="([^"]+)"[^>]*>([\s\S]*?)<\/option>/, h);
  var links = [];
  for (var i = 0; i < opts.length; i++) {
    var val = opts[i][1];
    var label = decodeHtmlEntities(opts[i][2].replace(/<[^>]+>/g," ")).replace(/\s+/g," ").trim();
    if (!val || val.length < 8) continue;
    try {
      var decoded = b64Decode(val);
      var iframe = /<iframe[^>]+src="([^"]+)"/.exec(decoded);
      if (!iframe) continue;
      var iframeUrl = decodeHtmlEntities(iframe[1]);
      var extracted = extractFromIframe(iframeUrl, label);
      for (var k = 0; k < extracted.length; k++) links.push(extracted[k]);
    } catch (e) {
      console.log("donghub option decode failed:", String(e));
    }
  }
  if (links.length === 0) throw new Error("Donghub: no playable sources resolved. All servers may be down.");
  return links;
}

function extractFromIframe(iframeUrl, label) {
  // Dailymotion (geo.dailymotion.com or www.dailymotion.com)
  if (iframeUrl.indexOf("dailymotion.com") !== -1) {
    return dailymotionExtract(iframeUrl, label || "Dailymotion");
  }
  // Unknown host — return unresolved so the user knows.
  return [{
    name: label || "Unknown host",
    url: iframeUrl,
    quality: null,
    isM3u8: iframeUrl.indexOf(".m3u8") !== -1,
    referer: MAIN
  }];
}

// ── Dailymotion extractor (ported from com.donghub.Dailymotion) ────────
function dailymotionExtract(embedUrl, label) {
  // Normalize both www and geo.dailymotion.com embed formats to a video ID.
  var videoId = null;
  var m = /\/(?:embed\/)?video\/([a-zA-Z0-9]+)/.exec(embedUrl);
  if (m) videoId = m[1];
  if (!videoId) {
    // geo.dailymotion.com/player.html?video=XXX
    m = /[?&]video=([a-zA-Z0-9]+)/.exec(embedUrl);
    if (m) videoId = m[1];
  }
  if (!videoId) return [];

  var canonicalEmbed = "https://www.dailymotion.com/embed/video/" + videoId;
  var metaUrl = "https://www.dailymotion.com/player/metadata/video/" + videoId;
  var r = http.get(metaUrl, { referer: canonicalEmbed });
  if (r.status !== 200) return [];
  var raw = r.body;

  // Same regex Cloudstream uses; grab every m3u8 URL.
  var urls = [];
  var re = /"url"\s*:\s*"([^"]+)"/g, mm;
  while ((mm = re.exec(raw)) !== null) {
    if (mm[1].indexOf(".m3u8") !== -1) {
      urls.push(mm[1].replace(/\\\//g, "/"));
    }
  }
  var out = [];
  for (var i = 0; i < urls.length; i++) {
    out.push({
      name: label || "Dailymotion",
      url: urls[i],
      isM3u8: true,
      quality: "auto",
      // Dailymotion signs the manifest per session — Referer + a real UA
      // are the only bits it checks.
      referer: "https://www.dailymotion.com/"
    });
  }
  return out;
}
