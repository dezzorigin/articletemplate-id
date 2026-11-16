// Bantuan untuk tes unit: bundel satu modul TS dari src/lib dengan esbuild
// (pola yang sama dengan scripts/test-borderpay.mjs), lalu import hasilnya.
// Tanpa jaringan dan tanpa kredensial — hanya logika murni yang diuji.
// File ini BUKAN tes (namanya tidak cocok pola node --test) — hanya helper.
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = join(fileURLToPath(import.meta.url), '..', '..');

export async function loadLib(rel) {
  const outDir = mkdtempSync(join(tmpdir(), 'at-test-'));
  const bundle = join(outDir, 'lib.mjs');
  execFileSync(join(root, 'node_modules', '.bin', 'esbuild'), [
    join(root, 'src', 'lib', rel),
    '--bundle',
    '--platform=node',
    '--format=esm',
    // Di luar Astro, import.meta.env tidak ada: anggap mode non-produksi.
    '--define:import.meta.env.PROD=false',
    `--outfile=${bundle}`,
  ], { stdio: 'pipe' });
  const mod = await import(pathToFileURL(bundle).href);
  rmSync(outDir, { recursive: true, force: true });
  return mod;
}
