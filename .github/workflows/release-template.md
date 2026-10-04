## New Deployment
**Docker Image Versions:** `{{VERSION}}`

Before you start the stack, set the three values at the top of `docker-compose.yml` to this server:

- `x-app-host`: active IPv4 address of the NAS or host
- `x-http-port`: HTTP port for offline setup and the certificate download
- `x-https-port`: HTTPS port for the app and the installed PWA

Then check that those ports are free. If you changed the Compose ports, change the numbers here too:

```bash
ss -lnt | grep -E ':8080|:8443' || echo "8080 and 8443 look free"
```

If that command prints listen lines, pick other ports or stop the process that owns them.

---

### Docker Compose

Save as `docker-compose.yml`, update the three values above, then run `docker compose up -d`.

```yaml
# Update these three values for the NAS that runs this stack.
x-app-host: &app_host "192.168.178.110"
x-http-port: &http_port "8080"
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
      APP_HOST: *app_host
      HTTPS_PORT: *https_port
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
      # Fixed IP address of the device running this Compose stack.
      APP_HOST: *app_host
      # Public PWA port; it is part of the installed app's URL.
      HTTPS_PORT: *https_port
      # Public HTTP port for first-device setup and certificate download.
      HTTP_PORT: *http_port
    ports:
      # Publish the configured HTTPS port unchanged inside the frontend container.
      - target: *https_port
        published: *https_port
        protocol: tcp
      # Publish the configured HTTP bootstrap port unchanged inside the frontend container.
      - target: *http_port
        published: *http_port
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
