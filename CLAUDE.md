# Contexto do projeto

## ⚠️ Bug: pasta `app/admin/logs/` era ignorada pelo git — CORRIGIDO em 2026-08-21

O `.gitignore` do projeto já tinha (antes de qualquer mudança minha) uma regra genérica
`logs/` na seção "# Logs", pensada pra ignorar pastas de log de build/runtime. Eu criei a
página de auditoria em `app/admin/logs/page.tsx` sem checar isso, e essa regra ignorou a
pasta INTEIRA silenciosamente — mesmo sendo código de aplicação de verdade, mesmo com
`git add -A`. A API (`app/api/admin/audit-logs/route.ts`, nome diferente, sem colidir)
foi commitada normalmente; só a página sumiu. Resultado: usuário fez deploy em produção
e a página deu 404, porque o arquivo nunca chegou no repositório.

**Corrigido** renomeando a pasta pra `app/admin/audit-logs/` (consistente com o nome já
usado na API, e fora do caminho da regra `logs/` do `.gitignore` — essa regra só bate no
componente de path exatamente igual a `logs`, não em algo que contém "logs" como parte do
nome). Link em `app/admin/page.tsx` atualizado de `/admin/logs` para `/admin/audit-logs`.

**Lição para o futuro:** antes de criar qualquer arquivo/pasta nova neste projeto, checar
se o nome não colide com algum padrão do `.gitignore` — rodar `git status --short` (ou
`git check-ignore -v <caminho>`) logo depois de criar arquivos novos pra confirmar que
eles aparecem como untracked/staged, não como "nada a mostrar" (que é o sintoma silencioso
de estarem sendo ignorados).

## Simulação completa de deploy antes da produção — 2026-08-21

Antes do usuário fazer o deploy real, rodei o deploy inteiro localmente com Docker
(`docker compose -f docker-compose.yml -f docker-compose.local-test.yml --env-file
.env.docker.localtest up -d --build`, projeto isolado `taxa-frequencia-localtest`,
porta 3099 mapeada só localmente pra testar via curl, `npm_network` neutralizado no
override) — build da imagem de produção de verdade, banco vazio do zero, exatamente
o que vai acontecer na VM.

**Pegou um bug real que os testes unitários não cobriam**: em
`app/api/attendance/route.ts`, o `logAudit` do branch de CRIAÇÃO de registro (setor/
turno editado pela primeira vez) ainda usava o `target` no formato antigo
(`adm / day / 2026-08-21`) — a edição pra usar `deptLabel`/`shiftLabel` (pedida pelo
usuário depois) só tinha sido aplicada de fato no branch de UPDATE; um `replace_all`
anterior deveria ter pego os dois mas só pegou um. Corrigido, rebuildado e reconfirmado
com um teste direto nesse branch específico (setor `mont`/turno `night` nunca editado
antes) — agora mostra `Montagem/Solda — Noturno (2ºturno) (2026-08-20)` certo.

**Testado via curl contra o container de produção (não `next dev`)**: bloqueio sem
login, login certo/errado, criação de registro do zero (branch mais arriscado),
validação do item 6 (nega negativo/string/setor inexistente), taxa com os 3 tipos de
falta, painel admin completo (criar/listar/resetar senha/excluir usuário, proteção
contra autoexclusão), RBAC (usuário comum bloqueado em `/admin` e `/api/admin/*`),
troca de senha própria, os 5 endpoints de dashboard, `/dashboard`, cron
(`CRON_SECRET` certo passa, errado dá 401), logout revoga acesso. Confirmado também
que `docker-entrypoint.sh` roda `prisma db push` + `seedAdmin.js` sozinho num banco
vazio (schema completo criado do zero: `DailyAttendance` com `indeterminateAbsence`,
`User`, `AuditLog`) e que os containers `backup` e `cron` sobem e funcionam
corretamente (retenção do backup sem erro — reconfirma o fix do bug encontrado numa
sessão anterior).

Ambiente de teste 100% desmontado depois (`down -v` + imagem removida + arquivos
`docker-compose.local-test.yml`/`.env.docker.localtest` apagados) — não usou nem
tocou nas credenciais reais de produção em nenhum momento (arquivo `.env.docker.*`
local com segredos só de teste, isolado do projeto `taxa-frequencia` real).

## Checklist de produção (itens 6-9) — APLICADA em 2026-08-21

Depois do login/RBAC/audit log, usuário pediu uma revisão do que faltava pra ir pra
produção com segurança. Desses itens, os 4 abaixo foram implementados (itens 1-5 da
lista original — AUTH_SECRET/CRON_SECRET obrigatórios em prod, rate limiting no login,
migrations versionadas — continuam PENDENTES, não foram pedidos ainda).

**6. Validação server-side em `/api/attendance`** — `lib/validation.ts` →
`validateAttendancePayload()`: valida `date` (formato YYYY-MM-DD e data real),
`departmentKey` (precisa estar em `ALL_LEAF_KEYS`), `shift` (day/night/zero) e os 4
campos numéricos (finito, >= 0, <= 1000 — teto generoso, maior setor real tem ~100
pessoas). Antes disso a API aceitava qualquer valor batido direto nela (negativo,
string, `Infinity`) sem checagem nenhuma. Testado via curl com payloads inválidos —
todos rejeitados com 400 e mensagem clara; payload válido continua funcionando normal.

**7. Backup automático do Postgres** — novo serviço `backup` no `docker-compose.yml`
(imagem `postgres:18-alpine`, mesmo padrão do serviço `cron` já existente: script em
`docker/backup-entrypoint.sh` usando `crond` do busybox). Roda `pg_dump` comprimido
diariamente às 06:00 UTC (= 03:00 Brasília) pra `./db-backups/`, com um backup inicial
assim que o container sobe (não fica esperando até o dia seguinte), e apaga backups
com mais de `BACKUP_RETENTION_DAYS` dias (default 14). Procedimento de restauração
documentado no topo do próprio script. `./db-backups/` no `.gitignore` (só fica na VM,
igual `./backup/` já era).

**Testado de verdade** subindo `docker compose up db backup` localmente (Docker Desktop
já estava disponível na máquina) — e isso pegou um bug real: a variável
`BACKUP_RETENTION_DAYS` não estava sendo repassada pro script filho `run-backup.sh`
porque a variável intermediária `RETENTION_DAYS` no script pai não tinha `export`, então
o `find -mtime` recebia string vazia e falhava (`find: invalid number ''`), fazendo a
rotina de retenção nunca rodar (o `pg_dump` em si funcionava, só a limpeza de backups
antigos que quebrava silenciosamente). Corrigido lendo `${BACKUP_RETENTION_DAYS:-14}`
direto dentro do `run-backup.sh` (essa variável É passada certo pelo Docker, é uma env
var de verdade do container, diferente da variável de shell não-exportada). Depois do
fix: backup + retenção rodando limpo, dump gzipado válido, e o comando de restauração
documentado testado e funcionando (`gunzip -c ... | docker compose exec -T db psql ...`).
Containers/volume de teste desmontados depois (`docker compose down -v`) — nada ficou
rodando localmente.

**8. Recuperação de admin trancado fora** — `prisma/resetPassword.js`: script standalone
(`node prisma/resetPassword.js <usuario> <novaSenha>`, ou
`docker compose exec app node prisma/resetPassword.js admin novaSenha`) que redefine a
senha de qualquer usuário direto no banco, sem precisar estar logado. Registra a ação
no audit log mesmo assim (`username: "sistema (script resetPassword.js)"`, `userId:
null`, `details.via: "cli-recovery-script"`) pra manter rastreabilidade. Atalho
`npm run db:reset-password -- <usuario> <novaSenha>`. Testado end-to-end (senha antiga
para de funcionar, nova funciona, log aparece certo).

**9. Testes automatizados** — instalado `vitest` (`vitest.config.mts`, alias `@/` já
resolvido). 38 testes em 4 arquivos, todos passando:
- `lib/utils.test.ts` — `calcAttendanceRate` (a fórmula com os 3 tipos de falta),
  `sumShifts`/`emptyShift`, helpers de dia útil (`getPrevWorkingDayStr`,
  `getNextWorkingDayStr`, `isWeekend`, `chartShiftDates` — inclusive a regra de fim de
  semana cair em sexta), `buildDeptShiftData`/`buildMixedDeptShiftData`.
- `lib/auth.test.ts` — round-trip de assinar/verificar sessão, rejeição de token
  adulterado e de token assinado com `AUTH_SECRET` diferente (simula rotação de
  segredo).
- `lib/carryForward.test.ts` — o código mais arriscado do projeto (mockado
  `@/lib/prisma` com `vi.mock`): `findLastDayWithData` andando pra trás até achar
  dado, `ensureCarryForwardToToday` sendo no-op quando já tem dado ou quando não tem
  nada pra copiar, e o cenário completo de preenchimento (Segunda→Sábado) confirmando
  que a linha de sábado corta `night`/`zero` e mantém só `day` — é exatamente a regra
  documentada em `lib/carryForward.ts` que já causou bug antes.
- `lib/validation.test.ts` — cobre o validador novo do item 6.

Rodar com `npm test` (uma vez) ou `npm run test:watch` (watch mode). **Ainda faltam**
testes de rotas de API/fluxo HTTP completo (login, admin, attendance) — os testes atuais
são todos de função pura ou com mock, não sobem um servidor Next de verdade. Cobertura
de UI/componentes React também não foi feita.

`npx tsc --noEmit` e `npm run build` limpos depois de tudo isso.

## Logs de auditoria — APLICADA em 2026-08-21

Usuário pediu página de logs de auditoria para admin: qualquer alteração feita no sistema
deve ficar registrada, exibida em formato de lista para o administrador.

**Novo model:** `AuditLog` em `prisma/schema.prisma` (`id`, `createdAt`, `userId` nullable,
`username` denormalizado — sobrevive à exclusão do usuário, `action`, `target` descrição
legível, `details` Json nullable). Aplicado ao Neon dev via `prisma db push`.

**Função central:** `lib/audit.ts` → `logAudit()`, best-effort (nunca deixa uma falha de
log quebrar a operação real — só loga erro no console). Instrumentado em TODA rota que
muda estado:
- `app/api/attendance/route.ts` POST → `attendance.update`, com diff `before`/`after` dos
  4 campos numéricos (before é `null` quando é a primeira vez que o setor/turno é criado).
- `app/api/admin/users/route.ts` POST → `user.create`.
- `app/api/admin/users/[id]/route.ts` PATCH → `user.password_reset` (admin troca senha de
  outro), DELETE → `user.delete`.
- `app/api/auth/change-password/route.ts` POST → `user.change_password` (autoatendimento).
- **NUNCA loga senha nem hash** em lugar nenhum — só metadados (quem, quando, o quê).

**Identidade do ator:** rotas sob `/api/admin/*` e `/api/attendance` pegam de
`x-user-id`/`x-user-username` (headers injetados pelo middleware, ver seção de login
abaixo). `change-password` está fora do middleware (rota pública na allowlist), então usa
a sessão já verificada manualmente ali dentro.

**Leitura:** `GET /api/admin/audit-logs` (paginação por cursor, `limit` padrão 50 máx 200,
filtros opcionais `action` e `username`) → página `app/admin/audit-logs/page.tsx`
(**não** `app/admin/logs/` — ver "Bug: pasta `logs/` ignorada pelo git" abaixo), lista com
badge colorido por tipo de ação, resumo de uma linha (diff formatado pra attendance,
papel pra criação/exclusão de usuário) e JSON completo expandível por item. Link a partir
de `/admin` ("Ver logs de auditoria →"). Protegida automaticamente pelo middleware (mesma
regra de `/admin/*` → exige role admin).

**Testado via curl**: gerada 1 ocorrência de cada tipo de ação (edição de frequência,
criação/exclusão de usuário, reset de senha pelo admin, troca de senha própria) e
confirmado que todas apareceram na listagem com os dados corretos; filtros por `action` e
`username` funcionando; usuário comum bloqueado tanto na API (`403`) quanto na página
(redirect) — mesmo padrão de RBAC já usado no resto do `/admin`. `npx tsc --noEmit` e
`npm run build` limpos.

### Não incluído (fora do pedido original)

- Login/logout NÃO são logados como "alteração" (usuário pediu especificamente
  alterações feitas no sistema, não acessos) — só ações que mudam dado.
- Sem exportação (CSV/etc) nem retenção/expurgo automático de logs antigos — cresce
  indefinidamente por enquanto.

## Login / controle de acesso — APLICADA em 2026-08-21

Usuário pediu autenticação: só usuários credenciados podem ver/editar o sistema. Login
padrão de admin: `admin` / `admin123` (usuário deve trocar depois — há tela pra isso).
Admin consegue criar outras contas (papéis `admin` ou `user`, sem distinção de permissão
entre eles além do acesso a `/admin` — ambos podem ver/editar tabela e dashboard).

**Arquitetura escolhida:** sessão via cookie httpOnly assinado (JWT com `jose`), não
NextAuth (evita complexidade de adapter/providers desnecessária para login
usuário+senha simples). Hash de senha com `bcryptjs` (puro JS, sem binário nativo —
importante pra não complicar o build do Docker/Alpine). `middleware.ts` na raiz protege
TODAS as rotas por padrão (allowlist: `/login`, `/api/auth/*`, `/api/cron/*` — este
último usa `CRON_SECRET` próprio, é server-to-server, nunca teria cookie de sessão).
`/admin` e `/api/admin/*` exigem role `admin` adicionalmente. Middleware roda em Edge
runtime (Next.js) e só verifica JWT — nunca toca o Prisma (edge não roda o client do
Prisma); quem injeta a identidade verificada nas rotas via headers (`x-user-id`,
`x-user-username`, `x-user-role`) pro handler não precisar reverificar o cookie.

**Novo model:** `User` em `prisma/schema.prisma` (`id`, `username` único, `passwordHash`,
`role` default `"user"`, `createdAt`). Aplicado ao Neon dev via `prisma db push`.

**Bootstrap do admin padrão:** `prisma/seedAdmin.js` — idempotente, só cria a conta
`admin` se NENHUM admin existir ainda (não sobrescreve contas já criadas/senhas trocadas).
Diferente de `prisma/seed.js` (que semeia dados de frequência e NÃO deve rodar sozinho
em todo restart, pois resetaria `quadro` já editado pelos usuários) — por isso
`docker-entrypoint.sh` chama `seedAdmin.js` automaticamente após o `prisma db push`, mas
`seed.js` continua manual (`npm run db:seed`).

**Variável nova:** `AUTH_SECRET` (assina o JWT da sessão) — em `.env`, `.env.example`,
`.env.docker`, `.env.docker.example` e repassada no `docker-compose.yml` pro serviço
`app`. Trocar o valor invalida todas as sessões logadas (força novo login). Sem ela
definida, cai num fallback inseguro fixo (só serve pra dev local sem setup extra) — ver
`lib/auth.ts`.

**Arquivos principais:** `lib/auth.ts` (assinar/verificar JWT, cookie), `middleware.ts`,
`app/api/auth/{login,logout,me,change-password}/route.ts`,
`app/api/admin/users/route.ts` + `[id]/route.ts` (excluir bloqueia autoexclusão e excluir
o último admin), `app/login/page.tsx`, `app/admin/page.tsx`, `components/Navbar.tsx`
(mostra usuário logado, link Admin só se role admin, botão Sair) e `components/Shell.tsx`
(novo — esconde a navbar/padding na tela de login).

**Testado via curl** (sem UI, extensão do Chrome indisponível): bloqueio sem cookie
(401/redirect), login certo/errado, `/api/auth/me`, criação de usuário pelo admin,
usuário comum bloqueado em `/admin` e `/api/admin/*` (403/redirect) mas liberado nas
rotas normais, troca de senha própria, proteção contra autoexclusão e contra excluir o
último admin, logout revoga acesso. `npx tsc --noEmit` e `npm run build` limpos (só um
warning benigno do `jose` sobre um código de JWE que não usamos).

### Pendências / próximos passos possíveis (não pedidos ainda)

- Rodar `prisma db push` + `node prisma/seedAdmin.js` no Postgres de PRODUÇÃO (docker) —
  já acontece automaticamente no próximo deploy via `docker-entrypoint.sh` atualizado.
- Não há tela de "esqueci minha senha" nem reset de senha pelo admin (só o próprio
  usuário troca a via `/admin` > "Trocar minha senha") — se alguém esquecer, só o admin
  pode recriar a conta (excluir + criar de novo) ou for direto no banco.
- Sessão dura 7 dias (`SESSION_MAX_AGE_SECONDS` em `lib/auth.ts`), sem refresh automático
  nem "lembrar de mim" configurável.

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
