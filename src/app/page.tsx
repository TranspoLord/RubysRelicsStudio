import type { Metadata } from 'next'
import Box from '@mui/material/Box'
import { Header } from '@/components/layout/Header'
import { Footer } from '@/components/layout/Footer'
import { AnnouncementBanner } from '@/components/home/AnnouncementBanner'
import { HeroSection } from '@/components/home/HeroSection'
import { ShortcutSection } from '@/components/home/ShortcutSection'
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
import { HomepageProductGrid } from '@/components/home/HomepageProductGrid'
import { FutureProductsNotifyCard } from '@/components/home/FutureProductsNotifyCard'
import {
  getHomepageSections,
  getActiveAnnouncement,
  getCategories,
  getFeaturedCollections,
  getPublishedGallery,
  getVisibleTestimonials,
  getHomepageFaq,
  getMaterials,
  getHeroCollageConfig,
} from '@/lib/supabase/queries/homepage'
import { getAllActiveProducts } from '@/lib/supabase/queries/products'
import type { HeroCollageConfig } from '@/components/home/HeroCollage'

// Force dynamic rendering so admin CMS changes (sections, announcements, etc.)
// are reflected on every request rather than serving a statically built page.
export const dynamic = 'force-dynamic'

// Homepage-specific metadata override
export const metadata: Metadata = {
  title: "Ruby's Relics Studio — Forged in Fire. Gathered for Your Hoard.",
  description:
    'Custom laser engravings, sublimation gifts, and handcrafted treasures. Made to order by a one-dragon studio — shipped with care to your lair.',
}

export default async function HomePage() {
  // Fetch all CMS data in parallel
  const [sections, announcement, categories, collections, gallery, testimonials, faq, materials, collageConfig, products] = await Promise.all([
    getHomepageSections(),
    getActiveAnnouncement(),
    getCategories(),
    getFeaturedCollections(),
    getPublishedGallery(6),
    getVisibleTestimonials(3),
    getHomepageFaq(),
    getMaterials(),
    getHeroCollageConfig(),
    getAllActiveProducts(),
  ])
  return (
    <>
      {/* Announcement banner (client: reads localStorage for dismiss state) */}
      <AnnouncementBanner data={announcement} />

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
        {sections['hero']?.is_visible !== false && <HeroSection collageConfig={collageConfig} />}

        {/* 2. Quick picks — "What are you here for?!" */}
        {sections['quick_picks']?.is_visible !== false && (
          <ShortcutSection
            content={sections['quick_picks']?.content}
            fallbackHeading="What are you here for?!"
            fallbackSubheading="Jump straight to the good stuff."
            ariaLabel="Popular Products"
          />
        )}

        {/* 3. Process picks — "Start with the action!" */}
        {sections['process_picks']?.is_visible !== false && (
          <ShortcutSection
            content={sections['process_picks']?.content}
            fallbackHeading="Start with the action!"
            fallbackSubheading="Shop by how it's made."
            ariaLabel="Shop by Process"
            accentColor={`#C4921A`}
          />
        )}

        {/* 4. Three order paths */}
        {sections['order_paths']?.is_visible !== false && <OrderPathsSection />}

        {/* 5. Category grid */}
        {sections['category_grid']?.is_visible !== false && <CategoryGrid categories={categories} />}

        {/* 6. Featured collections */}
        {sections['featured_collections']?.is_visible !== false && (
          <FeaturedCollections collections={collections} />
        )}

        {/* 7a. Shop all preview */}
        {sections['shop_all_preview']?.is_visible !== false && (
          <HomepageProductGrid
            products={products}
            categories={categories}
            content={sections['shop_all_preview']?.content}
            sectionKey="shop_all_preview"
          />
        )}

        {/* 7. Fresh From the Forge — recent work */}
        {sections['fresh_from_forge']?.is_visible !== false && <FreshFromTheForge items={gallery} />}

        {/* 8. Materials teaser */}
        {sections['materials_teaser']?.is_visible !== false && (
          <MaterialsTeaser materials={materials.map((m) => ({
            key: m.key,
            name: m.display_name,
            description: m.tagline || '',
            bestFor: m.alias_keys?.split(',').map((k) => k.trim()) || [],
            emoji: m.emoji,
            gradient: m.gradient || 'linear-gradient(160deg, #2A1800, #4A2E0A)',
          }))} />
        )}

        {/* 7. Process strip */}
        {sections['process_strip']?.is_visible !== false && <ProcessStrip />}

        {/* 8. Custom order pitch */}
        {sections['custom_order_pitch']?.is_visible !== false && <CustomOrderPitch />}

        {/* 9. Testimonials */}
        {sections['testimonials']?.is_visible !== false && <TestimonialsSection testimonials={testimonials} />}

        {/* 10. FAQ preview */}
        {sections['faq_preview']?.is_visible !== false && <FaqPreview faqs={faq} />}

        {/* 11. Future products notify card */}
        {sections['future_products_notify']?.is_visible !== false && (
          <FutureProductsNotifyCard content={sections['future_products_notify']?.content} sectionKey="future_products_notify" />
        )}

        {/* 12. Newsletter */}
        {sections['newsletter']?.is_visible !== false && <NewsletterBlock />}

        {/* 13. Resources / policy hub teaser */}
        {sections['resources_teaser']?.is_visible !== false && <ResourcesTeaser />}
      </Box>

      {/* Footer */}
      <Footer />
    </>
  )
}
