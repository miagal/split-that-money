# Build the PWA and serve its production assets with Caddy.
FROM node:22-alpine AS frontend-build

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM caddy:2-alpine

COPY caddy/Caddyfile /etc/caddy/Caddyfile
COPY caddy/Caddyfile.domain /etc/caddy/Caddyfile.domain
COPY caddy/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
COPY --from=frontend-build /frontend/dist /srv

ENTRYPOINT ["/docker-entrypoint.sh"]
