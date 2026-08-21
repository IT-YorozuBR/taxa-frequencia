/**
 * Bootstrap do usuário admin padrão. Idempotente — roda em todo start do
 * container (docker-entrypoint.sh), diferente de seed.js (que semeia dados
 * de frequência e não deve rodar automaticamente, pois sobrescreveria
 * edições já feitas pelos usuários).
 *
 * Só cria a conta "admin" se NENHUM administrador existir ainda — não
 * mexe em contas já criadas, então trocar a senha do admin depois é seguro.
 *
 * Run: node prisma/seedAdmin.js
 */

const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

const DEFAULT_USERNAME = 'admin'
const DEFAULT_PASSWORD = 'admin123'

async function main() {
  const adminCount = await prisma.user.count({ where: { role: 'admin' } })
  if (adminCount > 0) {
    console.log('[seedAdmin] Já existe pelo menos um administrador — nada a fazer.')
    return
  }

  const passwordHash = await bcrypt.hash(DEFAULT_PASSWORD, 10)
  await prisma.user.upsert({
    where: { username: DEFAULT_USERNAME },
    update: { role: 'admin' },
    create: { username: DEFAULT_USERNAME, passwordHash, role: 'admin' },
  })

  console.log(`[seedAdmin] Conta admin padrão criada (usuário: ${DEFAULT_USERNAME} / senha: ${DEFAULT_PASSWORD}).`)
  console.log('[seedAdmin] IMPORTANTE: troque essa senha assim que possível.')
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
