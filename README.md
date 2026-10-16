# Split That Money

Split That Money is a self-hosted app for tracking shared expenses in a small circle of people:
households, trips, and similar groups.
It runs on your own NAS or server. No public domain, cloud account, or internet-facing port is required.

Phones install it as a local PWA over HTTPS on your LAN. After that the app keeps working offline.
New expenses stay on the device and sync when the server is reachable again.

## Deploy to your server

Pick a deployment mode, then set the four values at the top of `docker-compose.yml`.

### Choose a mode

| | **Local mode** (default) | **Domain mode** (recommended if you own a domain) |
|---|---|---|
| When | No domain, or you want the simplest stack | You already own a domain / subdomain |
| `x-app-domain` | Leave empty `""` | Your hostname, e.g. `"stm.example.com"` |
| App URL / PWA origin | `https://<IP>:<HTTPS_PORT>` | `https://<your-domain>` (port 443 at the edge) |
| TLS | STM Caddy + local CA | Edge reverse proxy (e.g. NAS Caddy + Let's Encrypt) |
| Phone setup | Install local root cert via `/offline_setup` | Normal public certificate — no local CA |
| Ports to publish | HTTP + HTTPS | HTTP only (comment out the HTTPS publish block) |

Local mode needs no domain. Domain mode still keeps traffic on your LAN (or VPN); it only makes certificates easier on phones. Full domain steps: [Domain deployment](docs/domain-deployment.md).

### Network settings (edit these first)

```yaml
x-app-domain: &app_domain ""             # Empty = local mode; hostname = domain mode
x-app-host: &app_host "192.168.178.xx"   # Active IPv4 address of your server/NAS
x-http-port: &http_port "8081"           # HTTP: local setup / cert download, or proxy target in domain mode
x-https-port: &https_port "8443"         # Local mode only: HTTPS app and PWA port
```

| Anchor | Required | Local mode | Domain mode |
|--------|----------|------------|-------------|
| `x-app-domain` | Yes (may be empty) | Leave `""` | Set to your subdomain |
| `x-app-host` | Yes | Server LAN IPv4 | Same |
| `x-http-port` | Yes | Setup + cert download | Port your edge proxy forwards to |
| `x-https-port` | Local only | PWA HTTPS port | Unused — comment out the HTTPS `ports:` block |

Check that the ports you publish are free before starting (adjust the numbers if you changed Compose):

```bash
ss -lnt | grep -E ':8081|:8443' || echo "8081 and 8443 look free"
```

If the command prints listen lines, pick other ports or stop the process that owns them.

### Local mode checklist

1. Leave `x-app-domain` empty.
2. Set `x-app-host`, `x-http-port`, and `x-https-port`.
3. Keep both HTTP and HTTPS port publishes enabled.
4. Keep `SESSION_COOKIE_SECURE` and `CSRF_COOKIE_SECURE` set to `"true"`.
5. Start the stack (see below).
6. On each phone: open `http://<SERVER-IP>:<HTTP-PORT>/offline_setup`, install the Caddy root certificate, then open the HTTPS URL and add it to the Home Screen.

More detail: [iOS Home Screen and local HTTPS](docs/ios-home-screen-and-local-https.md).

### Domain mode checklist

1. Set `x-app-domain` to your hostname (e.g. `stm.example.com`).
2. Set `x-app-host` and `x-http-port`.
3. Comment out the HTTPS publish block marked local-mode only in `docker-compose.yml`.
4. Point DNS and an edge reverse proxy at `http://<APP_HOST>:<HTTP_PORT>` — see [Domain deployment](docs/domain-deployment.md).
5. Start the stack.
6. Install and use the PWA only from `https://<your-domain>`.

### Application settings

These live under `environment:` in `docker-compose.yml`. You can also load them from a root `.env` file (uncomment `env_file: .env` on the backend service).

**Security and access**

| Variable | Default | Notes |
|----------|---------|--------|
| `DJANGO_SECRET_KEY` | `change-this-secret-key-in-production` | Replace on a real NAS. Changing it signs everyone out. |
| `SESSION_COOKIE_SECURE` / `CSRF_COOKIE_SECURE` | `"true"` | HTTPS-only cookies. In domain mode, set both to `"false"` only if you also need login on the plain `http://<IP>:<HTTP_PORT>` debug URL; keep that port LAN-only. |
| `ALLOW_SELF_REGISTRATION` | `true` | Registration on the login page. If `false`, an admin creates accounts. |
| `SESSION_COOKIE_AGE_DAYS` | `30` | Days a server sign-in stays valid. Offline data survives expiry; sign in again to sync. |

**Data and behaviour**

| Variable | Default | Notes |
|----------|---------|--------|
| `DATABASE_NAME` | `/data/split_that_money.sqlite3` | SQLite path inside the container; survives rebuilds via the data volume. |
| `LOG_LEVEL` | `INFO` | Application log verbosity. |
| `SHELL_NETWORK_TIMEOUT_SECONDS` | `3` | Cold start: how long the PWA waits for the server before using the cached shell. |
| `SYNC_REQUEST_TIMEOUT_SECONDS` | `8` | How long one GUI sync request waits before aborting. |

The network anchors above are copied into the containers as `APP_DOMAIN`, `APP_HOST`, `HTTP_PORT`, and `HTTPS_PORT`. You normally edit only the four `x-…` lines at the top of Compose.

### Start the stack

The startup script checks the server IP, ports, and (in local mode) the certificate:

```bash
./scripts/start-production.sh
```

Manual Compose workflow:

```bash
docker compose config -q
docker compose up -d --build
docker compose logs --tail=100 frontend
```

## Production-like local test

Use Docker/Caddy when testing the installed PWA, HTTPS, certificate setup, or
offline behavior. `npm run dev` is faster for UI work, but it does not test the
same trusted HTTPS origin that a phone installation uses.

1. Set `x-app-host` in `docker-compose.yml` to an active LAN IP of the current
   computer. Keep `x-http-port` and `x-https-port` free on that computer.
2. Create a root `.env` file if you need non-default application values.
3. Run:

   ```bash
   ./scripts/start-production.sh
   ```

4. Open `https://<IP>:<HTTPS-PORT>/` in a browser on the same network.

The script refuses to run if `x-app-host` does not belong to the current
machine. After startup, it validates Compose, Caddy, the HTTPS certificate,
and the public setup endpoints. If an old leaf certificate has the wrong IP,
it archives that renewable certificate and lets Caddy issue a replacement.

### Reset volumes

Rebuilding containers does not reset volumes. The volume prefix is the Compose
project name (`split-that-money` in a normal checkout).

Caddy only: new HTTPS certificate authority. Phones must install the new
certificate. Users, groups, and expenses stay.

```bash
docker compose down
docker volume rm split-that-money_caddy_data split-that-money_caddy_config
./scripts/start-production.sh
```

Backend only: empty app database and logs. The certificate stays; phones keep
trusting the server.

```bash
docker compose down
docker volume rm split-that-money_backend_data split-that-money_backend_logs
./scripts/start-production.sh
```

Both: new certificate authority and empty database.

```bash
docker compose down -v
./scripts/start-production.sh
```

Keep the LAN IP, HTTPS port, and Caddy data volume stable. They are the
installed PWA origin. How updates, offline start, and a cached session work is
in [docs/pwa-updates.md](docs/pwa-updates.md).

## Development

Run the backend and frontend in separate terminals. The Vite development server
proxies `/api` requests to the Django backend at `http://127.0.0.1:8000`.

Two local UI modes:

| Mode | When | App URL |
| --- | --- | --- |
| **HTTP LAN** (default) | Fast UI work on this PC / LAN | `http://localhost:5173` or `http://<LAN-IP>:5173` |
| **Domain-feeling** | Test domain-mode behaviour behind your own TLS reverse proxy | `https://<your-subdomain>` only |

### Backend

Requires Python 3.11 or newer. From the repository root:

```bash
sh ./scripts/start-backend.sh --local --install
```

| Command | Use |
| --- | --- |
| `sh ./scripts/start-backend.sh --local` | Starts Django's local development server inside `./backend/.venv`. |
| `sh ./scripts/start-backend.sh --local --install` | Installs Python dependencies, then starts the local server. |
| `sh ./scripts/start-backend.sh` | Docker-only command; starts Gunicorn inside the backend container. |

Without the script:

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.txt
cp .env.example .env
python manage.py migrate --noinput
python manage.py bootstrap_admin
python manage.py runserver
```

Copy `backend/.env.example` to `backend/.env` (gitignored). Pick one of the two
blocks documented in that file.

**HTTP LAN:** keep the default `ALLOWED_HOSTS` / `CSRF_TRUSTED_ORIGINS` / insecure
cookies. Add your LAN IP if phones open `http://<IP>:5173`. Do **not** set
`APP_DOMAIN` or `APP_HOST`.

**Domain-feeling:** set `APP_DOMAIN` to the subdomain your reverse proxy
terminates, keep `APP_HOST=127.0.0.1`, and use Secure cookies. Django then
derives hosts and CSRF (`LOCAL_CA_SETUP` becomes false). Point the proxy at
Vite on port `5173`. Open only `https://<subdomain>` — not `:5173`.

A one-off override: `LOG_LEVEL=DEBUG sh ./scripts/start-backend.sh --local`.

### Frontend

Requires a current Node.js LTS version. In a second terminal:

**HTTP LAN**

```bash
cd frontend
npm ci
npm run dev
```

Open `http://localhost:5173` (or `http://<LAN-IP>:5173` on the same network).

**Domain-feeling** (same machine; your TLS proxy forwards to Vite)

```bash
cd frontend
DEV_DOMAIN=stm-dev.<YOUR-DOMAIN>.com npm run dev
```

Replace the hostname with your subdomain. That sets Vite HMR to `wss` on port
443 and allows that host. The proxy must forward HTTP and the Vite WebSocket
to `http://<this-PC>:5173`.

## Verify changes

```bash
cd backend && pytest -q
cd frontend && npm test && npm run lint && npm run build
```
