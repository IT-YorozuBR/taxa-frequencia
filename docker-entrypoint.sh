#!/bin/sh
set -e

echo "[entrypoint] Sincronizando schema do Prisma com o banco..."

# Tenta sincronizar o schema. O compose já espera o Postgres ficar saudável
# (healthcheck), mas mantemos um retry simples por segurança.
tries=0
until npx prisma db push --skip-generate --accept-data-loss; do
  tries=$((tries + 1))
  if [ "$tries" -ge 10 ]; then
    echo "[entrypoint] Falha ao conectar no banco após $tries tentativas." >&2
    exit 1
  fi
  echo "[entrypoint] Banco indisponível, tentando de novo em 3s... ($tries/10)"
  sleep 3
done

echo "[entrypoint] Schema sincronizado. Garantindo conta admin padrão..."
node prisma/seedAdmin.js || echo "[entrypoint] Aviso: falha ao rodar seedAdmin.js (não bloqueante)." >&2

echo "[entrypoint] Iniciando aplicação..."
exec "$@"
