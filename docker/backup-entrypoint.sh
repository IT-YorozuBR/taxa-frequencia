#!/bin/sh
set -e

# Container leve de backup periódico do Postgres. Roda `pg_dump` todo dia às
# 03:00 (horário de Brasília, UTC-3 o ano todo = 06:00 UTC) e apaga backups
# com mais de N dias — sem isso o volume ./db-backups cresce pra sempre.
#
# RESTAURAR um backup (rodar na VM, com os containers no ar):
#   gunzip -c ./db-backups/attendance_20260821_060000.sql.gz | \
#     docker compose exec -T db psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
#
# (isso aplica o dump por cima do banco atual — cuidado, não é um "reset";
# para restaurar do zero, derrube o container db, apague o volume pgdata_pg18
# e suba de novo antes de restaurar.)

RETENTION_DAYS=${BACKUP_RETENTION_DAYS:-14}

cat > /usr/local/bin/run-backup.sh <<'SCRIPT'
#!/bin/sh
set -e
timestamp=$(date +%Y%m%d_%H%M%S)
outfile="/backups/${POSTGRES_DB}_${timestamp}.sql.gz"
echo "[backup] $(date -Iseconds) - gerando $outfile"
if PGPASSWORD="$POSTGRES_PASSWORD" pg_dump -h db -U "$POSTGRES_USER" -d "$POSTGRES_DB" | gzip > "${outfile}.tmp"; then
  mv "${outfile}.tmp" "$outfile"
  echo "[backup] OK: $(du -h "$outfile" | cut -f1)"
else
  echo "[backup] FALHOU ao gerar $outfile" >&2
  rm -f "${outfile}.tmp"
fi
retention="${BACKUP_RETENTION_DAYS:-14}"
find /backups -name "${POSTGRES_DB}_*.sql.gz" -mtime "+${retention}" -delete
echo "[backup] Retenção aplicada (mantendo ultimos ${retention} dias)"
SCRIPT
chmod +x /usr/local/bin/run-backup.sh

cat > /etc/crontabs/root <<CRON
0 6 * * * /usr/local/bin/run-backup.sh >> /var/log/backup.log 2>&1
CRON

echo "[backup] Agendamento instalado (06:00 UTC = 03:00 Brasília, retenção ${RETENTION_DAYS} dias):"
cat /etc/crontabs/root
echo "[backup] Logs em /var/log/backup.log"

touch /var/log/backup.log

echo "[backup] Rodando um backup inicial agora, para não depender de esperar até amanhã..."
/usr/local/bin/run-backup.sh >> /var/log/backup.log 2>&1 || echo "[backup] backup inicial falhou (nao bloqueante, tentara de novo no proximo horario agendado)" >&2

tail -F /var/log/backup.log &
exec crond -f -l 8
