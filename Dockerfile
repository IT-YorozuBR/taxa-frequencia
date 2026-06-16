# syntax=docker/dockerfile:1

############################
# Estágio 1: build         #
############################
FROM node:20-bookworm-slim AS builder
WORKDIR /app

# Prisma precisa do OpenSSL para gerar o client e o query engine
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# Instala dependências primeiro (melhor uso de cache de camadas)
COPY package.json package-lock.json ./
RUN npm ci

# Copia o restante do código e builda
# (o script "build" do package.json já roda `prisma generate && next build`)
COPY . .
RUN npm run build

############################
# Estágio 2: runtime       #
############################
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

# Copia artefatos já buildados do estágio anterior.
# node_modules vem do builder, então o query engine do Prisma já está
# compilado para o mesmo SO/arquitetura usado em runtime.
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/next.config.js ./next.config.js
COPY --from=builder /app/prisma ./prisma

# Entrypoint sincroniza o schema no banco antes de subir a app
COPY docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["docker-entrypoint.sh"]
CMD ["npm", "run", "start"]
