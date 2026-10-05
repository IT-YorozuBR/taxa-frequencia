-- Conserto pontual dos dados de 2º/3º turno (mont, pick, pint) de 01/10 e 02/10/2026.
-- Causa: edições de 2º/3º turno do teste de 01/10 foram gravadas em 30/09, mas as
-- linhas de 01/10 e 02/10 já tinham sido copiadas antes (ver INVESTIGACAO-2026-10-02.md).
--
-- Termina em ROLLBACK (só mostra o resultado). Para aplicar de verdade, troque a última
-- linha por COMMIT; (ver comandos na conversa). Faça backup (pg_dump) antes.

BEGIN;

-- 1) Recolocar o quadro nas linhas de 2º turno de 01/10 (mantém as faltas digitadas depois)
UPDATE "DailyAttendance" SET quadro = 61, "updatedAt" = now()
  WHERE date = '2026-10-01' AND "departmentKey" = 'mont' AND shift = 'night';
UPDATE "DailyAttendance" SET quadro = 8, "updatedAt" = now()
  WHERE date = '2026-10-01' AND "departmentKey" = 'pick' AND shift = 'night';
UPDATE "DailyAttendance" SET quadro = 9, "updatedAt" = now()
  WHERE date = '2026-10-01' AND "departmentKey" = 'pint' AND shift = 'night';

-- 2) Criar o 3º turno de 01/10 que faltava
INSERT INTO "DailyAttendance" (id, date, "departmentKey", shift, quadro, "plannedAbsence", "unplannedAbsence", "indeterminateAbsence", "updatedAt")
VALUES
  (gen_random_uuid()::text, '2026-10-01', 'mont', 'zero', 10, 0, 0, 0, now()),
  (gen_random_uuid()::text, '2026-10-01', 'pick', 'zero', 3, 0, 0, 0, now())
ON CONFLICT (date, "departmentKey", shift) DO NOTHING;

-- 3) Propagar para 02/10 (a tela de sábado/segunda lê o 2º/3º turno de 02/10)
INSERT INTO "DailyAttendance" (id, date, "departmentKey", shift, quadro, "plannedAbsence", "unplannedAbsence", "indeterminateAbsence", "updatedAt")
SELECT gen_random_uuid()::text, '2026-10-02', "departmentKey", shift, quadro, "plannedAbsence", "unplannedAbsence", "indeterminateAbsence", now()
FROM "DailyAttendance"
WHERE date = '2026-10-01' AND shift IN ('night','zero') AND "departmentKey" IN ('mont','pick','pint')
ON CONFLICT (date, "departmentKey", shift) DO NOTHING;

-- Conferência: esperado 01/10 e 02/10 com mont night 61, pick night 8, pint night 9,
-- mont zero 10, pick zero 3 (pint não tem zero).
SELECT date::date AS dia, "departmentKey" AS setor, shift, quadro, "plannedAbsence" AS plan,
       "unplannedAbsence" AS sem_aviso, "indeterminateAbsence" AS diversos
FROM "DailyAttendance"
WHERE date >= '2026-09-30' AND "departmentKey" IN ('mont','pick','pint') AND shift IN ('night','zero')
ORDER BY date, "departmentKey", shift;

ROLLBACK;
