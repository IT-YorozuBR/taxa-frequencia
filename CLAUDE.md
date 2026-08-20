# Contexto do projeto

## Nova coluna "falta de tipo indeterminado" — APLICADA em 2026-08-20

Usuário pediu para planejar (NÃO aplicar ainda) uma nova coluna no registro diário de
frequência por turno, para faltas de tipo indeterminado (afastamento, INSS, entre outros —
diferente de falta planejada e falta sem aviso que já existem).

**Nome decidido para o campo:** `indeterminateAbsence` (segue o padrão `plannedAbsence` /
`unplannedAbsence` no schema, nome interno inalterado). Rótulo na UI: "Diversos" (PT), JP
"その他" (sonota, "outros") — trocado de "Afastamento"/"Afast." em 2026-08-20 a pedido do
usuário, pois o campo cobre mais do que afastamento/INSS. Segue o padrão "Aus. plan." /
"Falta s/a" já usado em `components/AttendanceTable.tsx`.

**Decisão do usuário:** essa falta indeterminada DEVE afetar a taxa de frequência (mesmo
tratamento que planned/unplanned). Nova fórmula:
`(quadro - plannedAbsence - unplannedAbsence - indeterminateAbsence) / quadro`

### Modelo atual (antes da mudança)

`prisma/schema.prisma` → `DailyAttendance`: `quadro`, `plannedAbsence`, `unplannedAbsence`
(todos `Float @default(0)`), únicos por `[date, departmentKey, shift]`.

### Arquivos que precisam mudar quando for aplicar

1. `prisma/schema.prisma` — add `indeterminateAbsence Float @default(0)` + migration
   (dados existentes viram 0).
2. `lib/utils.ts` — `ShiftData`, `emptyShift`, `sumShifts`, `calcAttendanceRate` (nova
   fórmula acima), `buildDeptShiftData`, `buildMixedDeptShiftData`.
3. `components/AttendanceTable.tsx` — nova célula editável "Afast." por turno (cabeçalho +
   linha de totais).
4. `app/api/attendance/route.ts` — aceitar/persistir o novo campo.
5. `app/api/dashboard/summary/route.ts`, `trend/route.ts`, `period-summary/route.ts`,
   `presence-chart/route.ts`, `department-comparison/route.ts` — cada rota soma
   `plannedAbsence`/`unplannedAbsence` manualmente (não centralizado) e recalcula a taxa
   localmente; cada uma precisa de um terceiro acumulador `indeterminateAbsence` e da
   fórmula nova. Risco: esquecer uma rota deixa a taxa inconsistente entre telas.
6. `app/page.tsx` / `app/dashboard/page.tsx` — assinatura do `onCellChange` ganha
   `'indeterminateAbsence'` como field válido.
7. `prisma/seed.js` — dados de seed.

### Ponto de atenção

Como a taxa cai automaticamente com esse novo tipo de falta, os limiares de cor do
dashboard (`pctColor` em `AttendanceTable.tsx`: ≥97% verde, ≥95% amarelo, abaixo vermelho)
podem passar a disparar mais vermelho em meses com bastante afastamento/INSS. Vale
reavaliar os limiares depois de aplicar, se fizer sentido.

### Status

Aplicado em 2026-08-20: todos os arquivos da lista acima foram alterados, incluindo
`lib/carryForward.ts` (não estava na lista original, mas também tinha o shape `Rec` sem o
novo campo — usado por `findLastDayWithData`/`ensureCarryForwardToToday`, inclusive no
preview virtual de datas futuras em `app/api/attendance/route.ts` GET). Schema aplicado no
banco Neon via `npx prisma db push` (projeto não usa migrations versionadas, só db push).
`npx tsc --noEmit` e `npm run build` passaram limpos. Ponto de atenção sobre os limiares de
cor (`pctColor`) ainda não foi reavaliado — ver acima.
