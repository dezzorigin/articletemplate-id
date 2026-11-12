// Baca env saat RUNTIME (process.env) dengan fallback ke import.meta.env (dev).
// Di Coolify, isi variabel lewat dashboard - tidak pernah di repo.
function read(name: string): string | undefined {
  const fromProcess =
    typeof process !== 'undefined' ? process.env?.[name] : undefined;
  const value = fromProcess ?? ((import.meta as any).env ?? {} as Record<string, string | undefined>)[name];
  return value && value.trim() !== '' ? value : undefined;
}

/** Wajib ada. Gagal dengan pesan jelas, bukan placeholder diam-diam. */
export function requireEnv(name: string): string {
  const value = read(name);
  if (!value) {
    throw new Error(
      `Env wajib "${name}" belum diisi. Lihat .env.example dan README.md (bagian Coolify).`,
    );
  }
  return value;
}

export function optionalEnv(name: string): string | undefined {
  return read(name);
}
