import { defineConfig } from 'astro/config';
import node from '@astrojs/node';
import react from '@astrojs/react';

// Deploy target: Coolify (Docker, Node standalone). Lihat Dockerfile + README.md.
// output: 'server' - halaman akun/checkout/admin dirender di server.
export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  integrations: [react()],
  server: { host: true },
});
