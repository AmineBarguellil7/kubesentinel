FROM node:22-alpine

ENV NODE_ENV=production
ENV PORT=3001

WORKDIR /app

# Install dependencies first so this layer is reused when only the source changes.
COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

USER node

EXPOSE 3001

HEALTHCHECK --interval=10s --timeout=3s --start-period=5s --retries=3 \
  CMD wget -qO- http://127.0.0.1:3001/health || exit 1

CMD ["node", "index.js"]
