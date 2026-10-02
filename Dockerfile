# Sitewarden: a single small container with no npm dependencies to install.
FROM node:22-alpine
ENV NODE_ENV=production \
    PORT=8080 \
    DATABASE_PATH=/data/sitewarden.db \
    BACKUP_DIR=/data/backups \
    RUN_AS_USER=node
WORKDIR /app
COPY package.json ./
COPY src ./src
COPY public ./public
COPY content ./content
COPY scripts ./scripts
EXPOSE 8080
VOLUME ["/data"]
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s CMD wget -qO- http://127.0.0.1:8080/healthz || exit 1
# Starts as root only long enough to take ownership of /data, then runs as "node".
CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.js"]
