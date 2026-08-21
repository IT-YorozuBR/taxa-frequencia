/**
 * Recuperação de emergência: redefine a senha de um usuário direto no banco,
 * sem precisar estar logado no sistema. Existe para o caso do único
 * administrador esquecer a senha e ficar sem conseguir entrar (o app não
 * tem "esqueci minha senha" — só um admin logado pode trocar a senha de
 * outra conta pela tela /admin).
 *
 * Uso (na VM, com os containers no ar):
 *   docker compose exec app node prisma/resetPassword.js admin novaSenhaForte123
 *
 * Uso local (dev):
 *   node prisma/resetPassword.js admin novaSenhaForte123
 */

const { PrismaClient } = require('@prisma/client')
const bcrypt = require('bcryptjs')

const prisma = new PrismaClient()

async function main() {
  const [, , username, newPassword] = process.argv

  if (!username || !newPassword) {
    console.error('Uso: node prisma/resetPassword.js <usuario> <novaSenha>')
    process.exit(1)
  }
  if (newPassword.length < 6) {
    console.error('A nova senha deve ter pelo menos 6 caracteres.')
    process.exit(1)
  }

  const user = await prisma.user.findUnique({ where: { username } })
  if (!user) {
    console.error(`Usuário "${username}" não encontrado.`)
    process.exit(1)
  }

  const passwordHash = await bcrypt.hash(newPassword, 10)
  await prisma.user.update({ where: { id: user.id }, data: { passwordHash } })

  // Registra no audit log mesmo sendo uma ação fora do app — é uma
  // alteração real de credencial e deve ficar rastreável igual às outras.
  await prisma.auditLog.create({
    data: {
      userId: null,
      username: 'sistema (script resetPassword.js)',
      action: 'user.password_reset',
      target: user.username,
      details: { via: 'cli-recovery-script' },
    },
  })

  console.log(`Senha de "${username}" redefinida com sucesso.`)
}

main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
