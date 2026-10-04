# Build the PWA and serve its production assets with Caddy.
FROM node:22-alpine AS frontend-build

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
RUN npm run build

FROM caddy:2-alpine

COPY caddy/Caddyfile /etc/caddy/Caddyfile
COPY --from=frontend-build /frontend/dist /srv
