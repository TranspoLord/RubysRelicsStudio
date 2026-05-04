import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: {
    default: 'Shop the Hoard',
    template: '%s | Shop | Ruby\'s Relics Studio',
  },
  description:
    'Browse custom laser engravings, sublimation gifts, leather goods, and handcrafted treasures. One-dragon studio — every piece made to order.',
}

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
