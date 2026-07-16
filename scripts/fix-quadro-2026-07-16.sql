-- Corrige preenchimento feito no dia errado: em 2026-07-16 o quadro inteiro
-- foi preenchido com os dados que eram para ser do dia 2026-07-15.
--
-- O que este script faz, dentro de uma única transação, com COMMIT automático
-- no final (não depende de sessão interativa — pode rodar com "psql -f"):
--   1. Apaga as linhas de 2026-07-15 (estavam erradas / desatualizadas).
--   2. Move (UPDATE) as linhas de 2026-07-16 para 2026-07-15.
--   3. Comita.
-- Depois disso o dia 16 fica sem registros — o próprio app recria o dia 16
-- automaticamente na próxima leitura (ensureCarryForwardToToday copia para
-- frente a partir do dia 15, agora corrigido, até alguém preencher o dia 16
-- de verdade). Não é preciso preencher o quadro de novo manualmente.
--
-- Como rodar (produção, container "db"):
--   docker compose --env-file .env.docker cp scripts/fix-quadro-2026-07-16.sql db:/tmp/fix.sql
--   docker compose --env-file .env.docker exec db psql -U postgres -d absenteismo -f /tmp/fix.sql
--
-- Ajuste -U/-d acima para o usuário/banco reais do seu .env.docker.

BEGIN;

DELETE FROM "DailyAttendance"
WHERE date = '2026-07-15';

UPDATE "DailyAttendance"
SET date = '2026-07-15'
WHERE date = '2026-07-16';

COMMIT;

-- Conferência: dia 15 deve ter as 36 linhas movidas; dia 16 deve estar em 0.
SELECT date, count(*) AS linhas
FROM "DailyAttendance"
WHERE date IN ('2026-07-15', '2026-07-16')
GROUP BY date
ORDER BY date;
