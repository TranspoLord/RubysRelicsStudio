import type { Metadata } from 'next'
import Box from '@mui/material/Box'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { AnnouncementBanner } from '@/components/home/AnnouncementBanner'
import { HeroSection } from '@/components/home/HeroSection'
import { OrderPathsSection } from '@/components/home/OrderPathsSection'
import { CategoryGrid } from '@/components/home/CategoryGrid'
import { FeaturedCollections } from '@/components/home/FeaturedCollections'
import { FreshFromTheForge } from '@/components/home/FreshFromTheForge'
import { MaterialsTeaser } from '@/components/home/MaterialsTeaser'
import { ProcessStrip } from '@/components/home/ProcessStrip'
import { CustomOrderPitch } from '@/components/home/CustomOrderPitch'
import { TestimonialsSection } from '@/components/home/TestimonialsSection'
import { FaqPreview } from '@/components/home/FaqPreview'
import { NewsletterBlock } from '@/components/home/NewsletterBlock'
import { ResourcesTeaser } from '@/components/home/ResourcesTeaser'

// Homepage-specific metadata override
export const metadata: Metadata = {
  title: "Ruby's Relics Studio — Forged in Fire. Gathered for Your Hoard.",
  description:
    'Custom laser engravings, sublimation gifts, and handcrafted treasures. Made to order by a one-dragon studio — shipped with care to your lair.',
}

// TODO: Once Wave 0 DB is ready, fetch homepage config sections from Supabase here
// (visibility toggles, sort order, hero content, featured collections) as a server component.
// All sections below use static placeholder data until that connection is wired.

export default function HomePage() {
  return (
    <>
      {/* Announcement banner (client: reads localStorage for dismiss state) */}
      <AnnouncementBanner />

      {/* Global header */}
      <Header currentPath="/" />

      {/* Main content */}
      <Box
        component="main"
        id="main-content"
        tabIndex={-1}
        sx={{ outline: 'none', flex: 1, display: 'flex', flexDirection: 'column' }}
      >
        {/* 1. Hero */}
        <HeroSection />

        {/* 2. Three order paths */}
        <OrderPathsSection />

        {/* 3. Category grid */}
        <CategoryGrid />

        {/* 4. Featured collections */}
        <FeaturedCollections />

        {/* 5. Fresh From the Forge — recent work */}
        <FreshFromTheForge />

        {/* 6. Materials teaser */}
        <MaterialsTeaser />

        {/* 7. Process strip */}
        <ProcessStrip />

        {/* 8. Custom order pitch */}
        <CustomOrderPitch />

        {/* 9. Testimonials */}
        <TestimonialsSection />

        {/* 10. FAQ preview */}
        <FaqPreview />

        {/* 11. Newsletter */}
        <NewsletterBlock />

        {/* 12. Resources / policy hub teaser */}
        <ResourcesTeaser />
      </Box>

      {/* Footer */}
      <Footer />
    </>
  )
}
