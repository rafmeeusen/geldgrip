# ── Stage 1: Build React frontend ────────────────────────────────────────────
FROM node:20-alpine AS frontend-build

WORKDIR /app/frontend
COPY frontend/package.json ./
RUN npm install
COPY frontend/ ./
RUN npm run build
# Output lands in /app/backend/static (per vite.config.js outDir)


# ── Stage 2: Python backend ───────────────────────────────────────────────────
FROM python:3.12-slim

WORKDIR /app

# Install Python deps
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy backend source
COPY backend/ ./

# Copy built frontend from stage 1
COPY --from=frontend-build /app/backend/static ./static

# Data directory for SQLite (mount a volume here in production)
RUN mkdir -p /data
ENV DATABASE_URL=sqlite:////data/budget.db

EXPOSE 8000

COPY backend/start.sh ./start.sh
RUN chmod +x start.sh

CMD ["./start.sh"]
