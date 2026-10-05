#!/usr/bin/env bash
# Starts the local production stack after verifying its IP address and HTTPS certificate.
# The script keeps Caddy's root CA intact because phones trust that persistent certificate.

set -euo pipefail

project_root=$(cd "$(dirname "$0")/.." && pwd)
compose_file="$project_root/docker-compose.yml"
root_certificate_path='/data/caddy/pki/authorities/local/root.crt'
leaf_certificates_path='/data/caddy/certificates/local'

# Reads one deliberately centralized deployment value without accepting a silently changed Compose structure.
read_compose_value() {
  local key=$1
  local value

  value=$(sed -nE "s/^[[:space:]]*${key}:[[:space:]]*\&[a-z_]+[[:space:]]*\"([^\"]+)\"[[:space:]]*$/\1/p" "$compose_file")
  if [ "$(printf '%s\n' "$value" | sed '/^$/d' | wc -l)" -ne 1 ]; then
    echo "Expected exactly one ${key} value in docker-compose.yml." >&2
    exit 2
  fi

  printf '%s\n' "$value"
}

# Validates the fixed IPv4 address and host ports before Docker receives them.
validate_deployment_values() {
  local value
  for value in "$app_host"; do
    if ! [[ "$value" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]] || ! awk -F. '{ for (i = 1; i <= 4; i++) if ($i > 255) exit 1 }' <<< "$value"; then
      echo "x-app-host must be a valid IPv4 address, got: $value" >&2
      exit 2
    fi
  done

  for value in "$http_port" "$https_port"; do
    if ! [[ "$value" =~ ^[1-9][0-9]{0,4}$ ]] || [ "$value" -gt 65535 ]; then
      echo "Deployment ports must be between 1 and 65535, got: $value" >&2
      exit 2
    fi
  done

  if [ "$http_port" = "$https_port" ]; then
    echo "x-http-port and x-https-port must use different ports." >&2
    exit 2
  fi
}

# Prints this host's current global IPv4 addresses. Linux uses iproute2; macOS uses ifconfig.
list_active_ipv4() {
  case "$(uname -s)" in
    Darwin)
      ifconfig -a inet | awk '/inet / && $2 !~ /^127\./ && $2 !~ /^169\.254\./ { print $2 }'
      ;;
    *)
      ip -4 -o addr show up scope global | awk '{ split($4, address, "/"); print address[1] }'
      ;;
  esac
}

# Stops before Docker runs when a required host tool is missing.
require_host_commands() {
  local command
  for command in docker curl openssl cmp; do
    command -v "$command" >/dev/null || {
      echo "Required command is not available: $command" >&2
      exit 2
    }
  done
  case "$(uname -s)" in
    Darwin)
      command -v ifconfig >/dev/null || {
        echo "Required command is not available: ifconfig" >&2
        exit 2
      }
      ;;
    *)
      command -v ip >/dev/null || {
        echo "Required command is not available: ip" >&2
        exit 2
      }
      ;;
  esac
}

# Stops before startup when Compose points at another device; changing it would also change the PWA origin.
verify_host_address() {
  if ! list_active_ipv4 | grep -Fx -- "$app_host" >/dev/null; then
    echo "Configured x-app-host ($app_host) is not assigned to this host." >&2
    echo "Update x-app-host in docker-compose.yml to one of this host's active IPv4 addresses:" >&2
    list_active_ipv4 | awk '{ print "  " $1 }' >&2
    exit 1
  fi
}

# Waits briefly for the freshly started HTTPS listener without treating the private CA as a system trust anchor.
wait_for_https() {
  local attempt
  for attempt in $(seq 1 15); do
    if curl --insecure --fail --silent --show-error --connect-timeout 2 --max-time 5 "https://${app_host}:${https_port}/" >/dev/null; then
      return
    fi
    sleep 2
  done

  echo "HTTPS listener did not become ready at https://${app_host}:${https_port}/." >&2
  exit 1
}

# Obtains and checks the leaf certificate against the persisted local root without relying on host trust settings.
verify_leaf_certificate() {
  docker compose cp "frontend:${root_certificate_path}" "$root_certificate" >/dev/null
  curl --fail --silent --show-error "http://${app_host}:${http_port}/caddy-root.crt" -o "$downloaded_root_certificate"
  cmp --silent "$root_certificate" "$downloaded_root_certificate"

  openssl s_client -connect "${app_host}:${https_port}" -showcerts </dev/null 2>/dev/null \
    | openssl x509 -out "$leaf_certificate"
  openssl x509 -in "$leaf_certificate" -noout -ext subjectAltName \
    | grep -F "IP Address:${app_host}" >/dev/null
  openssl verify -CAfile "$root_certificate" "$leaf_certificate" >/dev/null
}

# Moves only renewable site certificates aside. The root CA and its private key are never touched.
renew_leaf_certificates() {
  local backup_directory
  backup_directory="/data/caddy/leaf-certificate-backups/$(date -u +%Y%m%dT%H%M%SZ)"

  echo "Leaf certificate does not match the configured IP. Archiving it to ${backup_directory}."
  docker compose exec -T frontend sh -ceu '
    certificate_directory=$1
    backup_directory=$2
    if [ -d "$certificate_directory" ]; then
      mkdir -p "$backup_directory"
      mv "$certificate_directory" "$backup_directory/local"
    fi
  ' sh "$leaf_certificates_path" "$backup_directory"
  docker compose restart frontend >/dev/null
  wait_for_https
}

if [ ! -f "$compose_file" ]; then
  echo "docker-compose.yml was not found at $compose_file." >&2
  exit 2
fi

app_host=$(read_compose_value x-app-host)
http_port=$(read_compose_value x-http-port)
https_port=$(read_compose_value x-https-port)
validate_deployment_values
require_host_commands
verify_host_address

temporary_directory=$(mktemp -d)
root_certificate="$temporary_directory/root.crt"
downloaded_root_certificate="$temporary_directory/downloaded-root.crt"
leaf_certificate="$temporary_directory/leaf.crt"
trap 'rm -rf "$temporary_directory"' EXIT

cd "$project_root"
docker compose config -q
docker compose up -d --build
docker compose exec -T frontend caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile >/dev/null
wait_for_https

if ! verify_leaf_certificate; then
  renew_leaf_certificates
  verify_leaf_certificate
fi

if ! curl --fail --silent --show-error "http://${app_host}:${http_port}/offline_setup" \
  | grep -F "https://${app_host}:${https_port}/offline_setup" >/dev/null; then
  echo "HTTP offline setup page does not link to the configured HTTPS origin." >&2
  exit 1
fi

echo "Production stack is running at https://${app_host}:${https_port}/"
