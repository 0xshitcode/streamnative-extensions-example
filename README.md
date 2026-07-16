# StreamNative Extensions — Example

Reference sample repository for [**StreamNative**](https://github.com/0xshitcode/streamnative).

Two extensions demonstrate the full StreamNative extension API:

| ID              | Kind            | Description                                                                                       |
| --------------- | --------------- | ------------------------------------------------------------------------------------------------- |
| `demo_static`   | Static (offline) | Six-title in-memory catalog. Streams Mux's public HLS test asset. Use as a first-install smoke test. |
| `openlibrary`   | Live network    | Searches the [Open Library](https://openlibrary.org/) public API. Uses `http.get()`, pagination, and JSON→SearchResult mapping. |

## Install into StreamNative

1. Open the app.
2. **Settings → Providers → Repositories**.
3. Paste the manifest URL:
   ```
   https://0xshitcode.github.io/streamnative-extensions-example/repo.json
   ```
4. Click **Preview** to see the two extensions, then **Add**.
5. Click **Install** next to each extension.
6. Go **Home** — the two new rails should appear.

## Repository layout

```
.
├── extensions/            One .js file per extension.
│   ├── demo_static.js
│   └── openlibrary.js
├── scripts/
│   └── build-manifest.mjs Regenerates repo.json from extensions/*.js
├── .github/workflows/
│   └── pages.yml          Runs the manifest builder + deploys to Pages
├── repo.json              Auto-generated. DO NOT edit by hand.
└── README.md
```

## Building the manifest locally

```bash
node scripts/build-manifest.mjs
```

The script reads each `extensions/*.js`, extracts the top-level
`metadata = { … }` object in a sandboxed Node VM, and writes
[`repo.json`](./repo.json). Committing your `.js` and pushing to
`main` triggers the same build in GitHub Actions.

## Adding your own extension

1. Copy [`extensions/demo_static.js`](./extensions/demo_static.js) as a
   starting template.
2. Change the `metadata` block (`name`, `description`, `tvTypes`, …).
3. Implement your hooks: `home()`, `search(q)`, `load(url)`,
   `loadLinks(url)`. Only `metadata` + `search` are required.
4. Save under `extensions/<your-id>.js`.
5. Commit & push. CI regenerates `repo.json` and republishes GitHub Pages.

Full API reference:
<https://github.com/0xshitcode/streamnative/blob/main/docs/EXTENSION-API.md>

## Notes

- Extensions run in a sandboxed QuickJS runtime with a 64 MiB memory
  cap. No DOM, no Node globals, no filesystem access. The only I/O
  available is `http.get(url, opts?)`.
- The Mux HLS URL used by the demos is a well-known public test asset
  (`Big Buck Bunny`), safe to embed.
- The Open Library extension is a real network extension — treat it as
  a working reference for anyone porting a Cloudstream provider.

## License

MIT. See [LICENSE](./LICENSE).
