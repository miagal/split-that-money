FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY backend/requirements.txt ./
RUN python -m pip install --no-cache-dir -r requirements.txt

COPY backend/ ./
COPY scripts/start-backend.sh /scripts/start-backend.sh

EXPOSE 8000

CMD ["sh", "/scripts/start-backend.sh"]
