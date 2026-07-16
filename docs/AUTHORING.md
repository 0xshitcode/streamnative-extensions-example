# Authoring a StreamNative Extension

A step-by-step walkthrough using this repository as a template. Full
API reference lives in the main app repo:
<https://github.com/0xshitcode/streamnative/blob/main/docs/EXTENSION-API.md>.

## 1. Fork / clone this repo

```bash
gh repo fork 0xshitcode/streamnative-extensions-example --clone
```

Or use it as a GitHub template.

## 2. Create your extension file

Copy an existing one that matches your use case:

- `demo_static.js` — no network, in-memory catalog. Perfect starting
  point when you're just learning the API.
- `openlibrary.js` — real HTTP scraper. Good template for actual media
  sites.

```bash
cp extensions/demo_static.js extensions/my_provider.js
```

The file name (without `.js`) becomes the extension's `id` inside the
manifest.

## 3. Edit the `metadata` block

Only `name` is truly required. Everything else has defaults:

```js
const metadata = {
  name: "My Provider",
  description: "Streams from example.com",
  language: "id",              // ISO 639-1
  authors: ["your-handle"],
  status: 1,                    // 0=Down, 1=OK, 2=Slow, 3=Beta
  tvTypes: ["Anime", "AnimeMovie"],
  iconUrl: "https://example.com/favicon.ico",
  version: 1                    // bump on release
};
```

## 4. Implement `search(query)`

The only mandatory hook. On every keystroke in the app's Search page,
`search(q)` is called with `q` = the user's current query.

```js
function search(query) {
  const r = http.get("https://example.com/search?q=" + encodeURIComponent(query));
  if (r.status !== 200) throw new Error("upstream HTTP " + r.status);

  // Assume the site returns JSON. If it's HTML, use string / regex tools;
  // there is no jsdom / cheerio inside the sandbox.
  const data = JSON.parse(r.body);
  return data.results.map(function (item) {
    return {
      title: item.title,
      image: item.poster,
      url: "myprovider://" + item.slug,   // opaque, comes back to load()
      year: item.year,
      tvType: item.isSeries ? "TvSeries" : "Movie"
    };
  });
}
```

## 5. (Optional) `home()`

Curated rails for the app's home page. If you skip this, the app calls
`search("")` and shows one rail per extension.

```js
function home() {
  return [
    { name: "Trending",       items: fetchList("/trending") },
    { name: "Newly Added",    items: fetchList("/latest") },
    { name: "Top Rated",      items: fetchList("/top") }
  ];
}
```

## 6. (Optional) `load(url)`

Called when a poster is clicked. Fetch the full detail page and return
richer info + an episode list for series.

```js
function load(url) {
  const slug = url.replace("myprovider://", "");
  const r = http.get("https://example.com/detail/" + slug);
  const html = r.body;
  // …parse HTML into structured info…
  return {
    title: extractTitle(html),
    url: url,
    tvType: "TvSeries",
    plot: extractPlot(html),
    year: extractYear(html),
    episodes: extractEpisodes(html)  // [{ name, url, season, episode }]
  };
}
```

## 7. (Optional) `loadLinks(url)`

Called when Play is pressed on an item without a direct `streamUrl`.

```js
function loadLinks(url) {
  const r = http.get(episodeApiUrl(url));
  return JSON.parse(r.body).sources.map(function (s) {
    return {
      name: s.name,
      url: s.file,
      isM3u8: s.file.endsWith(".m3u8"),
      quality: s.label,
      referer: "https://example.com/"   // will be injected on every proxy hop
    };
  });
}
```

## 8. Test locally

You have two options:

**A. Install into your local StreamNative** — quicker feedback loop.
1. Point Settings → Providers → Extensions folder at
   `<your-clone>/extensions/`.
2. Click **Rescan**.
3. `console.log(...)` output appears in the terminal running
   `npm run tauri dev`.

**B. Preview via the local manifest** — verifies the full install flow.
1. Serve the repo locally: `python3 -m http.server 8000`
2. In the app, Settings → Providers → Repositories → paste
   `http://localhost:8000/repo.json` → Preview → Add → Install.

## 9. Push

Commit your `.js` and push to `main`. GitHub Actions will:

1. Run `scripts/build-manifest.mjs` to regenerate `repo.json`
2. Commit the updated manifest back to `main` (with `[skip ci]`)
3. Deploy the whole repo to GitHub Pages

Users hit **Rescan** on their repo entry (or re-install the extension)
to pick up your new version.

## Debugging tips

- **`console.log()` is your friend.** It goes to the app's stderr;
  `npm run tauri dev` shows it. Objects are auto-JSON-stringified.
- **The sandbox is fresh per call.** Do not rely on module-level
  variables surviving between hooks. If you need caching, put it
  inside your extension and re-populate it at the top of every hook.
- **`http.get` is synchronous.** For pagination, loop with a counter.
  Don't try `async/await` — QuickJS supports it, but our host does
  not currently pump the microtask queue between the sync return of
  the hook and reading its result.
- **HTML parsing.** No `document`, no `DOMParser`. Use `String.prototype.match`,
  `RegExp`, or vendor a small util in your extension. Keep it fast —
  the 64 MiB memory cap fits typical scrapes comfortably but not
  gigabytes.
- **CORS is not your problem.** The Rust proxy strips CORS entirely
  when it re-emits stream URLs; your extension only needs to hand back
  the correct upstream URL + Referer/UA.

## Anti-hotlinking cheat sheet

Most media CDNs deny requests without a matching `Referer`. Set it on
each `MediaLink`:

```js
{
  name: "CDN-1",
  url: "https://cdn.example.com/hls/master.m3u8",
  isM3u8: true,
  referer: "https://the-player-page.example.com/",
  headers: { "Origin": "https://the-player-page.example.com" }
}
```

The proxy will re-inject those headers on **every** subsequent segment
fetch (not just the master), so anti-hotlinking works out of the box.
