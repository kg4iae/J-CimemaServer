# Syntax=docker/dockerfile:1
FROM node:22-bookworm-slim

# Install system dependencies required for CinemaBooth media ingestion & transcoding (ffmpeg, ffprobe, python3, curl, yt-dlp)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    curl \
    ca-certificates \
  && curl -L https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
  && chmod a+rx /usr/local/bin/yt-dlp \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package manifests and npm config first for optimal layer caching
COPY package*.json .npmrc* ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy application source
COPY . .

# Build the production frontend bundle into /app/dist
RUN npm run build

# Ensure runtime directories exist for persistent volumes (SQLite DB, media library, slides/logos)
RUN mkdir -p /app/data /app/media /app/public/assets/slides /app/public/assets/audio

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

VOLUME ["/app/data", "/app/media", "/app/public/assets"]

CMD ["npm", "start"]
