#!/bin/sh
set -eu
domain=$(printf '%s' "${APP_DOMAIN:-}" | tr -d '[:space:]')
if [ -n "$domain" ]; then
  config=/etc/caddy/Caddyfile.domain
else
  config=/etc/caddy/Caddyfile
fi
exec caddy run --config "$config" --adapter caddyfile
