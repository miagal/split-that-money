#!/bin/sh
# Starts the Django backend for local development or the production container.
# Local mode uses backend/.venv so the caller does not need to activate it.

set -eu

# Prints the supported startup flags.
usage() {
  cat <<EOF
Usage: $0 [--local] [--install]

  (no flags)  Docker-only: start Gunicorn in the backend container.
  --local     Use backend/.venv and start Django's development server.
  --install   Install Python dependencies. Requires --local.
  --help      Show this help.
EOF
}

local=false
install=false

for argument in "$@"; do
  case "$argument" in
    --local) local=true ;;
    --install) install=true ;;
    --help|-h)
      usage
      exit 0
      ;;
    *)
      usage >&2
      exit 2
      ;;
  esac
done

if "$install" && ! "$local"; then
  echo "--install requires --local" >&2
  exit 2
fi

if "$local"; then
  cd "$(dirname "$0")/../backend"
  if [ ! -x .venv/bin/python ]; then
    python -m venv .venv
    install=true
  fi
  python=.venv/bin/python
  if "$install"; then
    "$python" -m pip install -r requirements.txt
  fi
else
  cd /app
  python=python
fi

"$python" manage.py migrate --noinput
"$python" manage.py bootstrap_admin

if "$local"; then
  exec "$python" manage.py runserver
fi

exec gunicorn --bind 0.0.0.0:8000 --workers 2 app.wsgi:application
