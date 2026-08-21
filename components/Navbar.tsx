'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'

const links = [
  {
    href: '/',
    label: 'Daily Attendance',
    labelJp: '本日',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
      </svg>
    ),
  },
  {
    href: '/dashboard',
    label: 'Dashboard',
    labelJp: 'ダッシュボード',
    icon: (
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
      </svg>
    ),
  },
]

const adminLink = {
  href: '/admin',
  label: 'Administração',
  labelJp: '管理',
  icon: (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 15a3 3 0 100-6 3 3 0 000 6z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.4 15a1.65 1.65 0 00.33 1.82l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.65 1.65 0 00-1.82-.33 1.65 1.65 0 00-1 1.51V21a2 2 0 11-4 0v-.09a1.65 1.65 0 00-1-1.51 1.65 1.65 0 00-1.82.33l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.65 1.65 0 00.33-1.82 1.65 1.65 0 00-1.51-1H3a2 2 0 110-4h.09a1.65 1.65 0 001.51-1 1.65 1.65 0 00-.33-1.82l-.06-.06a2 2 0 112.83-2.83l.06.06a1.65 1.65 0 001.82.33H9a1.65 1.65 0 001-1.51V3a2 2 0 114 0v.09a1.65 1.65 0 001 1.51 1.65 1.65 0 001.82-.33l.06-.06a2 2 0 112.83 2.83l-.06.06a1.65 1.65 0 00-.33 1.82V9a1.65 1.65 0 001.51 1H21a2 2 0 110 4h-.09a1.65 1.65 0 00-1.51 1z" />
    </svg>
  ),
}

interface Me {
  username: string
  role: 'admin' | 'user'
}

export default function Navbar() {
  const pathname = usePathname()
  const router = useRouter()
  const [me, setMe] = useState<Me | null>(null)

  useEffect(() => {
    if (pathname === '/login') return
    fetch('/api/auth/me')
      .then(r => r.json())
      .then(d => setMe(d.user))
      .catch(() => setMe(null))
  }, [pathname])

  if (pathname === '/login') return null

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    router.push('/login')
    router.refresh()
  }

  const allLinks = me?.role === 'admin' ? [...links, adminLink] : links

  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-blue-900 shadow-lg">
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
        {/* Brand */}
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </div>
          <div className="hidden sm:block">
            <div className="text-white font-bold text-sm leading-tight">出勤率管理</div>
            <div className="text-blue-300 text-xs leading-tight">Gestão de Frequência</div>
          </div>
        </div>

        {/* Nav links */}
        <nav className="flex items-center gap-1">
          {allLinks.map(link => {
            const isActive = link.href === '/' ? pathname === '/' : pathname.startsWith(link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all duration-150 ${
                  isActive
                    ? 'bg-white text-blue-900 shadow-sm'
                    : 'text-blue-200 hover:text-white hover:bg-blue-800'
                }`}
              >
                {link.icon}
                <span className="hidden sm:inline">{link.label}</span>
                <span className="text-[10px] opacity-60 hidden md:inline">{link.labelJp}</span>
              </Link>
            )
          })}

          {me && (
            <div className="flex items-center gap-2 ml-2 pl-3 border-l border-blue-700">
              <span className="hidden md:inline text-blue-200 text-xs">
                {me.username} {me.role === 'admin' && <span className="text-amber-300">(admin)</span>}
              </span>
              <button
                onClick={handleLogout}
                className="text-blue-200 hover:text-white hover:bg-blue-800 rounded-lg px-3 py-2 text-sm font-medium transition-all duration-150"
              >
                Sair
              </button>
            </div>
          )}
        </nav>
      </div>
    </header>
  )
}
