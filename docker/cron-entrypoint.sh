#!/bin/sh
set -e

# Container leve que substitui o Vercel Cron.
# Chama o endpoint de snapshot todos os dias às 1:30 (horário de Brasília,
# UTC-3 o ano todo) = 4:30 UTC.

apk add --no-cache curl tzdata >/dev/null

# O CRON_SECRET é escapado com \$ para ser expandido na hora da execução do job
# (o crond do BusyBox repassa o ambiente para os jobs).
cat > /etc/crontabs/root <<'CRON'
30 4 * * * curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://app:3000/api/cron/snapshot >> /var/log/cron.log 2>&1
CRON

echo "[cron] Agendamento instalado:"
cat /etc/crontabs/root
echo "[cron] Logs em /var/log/cron.log"

touch /var/log/cron.log
# Mostra o log do cron na saída do container e mantém o crond em foreground
tail -F /var/log/cron.log &
exec crond -f -l 8
