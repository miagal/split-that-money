# Domain deployment

Use this guide when you already own a domain and want **domain mode**: a
publicly trusted HTTPS certificate on phones, while the app stays on your LAN
(or VPN). For the mode overview and Compose checklists, start with the
[README deploy section](../README.md#deploy-to-your-server).

## Why domain mode?

**Local mode** works without a domain: STM’s Caddy issues a private CA, and
every phone must install that root certificate. On iOS that is awkward; Home
Screen / PWA behaviour is weaker than with a normal public certificate. On
Android, Chrome typically will not treat a private CA well enough for a
proper PWA install.


If you **already own a domain**, a better pattern is `Domain mode`:

1. Point a **subdomain** at your NAS **LAN IP** (private, not opened to the internet).
2. Allow that public name on your router if DNS rebind protection blocks it.
3. Run a small **edge reverse proxy** on the NAS that terminates HTTPS with a publicly trusted certificate (e.g. Let’s Encrypt).
4. Forward that hostname to Split That Money’s **HTTP** port.

Phones trust the certificate like any normal website. One edge proxy can host several apps the same way (`stm.example.com`, `git.example.com`, …).

## Shape

```text
Phone  →  https://stm.example.com
       →  DNS (A record → 192.168.x.x, DNS only)
       →  Edge Caddy :443  (Let’s Encrypt)
       →  Split That Money HTTP port (e.g. :8081)
```

DNS maps a name to an IP; it does not know ports. The edge proxy listens on
443, reads the hostname, and proxies to the STM stack.

| Access | UI | Login / writes | Installed PWA |
|--------|----|----------------|---------------|
| `https://<APP_DOMAIN>` | yes | yes | **yes** — only PWA origin |
| `http://<APP_HOST>:<HTTP_PORT>` | yes | optional* | no |

\*Optional login on the HTTP IP URL needs `SESSION_COOKIE_SECURE` and
`CSRF_COOKIE_SECURE` set to `"false"`. Keep that port LAN-only.

## Checklist

1. Create DNS for your subdomain (see below).
2. Add a router exception if DNS rebind protection blocks the name.
3. In STM `docker-compose.yml`: set `x-app-domain`, set `x-app-host` /
   `x-http-port`, and **comment out the HTTPS publish block**.
4. Start or restart the STM stack so it listens on HTTP only.
5. Point your edge reverse proxy at `http://<APP_HOST>:<HTTP_PORT>`.
6. Open `https://<your-domain>` and add the PWA directly to your home screen. This will automatically install/cache the app.

## DNS (Cloudflare example)

Create a normal **A** record (not a proxied / “orange cloud” record):

| Field        | Value                          |
| ------------ | ------------------------------ |
| Type         | A                              |
| Name         | `stm` → `stm.example.com`      |
| IPv4 address | NAS LAN IP, e.g. `192.168.x.x` |
| Proxy status | **DNS only** (grey cloud)      |

The private IP is intentional. The name must resolve on your LAN (and via VPN if you use one). You are not publishing the app on the public internet.

Many home routers (e.g. Fritz!Box) block public names that resolve to private IPs. Add an exception for your hostname (DNS rebind protection).

For Let’s Encrypt **DNS-01**, create an API token that can edit DNS for that zone. Put the token only on the **edge** Caddy stack, not in Split That Money.

## Edge reverse proxy (Caddy + Cloudflare DNS-01)

Example image build and site for Split That Money only. Use any reverse proxy
you prefer; Caddy is shown because it fits a home NAS well.

```bash
# Build a Caddy image that includes the Cloudflare DNS module.
sudo docker build -t local/caddy-cloudflare:2 - <<'EOF'
FROM caddy:2-builder AS builder
RUN xcaddy build --with github.com/caddy-dns/cloudflare
FROM caddy:2-alpine
COPY --from=builder /usr/bin/caddy /usr/bin/caddy
EOF
```

```yaml
services:
  caddy:
    image: local/caddy-cloudflare:2
    container_name: local-proxy
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    environment:
      # Token from your DNS provider (Cloudflare example).
      CF_API_TOKEN: ${CF_DNS_API_TOKEN}
    volumes:
      - caddy_data:/data
      - caddy_config:/config
    command:
      - sh
      - -c
      - |
        cat > /etc/caddy/Caddyfile <<'EOF'
        {
        	local_certs
        }
        stm.example.com {
        	tls {
        		dns cloudflare {env.CF_API_TOKEN}
        	}
        	reverse_proxy http://192.168.xx.xx:<HTTP PORT OF YOUR STM STACK>
        }
        EOF
        caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
        exec caddy run --config /etc/caddy/Caddyfile --adapter caddyfile

volumes:
  caddy_data:
  caddy_config:
```

Replace the hostname, LAN IP, and STM HTTP port with your values. The proxy image must include the Cloudflare DNS module (custom `xcaddy` build or an equivalent image you maintain).

## Split That Money Compose (domain mode)

In this repo’s `docker-compose.yml`:

1. Set `x-app-domain` to the same hostname, e.g. `stm.example.com`.
2. Comment out the HTTPS publish block marked local-mode only (STM speaks HTTP behind the proxy).
3. Keep publishing the HTTP port that the edge proxy targets.

Cookie defaults stay `"true"` (HTTPS-only). Set `SESSION_COOKIE_SECURE` and `CSRF_COOKIE_SECURE` to `"false"` only if you also want login on the plain `http://<LAN-IP>:<HTTP_PORT>` debug URL. Do not expose that port beyond a strusted LAN.

## Using the app

- Install and use the PWA from **`https://stm.example.com`** (or your hostname).
- The HTTP IP URL is optional for debugging; it is not a second offline PWA
  origin (browsers do not treat plain HTTP LAN URLs as a secure context).

## Prefer local mode instead?

Leave `x-app-domain` empty, keep HTTPS published, keep cookie Secure
`"true"`, and use `/offline_setup` on each phone. Prefer domain mode when you
have a domain — fewer device steps and better certificate support on phones.
See the [README](../README.md#local-mode-checklist) for the local checklist.
