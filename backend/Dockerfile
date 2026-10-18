FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY backend/requirements.txt ./
RUN python -m pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY scripts/start-backend.sh /scripts/start-backend.sh

# Identity of the running backend. Default is a local compose build;
# GitHub Action passes vX.Y.Z + short commit hash.
ARG APP_VERSION=lcl-cntr
ARG APP_GIT=
ENV APP_VERSION=$APP_VERSION
ENV APP_GIT=$APP_GIT

EXPOSE 8000

CMD ["sh", "/scripts/start-backend.sh"]
