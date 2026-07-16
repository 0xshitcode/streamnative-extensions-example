// nimegami.js
// StreamNative port of NimegamiProvider from cloudstream-extensions-uwu.
// Source: https://nimegami.id  (Indonesian anime, sub-Indo)
//
// Flow:
//   home()      → GET /page/N          → parse <article> cards
//   search(q)   → GET /page/N/?s=Q&post_type=post
//   load(url)   → GET url              → title, plot, episode list
//   loadLinks() → parse `<li data="…">` (base64 JSON of [{format,url}])
//                 → resolve stordl.halahgan.com landing → API → mp4
//
// The episode data attribute base64-decodes to a JSON array like:
//   [{ "format": "360p", "url": ["https://stordl…/streaming/XX?…mp4"] }, …]
// Each landing URL, when hit at `?action=stream-url&id=XX`, returns
// `{ ok: true, url: "https://stor.halahgan.com/stream/.../foo.mp4" }`
// — a direct-playable file we can stream through StreamNative's proxy.

const metadata = {
  name: "Nimegami",
  description: "Anime subtitle Indonesia. Ported from cloudstream-extensions-uwu.",
  language: "id",
  authors: ["hexated (original)", "0xshitcode (port)"],
  status: 1,
  tvTypes: ["Anime", "AnimeMovie", "Ova"],
  iconUrl: "https://t2.gstatic.com/faviconV2?client=SOCIAL&type=FAVICON&fallback_opts=TYPE,SIZE,URL&url=https://nimegami.id&size=128",
  version: 1
};

var MAIN = "https://nimegami.id";

// ── shared helpers (inlined; QuickJS has no `import`) ─────────────────
function absolutize(u, base) {
  if (!u) return null;
  if (u.startsWith("//")) return "https:" + u;
  if (u.startsWith("http")) return u;
  if (u.startsWith("/")) return base + u;
  return base + "/" + u;
}
function attr(html, name) {
  var m = new RegExp('\\s' + name + '\\s*=\\s*"([^"]*)"', 'i').exec(html);
  return m ? m[1] : null;
}
function firstMatch(re, s) {
  var m = re.exec(s);
  return m ? m[1] : null;
}
function findAll(re, s) {
  var out = [], m;
  var g = new RegExp(re.source, re.flags.indexOf('g') >= 0 ? re.flags : re.flags + 'g');
  while ((m = g.exec(s)) !== null) out.push(m);
  return out;
}
function decodeHtmlEntities(s) {
  return String(s || "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#(\d+);/g, function (_, n) { return String.fromCharCode(parseInt(n, 10)); });
}

// Naive base64 decode using QuickJS's built-in (or fallback impl).
function b64Decode(s) {
  if (typeof atob === "function") return atob(s);
  // Fallback: BTOA/ATOB polyfill (should never run — QuickJS ships atob).
  var chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
  var out = "", buf = 0, bits = 0;
  s = s.replace(/[^A-Za-z0-9+/=]/g, "");
  for (var i = 0; i < s.length; i++) {
    var c = chars.indexOf(s[i]);
    if (c === 64) break;
    buf = (buf << 6) | c;
    bits += 6;
    if (bits >= 8) { bits -= 8; out += String.fromCharCode((buf >> bits) & 0xff); }
  }
  return out;
}

// Convert bytes-as-string to a JS string, assuming utf-8 body.
// QuickJS' atob already returns a byte-per-char string; JSON.parse works.

// ── parse an <article> card into a SearchResult ─────────────────────────
function articleToCard(articleHtml) {
  // Prefer <h2><a>title</a> when present; fall back to the first <a title=…>.
  var titleM =
    /<h2[^>]*>\s*<a[^>]*>([^<]+)<\/a>/.exec(articleHtml) ||
    /<a\s+href="[^"]+"\s+title="([^"]+)"/.exec(articleHtml);
  var title = titleM ? decodeHtmlEntities(titleM[1]).trim() : null;
  if (!title) return null;

  var link =
    firstMatch(/<h2[^>]*>\s*<a\s+href="([^"]+)"/, articleHtml) ||
    firstMatch(/<a\s+href="([^"]+)"[^>]*title="/, articleHtml) ||
    firstMatch(/<a\s+href="([^"]+)"/, articleHtml);
  if (!link) return null;

  var poster =
    firstMatch(/<img[^>]+data-src="([^"]+)"/, articleHtml) ||
    firstMatch(/<img[^>]+src="([^"]+)"/, articleHtml);

  return {
    title: title,
    url: absolutize(link, MAIN),
    image: poster ? absolutize(poster, MAIN) : null,
    tvType: "Anime"
  };
}

function parseArticleList(html) {
  var arts = findAll(/<article\b[^>]*>([\s\S]*?)<\/article>/, html);
  var out = [];
  for (var i = 0; i < arts.length; i++) {
    var c = articleToCard(arts[i][1]);
    if (c) out.push(c);
  }
  // dedupe by url
  var seen = {}, dedup = [];
  for (var j = 0; j < out.length; j++) {
    if (!seen[out[j].url]) { seen[out[j].url] = true; dedup.push(out[j]); }
  }
  return dedup;
}

// ── home() ─────────────────────────────────────────────────────────────
function home() {
  var rails = [
    { name: "New Added", path: "" },
    { name: "TV",        path: "/type/tv" },
    { name: "Movies",    path: "/type/movie" },
    { name: "ONA",       path: "/type/ona" },
    { name: "OVA",       path: "/type/ova" }
  ];
  var out = [];
  for (var i = 0; i < rails.length; i++) {
    try {
      var r = http.get(MAIN + rails[i].path + "/page/1");
      if (r.status !== 200) continue;
      var items = parseArticleList(r.body);
      if (items.length > 0) out.push({ name: rails[i].name, items: items });
    } catch (e) {
      console.log("nimegami home rail failed:", rails[i].name, String(e));
    }
  }
  return out;
}

// ── search(query) ──────────────────────────────────────────────────────
function search(query) {
  var q = (query || "").trim();
  if (q.length === 0) return [];
  var all = [];
  for (var i = 1; i <= 2; i++) {
    var r = http.get(MAIN + "/page/" + i + "/?s=" + encodeURIComponent(q) + "&post_type=post");
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
  if (r.status !== 200) throw new Error("Nimegami load HTTP " + r.status);
  var h = r.body;

  var title = firstMatch(/<h1[^>]*itemprop="headline"[^>]*>([^<]+)</, h)
    || firstMatch(/<h1[^>]*class="[^"]*entry-title[^"]*"[^>]*>([^<]+)</, h)
    || "Untitled";
  title = decodeHtmlEntities(title).trim();

  var poster = firstMatch(/<div\s+class="coverthumbnail"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/, h);
  var backdrop = firstMatch(/<div\s+class="thumbnail-a"[^>]*>[\s\S]*?<img[^>]+src="([^"]+)"/, h)
    || firstMatch(/<meta\s+property="og:image"\s+content="([^"]+)"/, h);
  var plot = firstMatch(/<div\s+id="Sinopsis"[^>]*>([\s\S]*?)<\/div>/, h);
  if (plot) plot = decodeHtmlEntities(plot.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();

  var yearRaw = firstMatch(/Musim\s*\/\s*Rilis[^<]*<\/td>\s*<td[^>]*>([^<]+)</i, h);
  var year = null;
  if (yearRaw) {
    var ym = /(\d{4})/.exec(yearRaw);
    if (ym) year = parseInt(ym[1], 10);
  }

  // Episode list: <div class="list_eps_stream"> ... <li data="BASE64">…
  var epContainer = firstMatch(/<div\s+class="list_eps_stream"[^>]*>([\s\S]*?)<\/div>/, h);
  var episodes = [];
  if (epContainer) {
    var liMatches = findAll(/<li[^>]*\bdata="([^"]+)"[^>]*>([\s\S]*?)<\/li>/, epContainer);
    for (var i = 0; i < liMatches.length; i++) {
      var data = liMatches[i][1];
      var label = liMatches[i][2].replace(/<[^>]+>/g, "").trim();
      var epNumM = /Episode\s*(\d+)/i.exec(label);
      episodes.push({
        name: label || ("Episode " + (i + 1)),
        // Encode the base64 payload back into a URL our loadLinks() can find.
        url: "nimegami://ep/" + encodeURIComponent(data),
        episode: epNumM ? parseInt(epNumM[1], 10) : (i + 1)
      });
    }
  }

  var isMovie = !!/Musim.*Movie/i.test(h) || episodes.length <= 1;
  var base = {
    title: title,
    url: url,
    tvType: isMovie ? "AnimeMovie" : "Anime",
    image: poster || backdrop,
    backdrop: backdrop || poster,
    plot: plot,
    year: year,
    tags: []
  };
  if (episodes.length > 1) {
    base.episodes = episodes;
  } else if (episodes.length === 1) {
    // Single-episode movies: point streamUrl through the same episode data.
    base.streamUrl = null;                      // resolve lazily via loadLinks
    base.url = episodes[0].url;                 // so hits loadLinks() with data
  }
  return base;
}

// ── loadLinks(url) ─────────────────────────────────────────────────────
function loadLinks(url) {
  var data = null;
  var prefix = "nimegami://ep/";
  if (url.indexOf(prefix) === 0) {
    data = decodeURIComponent(url.substring(prefix.length));
  } else {
    // We were called with the detail URL itself (e.g. movies without an
    // episode list). Re-scrape and pick the first data= block.
    var r = http.get(url);
    if (r.status !== 200) throw new Error("Nimegami loadLinks scrape HTTP " + r.status);
    var m = /<li[^>]*\bdata="([^"]+)"/.exec(r.body);
    if (!m) throw new Error("no <li data=…> block found");
    data = m[1];
  }

  var entries;
  try {
    entries = JSON.parse(b64Decode(data));
  } catch (e) {
    throw new Error("failed to decode Nimegami episode payload: " + e);
  }

  var links = [];
  for (var i = 0; i < entries.length; i++) {
    var e = entries[i];
    var urls = e.url || [];
    for (var j = 0; j < urls.length; j++) {
      var raw = urls[j];
      var resolved = resolveStordl(raw);
      if (resolved) {
        links.push({
          name: "StorDL " + e.format,
          url: resolved,
          quality: e.format || "auto",
          isM3u8: false,
          referer: "https://stordl.halahgan.com/"
        });
      }
    }
  }
  if (links.length === 0) throw new Error("Nimegami: no playable sources resolved.");
  return links;
}

// Resolve a stordl.halahgan.com landing URL to its underlying .mp4 URL by
// hitting the site's own `?action=stream-url&id=…` JSON API.
function resolveStordl(landingUrl) {
  // Extract the streaming ID from `/streaming//<id>?…`
  var idM = /\/streaming\/+([A-Za-z0-9_-]+)(?:\?|$)/.exec(landingUrl);
  if (!idM) return landingUrl; // unknown pattern → hand it back as-is
  var id = idM[1];
  var origin = firstMatch(/^(https?:\/\/[^/]+)/, landingUrl);
  if (!origin) return landingUrl;
  var apiUrl = origin + "/streaming//" + id + "?action=stream-url&id=" + id;
  try {
    var r = http.get(apiUrl, { referer: landingUrl });
    if (r.status !== 200) return null;
    var j = JSON.parse(r.body);
    if (j && j.ok && j.url) return j.url;
    return null;
  } catch (e) {
    console.log("Nimegami resolveStordl failed for", id, "→", String(e));
    return null;
  }
}
