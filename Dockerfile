FROM python:3.11-slim

WORKDIR /app

# System-Dependencies für beide Plattformen
RUN apt-get update && apt-get install -y \
    curl \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Data-Verzeichnis erstellen für Rate-Limit-Persistierung
RUN mkdir -p /app/data

EXPOSE 8000

CMD ["uvicorn", "scanner_api:app", "--host", "0.0.0.0", "--port", "8000"]