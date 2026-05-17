FROM node:22-bookworm-slim AS build

WORKDIR /app

COPY package.json package-lock.json tsconfig.json ./
COPY src ./src

RUN npm ci
RUN npm run build

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends verilator ca-certificates \
  && rm -rf /var/lib/apt/lists/*

ENV NODE_ENV=production

COPY package.json package-lock.json ./
RUN npm ci --omit=dev \
  && npm cache clean --force

COPY --from=build /app/dist ./dist

ENTRYPOINT ["node", "dist/index.js"]
CMD ["--file", "/input.sv"]
