#!/usr/bin/env node
// build-manifest.mjs
//
// Regenerate `repo.json` at the repo root by scanning `extensions/*.js`.
// Each extension MUST have a top-level `const metadata = { ... };` block —
// the same object the StreamNative extension runtime reads.
//
// Run locally:   node scripts/build-manifest.mjs
// In CI:         see .github/workflows/build-manifest.yml

import { readdir, readFile, writeFile } from "node:fs/promises";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const EXTENSIONS_DIR = join(REPO_ROOT, "extensions");
const MANIFEST_PATH = join(REPO_ROOT, "repo.json");

/** Top-level repo metadata. Edit here if you want a different display name. */
const REPO_INFO = {
  name: "StreamNative Extensions — Example",
  description: "Reference sample repository. Two extensions demonstrating the full StreamNative extension API.",
  version: 1,
};

/**
 * Very small sandboxed evaluator: we only care about the `metadata`
 * declaration, so we run the JS in a Node VM sandbox with stubbed
 * `http` / `console` and then read the `metadata` global.
 */
function extractMetadata(source) {
  const sandbox = {
    console: { log: () => {} },
    http: { get: () => ({ status: 0, body: "", headers: {} }) },
    metadata: undefined,
  };
  // Wrap so a `const metadata = …;` at the top level lands on the sandbox
  // as `sandbox.metadata`.
  const wrapped =
    "(function() { " +
    source.replace(/^(?:const|let|var)\s+metadata\b/m, "metadata") +
    "\n})();";
  try {
    vm.createContext(sandbox);
    vm.runInContext(wrapped, sandbox, { timeout: 500 });
  } catch (err) {
    throw new Error("failed to eval metadata block: " + err.message);
  }
  if (!sandbox.metadata || typeof sandbox.metadata !== "object") {
    throw new Error("no `metadata` object declared at top level");
  }
  return sandbox.metadata;
}

async function main() {
  const entries = await readdir(EXTENSIONS_DIR);
  const jsFiles = entries.filter((n) => n.endsWith(".js")).sort();

  const extensions = [];
  for (const file of jsFiles) {
    const path = join(EXTENSIONS_DIR, file);
    const src = await readFile(path, "utf8");
    const id = file.replace(/\.js$/, "");
    let meta;
    try {
      meta = extractMetadata(src);
    } catch (err) {
      console.error(`✗ ${file}: ${err.message}`);
      process.exitCode = 1;
      continue;
    }
    extensions.push({
      id,
      name: meta.name ?? id,
      description: meta.description ?? null,
      author: Array.isArray(meta.authors) ? meta.authors.join(", ") : null,
      version: meta.version ?? 1,
      language: meta.language ?? "en",
      tvTypes: meta.tvTypes ?? [],
      iconUrl: meta.iconUrl ?? null,
      status: typeof meta.status === "number" ? meta.status : 1,
      url: `extensions/${file}`,
    });
    console.log(`✓ ${file} — ${meta.name ?? id} v${meta.version ?? 1}`);
  }

  const manifest = {
    ...REPO_INFO,
    generatedAt: new Date().toISOString(),
    extensions,
  };
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\nWrote ${MANIFEST_PATH} with ${extensions.length} extension(s).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
