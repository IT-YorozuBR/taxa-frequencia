# Migração para VM com Docker — passo a passo

App **Next.js 14 + Prisma**, migrando de **Vercel + Neon** para uma **VM Linux** com:

- Container da aplicação (porta **3000**)
- Container **PostgreSQL** (auto-hospedado, com volume persistente)
- Container **cron** que substitui o Vercel Cron (job de snapshot)

Arquivos criados: `Dockerfile`, `docker-compose.yml`, `docker-entrypoint.sh`,
`docker/cron-entrypoint.sh`, `.dockerignore`, `.env.docker.example`.

---

## 1. Preparar a VM (Ubuntu/Debian)

Acesse a VM por SSH e instale o Docker:

```bash
# Docker Engine + plugin do Compose (script oficial)
curl -fsSL https://get.docker.com | sh

# (opcional) rodar docker sem sudo
sudo usermod -aG docker $USER
# saia e entre de novo no SSH para aplicar o grupo

# Verifique
docker --version
docker compose version
```

Libere a porta 3000 no firewall (se usar `ufw`):

```bash
sudo ufw allow 3000/tcp
```

> Se a VM tem firewall do provedor de nuvem (AWS/GCP/Azure), libere a 3000 lá também.

---

## 2. Enviar o código para a VM

Opção A — clonar do Git (recomendado):

```bash
git clone <URL_DO_SEU_REPO> taxa-frequencia
cd taxa-frequencia
```

Opção B — copiar do seu PC (sem precisar de Git na VM):

```bash
# rode no seu computador, na pasta do projeto
rsync -av --exclude node_modules --exclude .next --exclude .git ./ usuario@IP_DA_VM:~/taxa-frequencia/
```

---

## 3. Configurar variáveis de ambiente

```bash
cp .env.docker.example .env.docker
nano .env.docker
```

Defina:

- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` — credenciais do banco
- `CRON_SECRET` — segredo do cron. Gere um forte:

```bash
openssl rand -hex 32
```

> O `DATABASE_URL` é montado automaticamente pelo compose a partir das
> variáveis `POSTGRES_*` — não precisa defini-lo manualmente.

---

## 4. Subir os containers

```bash
docker compose --env-file .env.docker up -d --build
```

Isso vai:

1. Buildar a imagem da app (`prisma generate && next build`)
2. Subir o Postgres com volume persistente (`pgdata`)
3. Rodar `prisma db push` automaticamente (cria a tabela `DailyAttendance`)
4. Subir a app na porta 3000 e o container de cron

Acompanhe os logs:

```bash
docker compose --env-file .env.docker logs -f app
```

Teste no navegador: `http://IP_DA_VM:3000`

---

## 5. (Opcional) Migrar os dados da Neon para o Postgres da VM

Se quiser trazer os dados que já existem na Neon:

```bash
# 1) Exporte da Neon (rode onde tiver acesso à URL da Neon)
pg_dump "postgresql://neondb_owner:...@...neon.tech/neondb?sslmode=require" \
  --no-owner --no-privileges --data-only --table='"DailyAttendance"' \
  > neon-data.sql

# 2) Copie o arquivo para a VM e importe no container db
docker compose --env-file .env.docker cp neon-data.sql db:/tmp/neon-data.sql
docker compose --env-file .env.docker exec db \
  psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -f /tmp/neon-data.sql
```

> Use `--data-only` porque o schema já foi criado pelo `prisma db push` no passo 4.

Se preferir **começar do zero**, rode o seed:

```bash
docker compose --env-file .env.docker exec app npm run db:seed
```

---

## 6. Verificar o cron (job de snapshot)

O container `cron` chama `/api/cron/snapshot` nos **dias úteis às 22:00 UTC**
(mesmo horário do `vercel.json`).

```bash
# Ver agendamento e logs do cron
docker compose --env-file .env.docker logs cron

# Testar o endpoint manualmente (de dentro da VM)
curl -fsS -H "Authorization: Bearer SEU_CRON_SECRET" \
  http://localhost:3000/api/cron/snapshot
```

> **Fuso horário:** o horário está em UTC para ficar idêntico ao Vercel.
> 22:00 UTC = 19:00 no horário de Brasília. Se quiser ajustar para o horário
> local, edite a linha do cron em `docker/cron-entrypoint.sh`.

---

## 7. Comandos do dia a dia

```bash
# Parar tudo
docker compose --env-file .env.docker down

# Subir de novo (sem rebuild)
docker compose --env-file .env.docker up -d

# Atualizar após mudanças no código
git pull
docker compose --env-file .env.docker up -d --build

# Ver status
docker compose --env-file .env.docker ps

# Acessar o banco
docker compose --env-file .env.docker exec db psql -U attendance -d attendance
```

---

## 8. Backup do banco

```bash
# Backup
docker compose --env-file .env.docker exec db \
  pg_dump -U attendance attendance > backup-$(date +%F).sql

# Restore
cat backup.sql | docker compose --env-file .env.docker exec -T db \
  psql -U attendance -d attendance
```

> Os dados ficam no volume `pgdata` e sobrevivem a `down`/`up`.
> Eles só são apagados com `docker compose down -v`.

---

## 9. Depois da migração

- Remova o projeto da Vercel (ou desligue o deploy) para evitar o cron duplicado.
- O `vercel.json` pode ser mantido no repo sem efeito na VM.

---

## Notas

- **`prisma db push --accept-data-loss`**: o entrypoint usa `db push` (o mesmo
  fluxo do projeto, que não usa migrations). Em mudanças destrutivas de schema
  isso pode apagar colunas — para este schema simples é seguro, mas avalie ao
  evoluir o modelo.
- **HTTPS/domínio**: esta configuração expõe a porta 3000 direto. Se mais tarde
  precisar de domínio + HTTPS, coloque um Nginx ou Caddy na frente.
