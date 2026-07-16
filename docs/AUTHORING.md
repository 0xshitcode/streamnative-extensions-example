# Authoring a StreamNative Extension

Step-by-step guide using this repository as a template. Full API
reference lives at
<https://github.com/0xshitcode/streamnative/blob/main/docs/EXTENSION-API.md>.

## 1. Pick a starter matching your target

| Kind of target site                               | Copy this file    |
| ------------------------------------------------- | ----------------- |
| Direct `.mp4` / API returns a stream URL          | `nimegami.js`     |
| WordPress HTML + Dailymotion embeds               | `donghub.js`      |
| WordPress HTML + packed-JS extractor (Vtbe etc.)  | `animexin.js`     |

```bash
cp extensions/nimegami.js extensions/my_provider.js
```

The file name (without `.js`) becomes the extension ID inside `repo.json`.

## 2. Update the `metadata` block

Only `name` is required; the rest have sensible defaults.

```js
const metadata = {
  name: "My Provider",
  description: "Streams from example.com",
  language: "id",
  authors: ["your-handle"],
  status: 1,                        // 0=Down, 1=OK, 2=Slow, 3=Beta
  tvTypes: ["Anime", "AnimeMovie"],
  iconUrl: "https://example.com/favicon.ico",
  version: 1                        // bump on release
};
```

## 3. Implement `search(query)` (the only mandatory hook)

Use `http.get()` — synchronous, blocks the sandbox thread:

```js
function search(query) {
  const r = http.get("https://example.com/search?q=" + encodeURIComponent(query));
  if (r.status !== 200) throw new Error("upstream HTTP " + r.status);
  return parseResults(r.body);  // → SearchResult[]
}
```

## 4. Implement `home()` (optional but recommended)

Cloudstream-style curated horizontal rails:

```js
function home() {
  return [
    { name: "Trending", items: fetchList("/trending") },
    { name: "Latest",   items: fetchList("/latest") }
  ];
}
```

If omitted, StreamNative falls back to `search("")`.

## 5. Implement `load(url)` (optional)

Called when a poster is clicked. Return richer info + episode list for
series:

```js
function load(url) {
  const r = http.get(url);
  // …parse HTML/JSON…
  return {
    title, url, tvType: "TvSeries",
    plot, year, image, backdrop,
    tags: ["Sci-Fi"], rating: 8.4,
    episodes: [
      { name: "Pilot", url: "…/ep1", season: 1, episode: 1 }
    ]
  };
}
```

## 6. Implement `loadLinks(url)` (optional)

Called when Play is pressed. Return one or more playable sources:

```js
function loadLinks(url) {
  const r = http.get(episodeApiUrl(url));
  return JSON.parse(r.body).sources.map((s) => ({
    name: s.label,
    url:  s.file,
    isM3u8: s.file.endsWith(".m3u8"),
    quality: s.quality,
    referer: "https://example.com/"   // proxy re-injects this on every hop
  }));
}
```

StreamNative shows a source picker if you return multiple links.

## 7. Verify locally

The repository ships a live-test harness that runs your extension
against real websites, no browser needed:

```bash
node scripts/live-test.mjs my_provider
```

Expected output includes:
- `home:N` — total items across all rails
- `search:N` — query result count
- `load:{ title, tvType, episodes }` — first item's detail parse
- `links:N` — sources found for the first episode
- `probeStatus` + `probeType` — verifies the stream URL responds with a
  media content-type

`probeStatus: 206 video/mp4` means the extension is completely working.
`probeStatus: 403` on a Dailymotion-style provider is a **soft-pass**:
the URL is valid but the anti-hotlinking token expired between extract
and probe — real playback from the app will succeed because it re-runs
`loadLinks` right before playing.

## 8. Test inside StreamNative

**Fast dev loop** (edit-in-place):

1. Settings → Providers → Extensions folder → **Browse** → pick this repo's `extensions/` dir.
2. Click **Rescan**.
3. Open Home → your extension's rails should appear.
4. `console.log(...)` from your extension goes to the app's stderr
   (`npm run tauri dev` in the StreamNative repo).

**Full install-from-repo loop**:

1. Serve this repo locally: `python3 -m http.server 8000`
2. Settings → Providers → Repositories → paste `http://localhost:8000/repo.json`
3. Preview → Add → Install → open Home.

## 9. Ship it

Commit your `.js` and push to `main`. The `pages.yml` workflow will:

1. Run `live-test.mjs` — **fails the build if your extension is broken**
2. Regenerate `repo.json` from every `extensions/*.js`
3. Deploy the whole repo (extensions + manifest + docs) to GitHub Pages

Users hit **Rescan** on the repo (or re-install the extension) to pick
up your new version.

## Common patterns

### base64-encoded payloads

Many WordPress-based sites base64-encode the embed URL inside
`<option value="…">` tags:

```js
var opts = findAll(/<option\s+value="([^"]+)"[^>]*>([\s\S]*?)<\/option>/, html);
for (var i = 0; i < opts.length; i++) {
  var decoded = atob(opts[i][1]);
  var iframeUrl = /<iframe[^>]+src="([^"]+)"/.exec(decoded)[1];
  // …hand iframeUrl off to a per-host extractor…
}
```

### Dailymotion extractor

Copy this whole block from `donghub.js` or `animexin.js`. It handles
both `www.dailymotion.com/embed/video/XXX` and
`geo.dailymotion.com/player.html?video=XXX` and hits
`/player/metadata/video/XXX` to pull the `.m3u8` URL.

### Packed-JS ("dean-edwards") unpacker

See the bottom of `animexin.js`. Handles the classic
`eval(function(p,a,c,k,e,d){…}(...))` bootstrap that many Filemoon-family
sites use to hide `sources:[{file:"…"}]`.

### Anti-hotlinking

Most CDNs check `Referer`. Set it on every `MediaLink`:

```js
{ name, url, isM3u8: true, referer: "https://the-embed-page.com/" }
```

StreamNative's Rust proxy re-injects that Referer on **every** m3u8
variant and .ts segment fetch, not just the master — so anti-hotlinking
works transparently.

### Sync `http.get` gotcha

There's no `async/await` and no `Promise`. The sandbox thread blocks
inside `http.get` until the response comes back. Use tight timeouts,
handle non-200s explicitly, and never call `http.get` in a tight loop
you can't bound.

## Debugging

- **`console.log(anything)`** — output goes to app stderr, prefixed with
  `[ext]`. Objects are JSON-stringified.
- **`throw new Error("what happened")`** — surfaced as a toast in the UI.
  Never return an empty array to mean "error" — the app can't tell that
  apart from "no results".
- **Sandbox restarts every call.** Module-scope caches persist ONLY
  within a single hook invocation. Anything you need across calls must
  be re-fetched.
- **No `document`, no `DOMParser`, no `cheerio`.** Use `String.match`,
  `RegExp`, and small hand-rolled helpers (see the `findAll`,
  `firstMatch`, `decodeHtmlEntities` helpers in every sample extension).
