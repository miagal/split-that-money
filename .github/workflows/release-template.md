## New Deployment
**Docker Image Versions:** `{{VERSION}}`

### 1. Choose a mode

| | **Local mode** | **Domain mode** |
|---|---|---|
| `x-app-domain` | Leave `""` | Your hostname, e.g. `"stm.example.com"` |
| Ports | Publish HTTP + HTTPS | Publish HTTP only; comment out the HTTPS block |
| Phone TLS | Install local CA via `/offline_setup` | Public cert via your edge reverse proxy |

Domain mode details: [Domain deployment]({{FILE_BASE}}/docs/domain-deployment.md).
Full checklists and variable tables: [README — Deploy]({{FILE_BASE}}/README.md#deploy-to-your-server).

### 2. Set the four network anchors

Edit the top of `docker-compose.yml` (or paste the Compose block below):

- `x-app-domain` — empty for local mode; hostname for domain mode
- `x-app-host` — active IPv4 address of your NAS/server
- `x-http-port` — local setup / cert download, or the port your edge proxy targets
- `x-https-port` — local-mode HTTPS / PWA port only

Then check that those ports are free (adjust the port numbers if you changed them):

```bash
ss -lnt | grep -E ':8081|:8443' || echo "8081 and 8443 look free"
```

If that command prints listen lines, pick other ports or stop the process that owns them.

### 3. Review application settings

In the Compose `environment:` section (or a root `.env` if you enable `env_file`):

| Variable | Typical action |
|----------|----------------|
| `DJANGO_SECRET_KEY` | Replace the default on a real deployment |
| `SESSION_COOKIE_SECURE` / `CSRF_COOKIE_SECURE` | Keep `"true"` unless you need HTTP IP login in domain mode |
| `SESSION_COOKIE_AGE_DAYS`, timeouts, `LOG_LEVEL`, `DATABASE_NAME` | Optional; defaults are fine for most installs |

---

### Docker Compose


```yaml
# Local: leave x-app-domain empty; keep both port publishes.
# Domain: set x-app-domain; comment out the HTTPS ports block below.
x-app-domain: &app_domain ""
x-app-host: &app_host "192.168.xx.xx"
x-http-port: &http_port "8081"
x-https-port: &https_port "8443"

services:
  backend:
    container_name: stm-backend
    image: {{BACKEND_IMAGE}}:{{VERSION}}
    environment:
      DATABASE_NAME: /data/split_that_money.sqlite3
      LOG_LEVEL: "INFO"
      DJANGO_SECRET_KEY: "change-this-secret-key-in-production"

      # Shared public values let Django derive its allowed host and CSRF origin.
      APP_DOMAIN: *app_domain
      APP_HOST: *app_host
      HTTPS_PORT: *https_port
      HTTP_PORT: *http_port

      # Keep "true" for HTTPS-only cookies. In domain mode, set both to "false" only if
      # you also need login on http://<APP_HOST>:<HTTP_PORT> (LAN debug URL — do not expose it).
      SESSION_COOKIE_SECURE: "true"
      CSRF_COOKIE_SECURE: "true"

      # Days a server sign-in stays valid; offline data survives expiry and syncs after the same user signs in again.
      SESSION_COOKIE_AGE_DAYS: "30"
      # Seconds the installed React Gui app waits for the server before starting from its cached shell.
      SHELL_NETWORK_TIMEOUT_SECONDS: "3"
      # Seconds one GUI sync request waits before aborting so Syncing cannot hang.
      SYNC_REQUEST_TIMEOUT_SECONDS: "8"
    volumes:
      - backend_data:/data
      - backend_logs:/app/app/logs
    restart: unless-stopped

  frontend:
    container_name: stm-frontend
    image: {{FRONTEND_IMAGE}}:{{VERSION}}
    depends_on:
      - backend
    environment:
      APP_DOMAIN: *app_domain
      # Fixed IP address of the device running this Compose stack.
      APP_HOST: *app_host
      # Local mode: public PWA port. Unused in domain mode.
      HTTPS_PORT: *https_port
      # Local mode: setup page and root cert. Domain mode: app for the edge proxy.
      HTTP_PORT: *http_port
    ports:
      # Always publish HTTP (local setup / cert download, or domain proxy target).
      - target: *http_port
        published: *http_port
        protocol: tcp
      # Local mode only — comment out this HTTPS block when APP_DOMAIN is set.
      - target: *https_port
        published: *https_port
        protocol: tcp
    volumes:
      - caddy_data:/data
      - caddy_config:/config
    restart: unless-stopped

volumes:
  backend_data:
  backend_logs:
  caddy_data:
  caddy_config:
```

---

### Added
- [Click edit to add new features]

### Fixed
- [Click edit to add bug fixes]
