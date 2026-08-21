'use client'

import { usePathname } from 'next/navigation'
import Navbar from './Navbar'

export default function Shell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname()
  const isLogin = pathname === '/login'

  return (
    <>
      <Navbar />
      <div className={isLogin ? '' : 'pt-16'}>{children}</div>
    </>
  )
}
