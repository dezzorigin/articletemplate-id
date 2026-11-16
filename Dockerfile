# ArticleTemplate.id - image produksi untuk Coolify (Astro SSR, Node standalone).
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4321
COPY --from=build /app/dist ./dist
# Install production-only: devDependencies (TypeScript, @types/*) tidak ikut
# ke image runtime. package-lock.json disertakan agar `npm ci` deterministik.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
EXPOSE 4321
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s \
  CMD wget -qO- http://127.0.0.1:4321/api/health || exit 1
USER node
CMD ["node", "./dist/server/entry.mjs"]
