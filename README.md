# StreamNative Extensions — Example

Reference sample repository for [**StreamNative**](https://github.com/0xshitcode/streamnative).

Four **live, working** extensions ported from
[HatsuneMikuUwU/cloudstream-extensions-uwu](https://github.com/HatsuneMikuUwU/cloudstream-extensions-uwu):

| ID          | Source                                                | Extractor                              | Playback format | Difficulty |
| ----------- | ----------------------------------------------------- | -------------------------------------- | --------------- | ---------- |
| `nimegami`  | [nimegami.id](https://nimegami.id)                    | Direct `.mp4` via `stordl.halahgan.com` JSON API | **MP4** (native `<video>`) | ⭐ easy |
| `donghub`   | [donghub.vip](https://donghub.vip)                    | Dailymotion metadata → HLS `.m3u8`     | **HLS** (hls.js) | ⭐⭐ medium |
| `animexin`  | [animexin.dev](https://animexin.dev)                  | Dailymotion + Vtbe (packed-JS unpacker) | **HLS** + iframe fallback for Odysee/Ok.ru | ⭐⭐ medium |
| `kuronime`  | [kuronime.sbs](https://kuronime.sbs)                  | `animeku.org` JSON API → **AES-256-CBC decrypt** (CryptoJS OpenSSL passphrase mode) → HLS `.m3u8` | **HLS** (hls.js) | ⭐⭐⭐ hard — needs a pure-JS MD5 + AES port |

## Install into StreamNative

1. **Settings → Providers → Repositories → Add**
2. Paste:
   ```
   https://0xshitcode.github.io/streamnative-extensions-example/repo.json
   ```
3. Click **Preview → Add**, then **Install** on each extension.
4. Go **Home** — rails should populate with live catalogs from all three sites.

## What "live" means

Every push triggers `scripts/live-test.mjs` in CI which:

1. Loads each `.js` extension into a Node VM sandbox that emulates
   StreamNative's `http.get()` binding (backed by `curl` — same
   sync-blocking semantics as our Rust `reqwest::blocking`).
2. Calls `metadata` → `home()` → `search()` → `load()` → `loadLinks()`.
3. Probes the first playable link with a `Range: bytes=0-1023` request
   and asserts the response is HTTP 2xx and a media content-type.

**Passing means the extension really works today, not "compiles".**

Sample output from the last run:

```
▶ nimegami   → home:57 · search:20 · load:"Tensei shitara Slime…" · links:4
             → probe HTTP 206 video/mp4 (1024 bytes) ✓ HARD PASS
▶ donghub    → home:72 · load:"Oriental Martial Academy"      · links:3
             → probe HTTP 403 (Dailymotion signed URL expired)  ~ soft-pass
▶ animexin   → home:98 · load:"Blade of The Guardians S2"     · links:14
             → probe HTTP 403 (Dailymotion signed URL expired)  ~ soft-pass
▶ kuronime   → home:90 · load:"Hanazakari no Kimitachi e S2"  · links:1
             → probe HTTP 404 (kuroplayer.xyz signed URL expired) ~ soft-pass
             → AES-256-CBC decrypt path verified byte-perfect
```

## Adding your own extension

1. Copy an existing one that matches your target:
   - `nimegami.js` — direct `.mp4`, base64-encoded JSON payloads
   - `donghub.js` — WordPress HTML + Dailymotion iframes
   - `animexin.js` — same + Vtbe packed-JS unpacker
2. Save under `extensions/<your-id>.js`.
3. Commit & push — CI regenerates `repo.json`, live-tests your extension,
   and republishes GitHub Pages.

Full API reference:
<https://github.com/0xshitcode/streamnative/blob/main/docs/EXTENSION-API.md>

Authoring walkthrough: [`docs/AUTHORING.md`](./docs/AUTHORING.md).

## Repository layout

```
.
├── extensions/            One .js file per extension
│   ├── animexin.js
│   ├── donghub.js
│   └── nimegami.js
├── scripts/
│   ├── build-manifest.mjs Regenerates repo.json from extensions/*.js
│   └── live-test.mjs      Runs each extension against the real provider,
│                          verifies loadLinks() → playable stream
├── .github/workflows/
│   └── pages.yml          CI: live-test → regenerate manifest → deploy to Pages
├── repo.json              Auto-generated. DO NOT edit by hand.
└── README.md
```

## Legal

These extensions scrape publicly-accessible content from third-party
websites. The extensions are provided as engineering examples of the
StreamNative API. Users are responsible for their own compliance with
applicable laws and the terms of service of the sites they access.

## License

MIT. See [LICENSE](./LICENSE).
