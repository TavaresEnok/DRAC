# Build stage
FROM golang:1.22-alpine AS builder

WORKDIR /app

COPY services/camera-worker-go/go.mod ./
# COPY services/camera-worker-go/go.sum ./
RUN go mod download

COPY services/camera-worker-go/*.go ./

RUN go mod tidy
RUN go build -o camera-worker .

# Production stage
FROM alpine:latest

WORKDIR /app

# Install FFmpeg
RUN apk add --no-cache ffmpeg

COPY --from=builder /app/camera-worker .

CMD ["./camera-worker"]
