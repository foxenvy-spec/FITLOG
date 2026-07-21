import type { Metadata, Viewport } from 'next'
import { Oswald, Inter, JetBrains_Mono, Kanit, IBM_Plex_Sans_Thai } from 'next/font/google'
import './globals.css'
import ServiceWorkerRegister from '@/components/ServiceWorkerRegister'

const oswald = Oswald({
  subsets: ['latin'],
  weight: ['500', '600', '700'],
  variable: '--font-oswald',
  display: 'swap',
})

const inter = Inter({
  subsets: ['latin'],
  weight: ['400', '500', '600'],
  variable: '--font-inter',
  display: 'swap',
})

const mono = JetBrains_Mono({
  subsets: ['latin'],
  weight: ['400', '500', '700'],
  variable: '--font-mono',
  display: 'swap',
})

// Oswald/Inter/JetBrains Mono don't include Thai glyphs — without these,
// every Thai character silently falls back to the browser's plain system
// font while English/numbers get the designed typeface, which is what
// makes Thai text look "less premium". Kanit is a condensed geometric Thai
// face that pairs with Oswald's display style; IBM Plex Sans Thai pairs
// with Inter's grotesque body style.
const kanit = Kanit({
  subsets: ['thai', 'latin'],
  weight: ['500', '600', '700'],
  variable: '--font-kanit',
  display: 'swap',
})

const plexThai = IBM_Plex_Sans_Thai({
  subsets: ['thai', 'latin'],
  weight: ['400', '500', '600'],
  variable: '--font-plex-thai',
  display: 'swap',
})

export const metadata: Metadata = {
  title: 'FITLOG — บันทึกการออกกำลังกาย',
  description: 'จดสถิติการออกกำลังกายของคุณ ทั้งเวทเทรนนิ่งและคาร์ดิโอ',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'FITLOG',
  },
  icons: {
    icon: '/icons/icon-192.png',
    apple: '/icons/icon-192.png',
  },
}

export const viewport: Viewport = {
  themeColor: '#14161A',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="th" className={`${oswald.variable} ${inter.variable} ${mono.variable} ${kanit.variable} ${plexThai.variable}`}>
      <body>
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  )
}
