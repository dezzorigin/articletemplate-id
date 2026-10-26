import { defineConfig } from 'astro/config';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';

// Deploy target: Cloudflare Pages/Workers (lihat README.md).
// Halaman yang tidak butuh data user dibuat statis oleh Astro;
// halaman akun/checkout/admin dirender di server (output: 'server').
export default defineConfig({
  output: 'server',
  adapter: cloudflare(),
  integrations: [react()],
});
