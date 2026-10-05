-- Conserto GERAL do 2º/3º turno (night/zero) de TODOS os setores, de 29/09/2026 até hoje.
-- Substitui o conserto pontual (conserto-2026-10-02.sql): não precisa rodar os dois.
-- Causa: ver INVESTIGACAO-2026-10-02.md (edições de night/zero gravadas num dia depois que
-- o dia seguinte já tinha sido copiado; o carry-forward nunca atualiza linha existente).
--
-- O que faz, dia a dia em ordem (seg a sex; sábado não tem night/zero; segunda lê sexta):
--   A) Se o dia já tem linhas (já foi materializado) e falta uma linha night/zero que o dia
--      útil anterior tem  -> INSERE copiando (quadro e faltas, igual ao carry-forward).
--   B) Se a linha night/zero existe com quadro = 0 mas a do dia útil anterior tem quadro > 0
--      -> corrige SÓ o quadro (as faltas digitadas são mantidas). É o caso do 01/10.
--   Nada é apagado. Linhas com quadro > 0 e já preenchidas não são tocadas.
--
-- ATENÇÃO: o item B assume que quadro 0 com quadro > 0 no dia anterior é o defeito, e não
-- um setor que realmente zerou o 2º/3º turno. Confira a lista no resultado antes do COMMIT.
--
-- Para dias de data fixa mude start_day abaixo. Termina em ROLLBACK (só mostra o resultado).
-- Para aplicar de verdade: faça pg_dump antes e troque a ÚLTIMA linha por COMMIT;
-- NÃO foi executado em nenhum banco ainda.

BEGIN;

CREATE TEMP TABLE _fix_log (dia date, setor text, turno text, acao text, quadro_antes float8, quadro_depois float8);

DO $$
DECLARE
  start_day date := DATE '2026-09-29';  -- dia base (não é alterado, só serve de origem)
  today_br  date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  d date;
  p date;
BEGIN
  d := start_day + 1;
  WHILE d <= today_br LOOP
    IF EXTRACT(ISODOW FROM d) <= 5 THEN  -- seg(1) a sex(5)
      p := CASE WHEN EXTRACT(ISODOW FROM d) = 1 THEN d - 3 ELSE d - 1 END;

      IF EXISTS (SELECT 1 FROM "DailyAttendance" WHERE "date"::date = d) THEN

        -- B) quadro zerado indevidamente (feito antes do A para não registrar duas vezes)
        WITH upd AS (
          UPDATE "DailyAttendance" c
             SET quadro = s.quadro, "updatedAt" = now()
            FROM "DailyAttendance" s
           WHERE c."date"::date = d AND s."date"::date = p
             AND c."departmentKey" = s."departmentKey" AND c.shift = s.shift
             AND c.shift IN ('night','zero')
             AND c.quadro = 0 AND s.quadro > 0
          RETURNING c."departmentKey" AS setor, c.shift AS turno, 0::float8 AS antes, c.quadro AS depois
        )
        INSERT INTO _fix_log SELECT d, setor, turno, 'quadro corrigido', antes, depois FROM upd;

        -- A) linhas que faltam
        WITH ins AS (
          INSERT INTO "DailyAttendance"
            (id, "date", "departmentKey", shift, quadro, "plannedAbsence", "unplannedAbsence", "indeterminateAbsence", "updatedAt")
          SELECT gen_random_uuid()::text, d::timestamp, s."departmentKey", s.shift,
                 s.quadro, s."plannedAbsence", s."unplannedAbsence", s."indeterminateAbsence", now()
            FROM "DailyAttendance" s
           WHERE s."date"::date = p AND s.shift IN ('night','zero')
          ON CONFLICT ("date", "departmentKey", shift) DO NOTHING
          RETURNING "departmentKey" AS setor, shift AS turno, quadro AS depois
        )
        INSERT INTO _fix_log SELECT d, setor, turno, 'linha criada', NULL, depois FROM ins;

      END IF;
    END IF;
    d := d + 1;
  END LOOP;
END $$;

-- O que foi alterado (confira antes do COMMIT):
SELECT * FROM _fix_log ORDER BY dia, setor, turno;

-- Estado final de night/zero por dia (cada dia útil deve ter os mesmos setores do dia anterior):
SELECT "date"::date AS dia, shift AS turno, count(*) AS setores, sum(quadro) AS quadro_total,
       count(*) FILTER (WHERE quadro = 0) AS setores_com_quadro_0
FROM "DailyAttendance"
WHERE "date" >= DATE '2026-09-29' AND shift IN ('night','zero')
GROUP BY 1, 2 ORDER BY 1, 2;

ROLLBACK;
