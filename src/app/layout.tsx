import type { Metadata } from 'next'
import './globals.css'
import { CompanyListInitializer } from '@/components/company-list-initializer'

export const metadata: Metadata = {
  title: 'Sync Value AI',
  description: 'AI 기반 기업 가치 평가 플랫폼',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ko" className="dark">
      <head>
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap"
          crossOrigin="anonymous"
        />
      </head>
      <body className="min-h-screen bg-background text-foreground antialiased">
        <CompanyListInitializer />
        {children}
      </body>
    </html>
  )
}
