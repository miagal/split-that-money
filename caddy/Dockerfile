# Build the PWA and serve its production assets with Caddy.
FROM node:22-alpine AS frontend-build

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci

COPY frontend/ ./
# Identity of the running frontend. Vite inlines these into the JS bundle before Caddy copies dist.
#   GitHub Action passes vX.Y.Z + short commit hash.
ARG APP_VERSION=lcl-cntr
ARG APP_GIT=
ENV VITE_APP_VERSION=$APP_VERSION
ENV VITE_APP_GIT=$APP_GIT
RUN npm run build

FROM caddy:2-alpine

COPY caddy/Caddyfile /etc/caddy/Caddyfile
COPY caddy/Caddyfile.domain /etc/caddy/Caddyfile.domain
COPY caddy/docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh
COPY --from=frontend-build /frontend/dist /srv

ENTRYPOINT ["/docker-entrypoint.sh"]
