-- Corrige preenchimento feito no dia errado: em 2026-07-16 o quadro inteiro
-- foi preenchido com os dados que eram para ser do dia 2026-07-15.
--
-- O que este script faz, dentro de uma única transação:
--   1. Mostra quantas linhas existem hoje em cada data (conferência antes de mexer).
--   2. Apaga as linhas de 2026-07-15 (estavam erradas / desatualizadas).
--   3. Move (UPDATE) as linhas de 2026-07-16 para 2026-07-15.
-- Depois disso o dia 16 fica sem registros — o próprio app recria o dia 16
-- automaticamente na próxima leitura (ensureCarryForwardToToday copia para
-- frente a partir do dia 15, agora corrigido). Não é preciso preencher o
-- quadro de novo manualmente.
--
-- Como rodar (produção, container "db"):
--   docker compose --env-file .env.docker cp scripts/fix-quadro-2026-07-16.sql db:/tmp/fix.sql
--   docker compose --env-file .env.docker exec db psql -U postgres -d absenteismo -f /tmp/fix.sql
--
-- Ajuste -U/-d acima para o usuário/banco reais do seu .env.docker.

BEGIN;

-- 1) Conferência: veja os totais antes de aplicar a correção.
SELECT date, count(*) AS linhas
FROM "DailyAttendance"
WHERE date IN ('2026-07-15', '2026-07-16')
GROUP BY date
ORDER BY date;

-- 2) Remove os dados errados/desatualizados que estavam no dia 15.
DELETE FROM "DailyAttendance"
WHERE date = '2026-07-15';

-- 3) Move os dados (preenchidos hoje por engano) do dia 16 para o dia 15.
UPDATE "DailyAttendance"
SET date = '2026-07-15'
WHERE date = '2026-07-16';

-- Conferência final: dia 15 deve ter as linhas que estavam no 16;
-- dia 16 deve estar vazio (count = 0).
SELECT date, count(*) AS linhas
FROM "DailyAttendance"
WHERE date IN ('2026-07-15', '2026-07-16')
GROUP BY date
ORDER BY date;

-- Revise o resultado das duas consultas acima. Se estiver certo, rode:
--   COMMIT;
-- Se algo parecer errado, rode:
--   ROLLBACK;
