# 出勤率 / Taxa de Frequência — Daily Attendance Tracker

A Next.js web application replicating the Excel attendance sheet functionality, with PostgreSQL storage via Neon.

## Tech Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Tailwind CSS** for styling
- **Prisma** ORM with PostgreSQL (Neon)
- **Recharts** for the attendance comparison chart

## Setup

### 1. Install dependencies

```bash
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env`:

```bash
cp .env.example .env
```

The `.env` file already contains the Neon database connection string. If you need a different database, update `DATABASE_URL`.

### 3. Push database schema

```bash
npm run db:push
```

This creates the `DailyAttendance` table in PostgreSQL.

### 4. Run development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Features

### Main Table (replicates `本日_Hoje` sheet)
- Full department hierarchy: OUTROS, PCP, Eng, Manutenção, Qualidade, PRENSA, Produção
- Three shifts per department: Diurno (1°turno), Noturno (2°turno), Zero Hora (3°turno)
- Per shift: Quadro (staff), Ausência planejada (planned absence), Falta sem aviso (unplanned absence), Taxa de presença (attendance rate)
- Quadro alocado = total staff across all shifts
- Subtotals per group, total row at bottom
- **All numeric cells are directly editable** — click to type, Enter/Tab/blur to save
- Auto-saves to database on each edit (optimistic update)
- Attendance rate = (quadro - planned - unplanned) / quadro, shown as %

### Chart (replicates `Gráficos Diário` sheet)
- Bar chart comparing attendance rates for today vs. the previous working day
- Previous working day logic: if today is Monday, previous = Friday; otherwise previous = yesterday
- Color-coded: light blue = previous day, dark blue = today
- Red dashed reference line at 95%

### Date Picker
- Select any date to view/edit historical data
- "Hoje" button returns to today

## Data Model

```prisma
model DailyAttendance {
  id               String   @id @default(uuid())
  date             DateTime @db.Date
  departmentKey    String   // e.g. "adm", "rh", "prensa"
  shift            String   // "day", "night", "zero"
  quadro           Float
  plannedAbsence   Float
  unplannedAbsence Float
  updatedAt        DateTime @updatedAt
  
  @@unique([date, departmentKey, shift])
}
```

## Department Keys

| Key | Name |
|-----|------|
| `adm` | Administrativo |
| `rh` | RH/DP |
| `fin` | Financeiro/Fiscal/Contabilidade |
| `ti` | Tecnologia da Informação |
| `sst` | SST/MA |
| `log` | Logística |
| `comp` | Compras |
| `com` | Comercial |
| `eng` | Engenharia |
| `pint_int` | Pintura Interna |
| `manut` | Manutenção |
| `qual` | Qualidade |
| `prensa` | Prensa |
| `cald` | Caldeiraria |
| `ferr` | Ferramentaria |
| `mont` | Montagem/Solda |
| `pint` | Pintura |
| `pick` | Picking |

## API Endpoints

- `GET /api/attendance?date=YYYY-MM-DD` — Fetch all records for a date
- `POST /api/attendance` — Upsert a department/shift record

## Deploy to Vercel

```bash
vercel --prod
```

Set `DATABASE_URL` in your Vercel project environment variables.
