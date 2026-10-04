# Split That Money

Split That Money is a self-hosted app for tracking shared expenses in a small circle of people: 
households, trips, and similar groups. 
It runs on your own NAS or server. No public domain, cloud account, or internet-facing port is required.

Phones install it as a local PWA over HTTPS on your LAN. After that the app keeps working offline. 
New expenses stay on the device and sync when the server is reachable again.

## Deploy to your server

For a normal deployment, the three values at the top of `docker-compose.yml`
are the only server-specific network settings to update:

```yaml
x-app-host: &app_host "192.168.178.xx" # Active IPv4 address of your server/NAS
x-http-port: &http_port "8080"          # HTTP Offline setup and certificate download
x-https-port: &https_port "8443"        # HTTPS application and PWA URL. Important if you want to use the app offline on your mobile
```

Before the deployment on your host, check that those ports are still free before
starting the stack. Change the numbers if you changed the Compose values:

```bash
ss -lnt | grep -E ':8080|:8443' || echo "8080 and 8443 look free"
```

If the command prints listen lines, pick other ports or stop the process that
owns them.

### Common settings

| Variable | Default | Effect |
|----------|---------|--------|
| `DJANGO_SECRET_KEY` | `change-this-secret-key-in-production` | Secret used to sign sessions and cookies. Replace it on a real NAS. Changing it signs everyone out. |
| `DATABASE_NAME` | `split_that_money.sqlite3` | SQLite file name. Compose stores it at `/data/split_that_money.sqlite3` so it survives container rebuilds. |
| `LOG_LEVEL` | `INFO` | Verbosity of application logs in `backend/app/logs/app.log` and the container log volume. |
| `SESSION_COOKIE_AGE_DAYS` | `30` | Days a server sign-in stays valid. After expiry the app keeps working offline and asks for a new sign-in to sync. |
| `SHELL_NETWORK_TIMEOUT_SECONDS` | `3` | Seconds a cold start waits for the server before using the cached PWA app. Applies from the start after the app has loaded the new value. |
| `SYNC_REQUEST_TIMEOUT_SECONDS` | `8` | Seconds one GUI sync request waits for the server before aborting. Stops the Syncing badge from hanging when the NAS is unreachable. |
| `ALLOW_SELF_REGISTRATION` | `true` | Shows account registration on the login page. If `false` the app admin creates the new user accounts. |
| `SESSION_COOKIE_SECURE` / `CSRF_COOKIE_SECURE` | `true` | Send cookies over HTTPS only. |

The startup script is a convenient deployment approach because it also checks the server IP, ports and certificate:

```bash
./scripts/start-production.sh
```

Use `.env` when you need to configure application values beyond the network address.
The same values can be configured over the `environment:` section of the docker-compose.


For a manual Compose build workflow, use:

```bash
docker compose config -q
docker compose up -d --build
docker compose logs --tail=100 frontend
```

### Enable offline mode on your mobile device.

After adding a shortcut of the application to your Home Screen,
open `http://<SERVER-IP>:<HTTPS-PORT>/offline_setup` and follow the instructions.
This page provides the download for the local Caddy root certificate. 
The Installation of the certificate allows you to use the application without a permanent connection
to your server, and will save your your newly added expenses, when you are connected back
with the server.

## Production-like local test

Use Docker/Caddy when testing the installed PWA, HTTPS, certificate setup, or
offline behavior. `npm run dev` is faster for UI work, but it does not test the
same trusted HTTPS origin that a phone installation uses.

1. Set `x-app-host` in `docker-compose.yml` to an active LAN IP of the current
   computer. Keep `x-http-port` and `x-https-port` free on that computer.
2. Create a root `.env` file from `.env.example` and set secure values when
   required for the test.
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

Copy `backend/.env.example` to `backend/.env` (gitignored). 
Set the PC's current IPv4 address in both lists and keep cookies usable over Vite's HTTP.
Other devices on the same local network will open `http://<this-PC-IP>:5173` and Vite proxies `/api` to Django:

```dotenv
# 192.168.178.xx is this development PC's LAN IP, not the phone's IP.
ALLOWED_HOSTS=localhost,127.0.0.1,192.168.178.xx
CSRF_TRUSTED_ORIGINS=http://127.0.0.1:5173,http://localhost:5173,http://192.168.178.xx:5173
SESSION_COOKIE_SECURE=false
CSRF_COOKIE_SECURE=false
```

Do not set `APP_HOST` here. That switches Django to the HTTPS Compose origin.
A one-off override: `LOG_LEVEL=DEBUG sh ./scripts/start-backend.sh --local`.

### Frontend

Requires a current Node.js LTS version. In a second terminal, run:

```bash
cd frontend
npm ci
npm run dev -- --host
```

On this computer open `http://localhost:5173`. On a phone on the same LAN open
`http://<LAN-IP>:5173`. Vite proxies `/api` to Django on this machine.

## Verify changes

```bash
cd backend && pytest -q
cd frontend && npm test && npm run lint && npm run build
```
