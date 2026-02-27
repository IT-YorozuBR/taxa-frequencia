import type { Metadata } from 'next'
import './globals.css'
import Navbar from '@/components/Navbar'

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
        <Navbar />
        <div className="pt-16">{children}</div>
      </body>
    </html>
  )
}
