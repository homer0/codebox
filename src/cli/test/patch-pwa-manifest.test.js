import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

describe('PWA manifest patch', () => {
  const PATCH_TIMEOUT = 5000;

  it('leaves an already-patched route unchanged and preserves adjacent code', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'codebox-manifest-'));
    try {
      const manifest = join(directory, 'manifest.json');
      const routes = join(directory, 'vscode.js');
      const before = 'const before = true;\n';
      const after = '\nlet mintKeyPromise;\nconst after = true;\n';
      await writeFile(
        manifest,
        JSON.stringify({ name: 'Codebox "test"', start_url: '{{BASE}}' }),
      );
      await writeFile(
        routes,
        `${before}exports.router.get("/manifest.json", wrap((req, res) => {\n}));${after}`,
      );
      const patch = () =>
        execFileSync(process.execPath, ['src/patch-pwa-manifest.mjs', manifest, routes], {
          timeout: PATCH_TIMEOUT,
        });

      patch();
      const patched = await readFile(routes, 'utf8');
      assert.ok(patched.startsWith(before));
      assert.ok(patched.endsWith(after));
      assert.ok(patched.includes('application/manifest+json'));
      assert.ok(patched.includes('{{BASE}}'));

      patch();
      assert.equal(await readFile(routes, 'utf8'), patched);
    } finally {
      await rm(directory, { recursive: true });
    }
  });
});
