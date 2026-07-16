// animexin.js
// StreamNative port of AnimexinProvider from cloudstream-extensions-uwu.
// Source: https://animexin.dev  (donghua/anime sub-Indo)
//
// Uses the "Vtbe" extractor which serves p,a,c,k,e,d JS; we unpack it
// (dean-edwards packer format) and pull the m3u8 out of `sources:[{file:…}]`.

const metadata = {
  name: "Animexin",
  description: "Anime + donghua subtitle Indonesia. Ported from cloudstream-extensions-uwu.",
  language: "id",
  authors: ["hexated (original)", "0xshitcode (port)"],
  status: 1,
  tvTypes: ["Anime", "AnimeMovie"],
  iconUrl: "https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://animexin.dev&size=128",
  version: 1
};

var MAIN = "https://animexin.dev";

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
    { name: "Recently Updated", path: "/anime/?status=ongoing&order=update" },
    { name: "Popular",          path: "/anime/?order=popular" },
    { name: "Donghua",          path: "/anime/?" },
    { name: "Movies",           path: "/anime/?status=&type=movie" }
  ];
  var out = [];
  for (var i = 0; i < rails.length; i++) {
    try {
      var r = http.get(MAIN + rails[i].path + "&page=1");
      if (r.status !== 200) continue;
      var items = parseArticleList(r.body);
      if (items.length > 0) out.push({ name: rails[i].name, items: items });
    } catch (e) { console.log("animexin home:", rails[i].name, String(e)); }
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
  if (r.status !== 200) throw new Error("Animexin load HTTP " + r.status);
  var h = r.body;
  var title = firstMatch(/<h1\s+class="[^"]*entry-title[^"]*"[^>]*>([^<]+)</, h) || "Untitled";
  title = decodeHtmlEntities(title).trim();
  var poster = firstMatch(/<div\s+class="thumb"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/, h)
    || firstMatch(/<meta\s+property="og:image"\s+content="([^"]+)"/, h);
  var plot = firstMatch(/<div\s+class="[^"]*entry-content[^"]*"[^>]*>([\s\S]*?)<\/div>/, h);
  if (plot) plot = decodeHtmlEntities(plot.replace(/<[^>]+>/g," ")).replace(/\s+/g," ").trim();
  var typeText = firstMatch(/<div\s+class="spe"[^>]*>([\s\S]*?)<\/div>/, h) || "";
  var isMovie = /Movie/i.test(typeText);

  // Episode list: div.eplister > ul > li (also handles ul.eplister directly).
  var epContainer =
    firstMatch(/<div\s+class="[^"]*\beplister\b[^"]*"[^>]*>[\s\S]*?<ul[^>]*>([\s\S]*?)<\/ul>/, h)
    || firstMatch(/<ul[^>]+class="[^"]*\beplister\b[^"]*"[^>]*>([\s\S]*?)<\/ul>/, h)
    || "";
  var epLinks = findAll(/<li[^>]*>\s*<a\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/, epContainer);
  var episodes = [];
  for (var i = 0; i < epLinks.length; i++) {
    var href = absolutize(epLinks[i][1], MAIN);
    var inner = epLinks[i][2];
    var numText = firstMatch(/<div\s+class="[^"]*epl-num[^"]*"[^>]*>([^<]+)</, inner)
      || inner.replace(/<[^>]+>/g, " ");
    var epM = /(\d+)/.exec(numText || "");
    var epNum = epM ? parseInt(epM[1], 10) : (i + 1);
    episodes.push({
      name: "Episode " + epNum,
      url: href,
      episode: epNum
    });
  }
  episodes.reverse();

  var base = {
    title: title, url: url,
    tvType: isMovie ? "AnimeMovie" : "Anime",
    image: poster, backdrop: poster,
    plot: plot, tags: []
  };
  if (isMovie && episodes.length > 0) {
    base.url = episodes[0].url;
  } else if (episodes.length > 0) {
    base.episodes = episodes;
  }
  return base;
}

// ── loadLinks(url) ─────────────────────────────────────────────────────
function loadLinks(url) {
  var r = http.get(url);
  if (r.status !== 200) throw new Error("Animexin loadLinks HTTP " + r.status);
  var h = r.body;

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
      if (iframeUrl.startsWith("//")) iframeUrl = "https:" + iframeUrl;
      var extracted = extractFromIframe(iframeUrl, label);
      for (var k = 0; k < extracted.length; k++) links.push(extracted[k]);
    } catch (e) {
      console.log("animexin option:", String(e));
    }
  }
  if (links.length === 0) {
    throw new Error("Animexin: no playable sources resolved. Servers may be down or the extractor needs an update.");
  }
  return links;
}

function extractFromIframe(iframeUrl, label) {
  // Dailymotion (www.dailymotion.com or geo.dailymotion.com)
  if (iframeUrl.indexOf("dailymotion.com") !== -1) {
    return dailymotionExtract(iframeUrl, label || "Dailymotion");
  }
  // Vtbe / Filemoon-family: page contains p,a,c,k,e,d JS with `sources:[{file:"..."}]`
  if (/vtbe|vtube|filemoon|vdbtm|vidmoly/i.test(iframeUrl)) {
    return vtbeExtract(iframeUrl, label || "Vtbe");
  }
  // Direct m3u8 sometimes appears verbatim
  if (iframeUrl.indexOf(".m3u8") !== -1) {
    return [{
      name: label || "Direct",
      url: iframeUrl,
      isM3u8: true,
      quality: "auto",
      referer: MAIN
    }];
  }
  // Odysee, ok.ru, etc — hand back as-is (webview can iframe them, or user
  // can copy the URL). Not m3u8, not playable through our HLS pipeline.
  return [{
    name: label || "Unknown",
    url: iframeUrl,
    quality: null,
    isM3u8: false,
    referer: MAIN
  }];
}

// ── Dailymotion extractor (same as donghub) ────────────────────────────
function dailymotionExtract(embedUrl, label) {
  var videoId = null;
  var m = /\/(?:embed\/)?video\/([a-zA-Z0-9]+)/.exec(embedUrl);
  if (m) videoId = m[1];
  if (!videoId) {
    m = /[?&]video=([a-zA-Z0-9]+)/.exec(embedUrl);
    if (m) videoId = m[1];
  }
  if (!videoId) return [];

  var canonicalEmbed = "https://www.dailymotion.com/embed/video/" + videoId;
  var metaUrl = "https://www.dailymotion.com/player/metadata/video/" + videoId;
  var r = http.get(metaUrl, { referer: canonicalEmbed });
  if (r.status !== 200) return [];
  var raw = r.body;
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
      referer: "https://www.dailymotion.com/"
    });
  }
  return out;
}

// ── Vtbe (packed-JS) extractor ─────────────────────────────────────────
function vtbeExtract(embedUrl, name) {
  var r = http.get(embedUrl, { referer: MAIN + "/" });
  if (r.status !== 200) return [];
  var html = r.body;
  var packed = firstMatch(/(eval\(function\(p,a,c,k,e,d\)[\s\S]*?\)\)\))/, html);
  var script = packed ? unpackDeanEdwards(packed) : html;
  if (!script) return [];
  // sources:[{file:"..."}]
  var links = [];
  var re = /sources:\s*\[\s*\{\s*file:\s*"([^"]+)"/g, m;
  while ((m = re.exec(script)) !== null) {
    links.push({
      name: name,
      url: m[1],
      isM3u8: m[1].indexOf(".m3u8") !== -1,
      quality: "auto",
      referer: embedUrl
    });
  }
  return links;
}

// ── Dean Edwards packer (p,a,c,k,e,d) — minimal port ──────────────────
// Reference: https://raw.githubusercontent.com/beautify-web/js-beautify/main/js/lib/unpackers/p_a_c_k_e_r_unpacker.js
function unpackDeanEdwards(source) {
  // Grab the trailing arguments of the packer: }('...', N, N, '...'.split('|'), 0, {}))
  var m = /}\s*\(\s*'((?:[^'\\]|\\.)*)'\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*'((?:[^'\\]|\\.)*)'\s*\.split\(\s*'\|'\s*\)/.exec(source);
  if (!m) return null;
  var payload = m[1].replace(/\\'/g, "'").replace(/\\\\/g, "\\");
  var radix = parseInt(m[2], 10);
  var count = parseInt(m[3], 10);
  var words = m[4].split("|");
  if (words.length !== count) {
    // Some packers report count that mismatches; be lenient.
    count = words.length;
  }
  function encode(c) {
    var s = "";
    if (c === 0) return "0";
    while (c > 0) {
      var d = c % radix;
      s = (d < 10 ? String(d) : String.fromCharCode(d - 10 + 97)) + s;
      c = Math.floor(c / radix);
    }
    return s;
  }
  var lookup = {};
  for (var i = count - 1; i >= 0; i--) {
    var key = encode(i);
    if (words[i]) lookup[key] = words[i];
  }
  return payload.replace(/\b\w+\b/g, function (word) {
    return lookup[word] || word;
  });
}
