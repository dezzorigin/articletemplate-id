import { defineConfig } from 'astro/config';
import node from '@astrojs/node';

// Deploy target: Coolify (Docker, Node standalone). Lihat Dockerfile + README.md.
// output: 'server' - halaman akun/checkout/admin dirender di server.

// PENTING: tanpa allowedDomains Astro tidak memercayai header Host/X-Forwarded-*,
// sehingga dianggap berada di http://localhost dan SEMUA form POST ditolak 403
// (cek origin anti-CSRF). Tambahkan domain tambahan lewat env ALLOWED_HOSTS
// (pisahkan koma), mis. domain sementara dari Coolify. Env ini dibaca saat BUILD.
const extraHosts = (process.env.ALLOWED_HOSTS ?? '')
  .split(',')
  .map((h) => h.trim())
  .filter(Boolean);

export default defineConfig({
  output: 'server',
  adapter: node({ mode: 'standalone' }),
  server: { host: true },
  security: {
    allowedDomains: [
      { hostname: 'articletemplate.id' },
      { hostname: 'www.articletemplate.id' },
      { hostname: 'localhost' },
      { hostname: '127.0.0.1' },
      ...extraHosts.map((hostname) => ({ hostname })),
    ],
  },
});
