FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for OpenCV and model runtimes.
RUN apt-get update && apt-get install -y \
    libgl1 \
    libglib2.0-0 \
    build-essential \
    cmake \
    wget \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

RUN mkdir -p /app/models

ARG AI_SERVICE_SOURCE_REV=local
COPY . .

EXPOSE 8000

CMD ["python", "main.py"]
