import type { Metadata } from 'next'
import './globals.css'
import Shell from '@/components/Shell'

export const metadata: Metadata = {
  title: '出勤率 / Taxa de Frequência',
  description: 'Daily Attendance Tracker',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="pt-BR">
      <body className="bg-gray-50 min-h-screen">
        <Shell>{children}</Shell>
      </body>
    </html>
  )
}
