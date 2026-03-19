FROM ghcr.io/foundry-rs/foundry:stable AS foundry

FROM node:22-bookworm-slim

ENV DEBIAN_FRONTEND=noninteractive
ENV PATH="/root/.nargo/bin:/usr/local/bin:${PATH}"

RUN apt-get update && apt-get install -y --no-install-recommends \
  bash \
  ca-certificates \
  curl \
  git \
  jq \
  xz-utils \
  build-essential \
  pkg-config \
  libssl-dev \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY --from=foundry /usr/local/bin/forge /usr/local/bin/forge
COPY --from=foundry /usr/local/bin/cast /usr/local/bin/cast
COPY --from=foundry /usr/local/bin/anvil /usr/local/bin/anvil
COPY --from=foundry /usr/local/bin/chisel /usr/local/bin/chisel

COPY package.json package-lock.json ./
COPY apps/polymarket-signals/package.json ./apps/polymarket-signals/package.json
RUN npm ci

COPY . .

RUN curl -fsSL https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash \
  && /root/.nargo/bin/noirup --version 1.0.0-beta.6

RUN bash /app/scripts/docker/install-bb.sh 0.84.0

RUN chmod +x /app/scripts/docker/install-bb.sh /app/scripts/polymarket-signals/start-runtime.sh

RUN npm run build -w @x402/polymarket-signals

ENV APP_RUNTIME=web
ENV AUTO_DB_INIT=true
ENV PORT=3000

CMD ["/app/scripts/polymarket-signals/start-runtime.sh"]
