# Investigação: 2º/3º turno errado em produção — 2026-10-02

Contexto: em 01/10 (quinta, ~11:30) foi feito um teste em produção (usuário `marcelo.o`, depois
`dieno.o`). Em 02/10 (sexta) a tela de hoje mostrava só o 1º turno atualizado; a tela de ontem
(01/10) também apareceu errada para dois usuários, igual à do dia 30/09, e depois voltou a
aparecer certa sem ninguém alterar dados.

## Como o salvamento e a leitura funcionam (resumo)

- Cada edição de célula faz `POST /api/attendance` na hora (sem botão salvar), enviando os 4
  campos do setor/turno. Validação em `lib/validation.ts`, limite de edição de 30 dias,
  auditoria em `AuditLog`.
- **1º turno (`day`)**: gravado e lido na própria data.
- **2º/3º turno (`night`/`zero`)**: gravados no **dia útil anterior** (`storeDate` em
  `app/api/attendance/route.ts`) e lidos de lá (`buildMixedDeptShiftData` em `lib/utils.ts`).
  Tela do dia D lê `night/zero` das linhas de D-1.
- **Carry-forward** (`lib/carryForward.ts`): cron diário às 01:30 BRT (04:30 UTC, container
  `cron`) e todo GET de `/api/attendance` chamam `ensureCarryForwardToToday()`, que copia as
  linhas do último dia com dados para os dias úteis até hoje. Usa `skipDuplicates`, ou seja,
  **copia uma vez e nunca atualiza** uma linha já criada. Sábado copia só `day`.

## Causa confirmada (tela de HOJE errada)

Falha de **propagação/leitura**, não de gravação:

1. 01/10 01:30: o cron criou as linhas de `10-01` copiando `09-30`. Naquele momento `09-30` não
   tinha linhas de `night/zero` de mont, pick, pint e ti.
2. 01/10 ~11:32: o teste editou o 2º/3º turno na tela de quinta. O sistema gravou em `09-30`
   (criando as linhas ali). Os valores finais estão corretos no banco (mont night 61/0/4/8,
   mont zero 10, pick night 8/0/0/2, pick zero 3, pint night 9/0/0/3 etc.).
3. A linha `10-01` já existia e nunca recebeu essas linhas. A tela de sexta (02/10) lê
   `night/zero` de `10-01`, então mostrou vazio / quadro 0.
4. 02/10 ~08:10 e ~13:22 (Brasília): `marcelo.o` digitou as faltas de novo na tela de hoje, criando
   `10-01 night` de mont/pick/pint com `quadro 0` (`antes: null`). O 3º turno de mont/pick em
   `10-01` continua sem linha. `10-02` também não tem mont/pick/pint no 2º/3º turno (a tela de
   sábado/segunda vai ler dali).

Estado do banco verificado em 02/10 (~15:00 BRT), sem mudanças recentes: `10-01 night` mont/pick/
pint com quadro 0; `10-01 zero` sem mont/pick/pint; `09-30` com os valores corretos do teste.

## Não explicado: tela de ONTEM (01/10) errada para dois usuários

Pelo banco, as linhas que a tela de 01/10 lê (`10-01 day` + `09-30 night/zero`) estavam certas
desde 01/10 11:48. Mesmo assim, dois usuários viram a tela de 01/10 igual à de 30/09, e depois
ela apareceu certa sem nenhuma edição (audit log dos 60 min anteriores: 0 linhas; `updatedAt`
das linhas antigo). SELECTs de diagnóstico não alteram dados.

Descartado:
- Reinício/deploy: containers `app`/`cron`/`db` de pé há 10 dias, sem recriação.
- Versão diferente na VM: HEAD da VM = `787f598`, imagem do app construída depois dele.
- Perda ou alteração de dados no banco.
- Cache de rota do Next: `/api/attendance` GET não é pré-renderizada (não há `.body` no build).
- Cache do Nginx: usuário confirmou que "Cache Assets" não está ligado.

Hipótese restante (NÃO confirmada): em `app/page.tsx` o `fetchData` não cancela requisições
antigas; se a resposta de uma data anterior chega por último, a tela mostra os dados antigos
com o seletor na data nova. Em falha de fetch o `catch` devolve `{}` (tabela vazia) sem aviso.
Isso não explica por que dois usuários viram o mesmo erro. Se acontecer de novo: Ctrl+F5 antes de
recarregar normal, e capturar no DevTools (Network) os headers de `attendance?date=...`
(`age`, `cache-control`, `x-cache`) e o horário exato.

## Outros achados

- `docker compose logs app` está falhando (`invalid character 'l' after object key:value pair`):
  arquivo de log JSON do container corrompido. Os logs do app não servem para diagnóstico agora.
  Convém configurar rotação (`logging: max-size`) no `docker-compose.yml`.
- Os comandos `docker compose` na VM avisam `AUTH_SECRET is not set` por rodarem sem
  `--env-file`; confirmar que o app em execução foi iniciado com o `.env.docker` carregado.
- Comentário desatualizado no `docker-compose.yml` (`"0 22 * * 1-5"`); o agendamento real é
  `30 4 * * *`. Comentário em `lib/carryForward.ts` cita só `night` no sábado, mas o código
  também descarta `zero`.
- Timestamps nas queries de audit mostraram +3h (query usava `AT TIME ZONE` em coluna sem fuso);
  usar `"createdAt" + interval '-3 hours'` para horário de Brasília.
- Pontos de atenção do salvamento: sem debounce/fila; último a salvar vence (sem controle de
  concorrência); falha de POST reverte a tela sem aviso; erro do `createMany` no POST é só logado.

## Pendente (nada disso foi aplicado ainda)

1. **Correção de código**: ao criar/alterar linha de `night/zero`, propagar para os dias
   seguintes já materializados (inserir a linha se não existe, atualizar se ainda tem o valor
   antigo), com testes para o cenário "edição de night depois que o dia seguinte já foi copiado".
2. Cancelar respostas antigas no `fetchData` + aviso de erro na tela (carregar e salvar).
3. `Cache-Control: no-store` / `dynamic = 'force-dynamic'` em `GET /api/attendance`.
4. Rotação de logs do `app` no `docker-compose.yml`.
5. **Conserto dos dados** (SQL proposto, NÃO executado; usuário disse que não rodou nada de
   alteração): em `10-01` colocar quadro 61/8/9 em mont/pick/pint `night` (mantendo faltas
   digitadas), inserir `zero` de mont (10) e pick (3), e copiar `night/zero` de mont/pick/pint
   de `10-01` para `10-02`. Fazer backup antes (`pg_dump`) e rodar em transação com SELECT de
   conferência antes do COMMIT.
