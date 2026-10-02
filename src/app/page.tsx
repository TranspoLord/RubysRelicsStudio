import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import { Fragment } from 'react'
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
import { getFutureProductNotifySettings } from '@/lib/storefront-settings'
import { orderHomepageSections } from '@/lib/homepage/section-order'
import type { HomepageSectionKey } from '@/lib/homepage/sections'
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
  const [sections, announcement, categories, collections, gallery, testimonials, faq, materials, collageConfig, products, notifySettings] = await Promise.all([
    getHomepageSections(),
    getActiveAnnouncement(),
    getCategories(),
    getFeaturedCollections(),
    getPublishedGallery(12),
    getVisibleTestimonials(6),
    getHomepageFaq(),
    getMaterials(),
    getHeroCollageConfig(),
    getAllActiveProducts(),
    getFutureProductNotifySettings(),
  ])
  /**
   * §7.2: render order now comes from the CMS. `sort_order` used to be returned
   * by the query and ignored, because the JSX sequence below was hard-coded.
   * `orderHomepageSections()` applies the four safety rules (row-less keys stay
   * visible at their default slot, deterministic tie-breaks, hero pinned first,
   * full default order on an empty map) — see `src/lib/homepage/section-order.ts`
   * and its tests, which assert this renders in exactly the old JSX order for the
   * live row values.
   */
  const orderedSections = orderHomepageSections(sections)

  /**
   * One element per renderable section, keyed so the loop above can pick them in
   * CMS order. Creating these is cheap (they only *render* when included), and
   * keying by section key is what makes the order data-driven.
   *
   * `hero_collage` is absent on purpose: it is the hero's content row, passed to
   * HeroSection as `collageConfig`.
   */
  const sectionElements: Partial<Record<HomepageSectionKey, ReactNode>> = {
    hero: <HeroSection collageConfig={collageConfig} />,

    quick_picks: (
      <ShortcutSection
        content={sections['quick_picks']?.content}
        fallbackHeading="What are you here for?!"
        fallbackSubheading="Jump straight to the good stuff."
        ariaLabel="Popular Products"
      />
    ),

    process_picks: (
      <ShortcutSection
        content={sections['process_picks']?.content}
        fallbackHeading="Start with the action!"
        fallbackSubheading="Shop by how it's made."
        ariaLabel="Shop by Process"
        accentColor={`#C4921A`}
      />
    ),

    order_paths: <OrderPathsSection />,

    category_grid: <CategoryGrid categories={categories} />,

    featured_collections: <FeaturedCollections collections={collections} />,

    shop_all_preview: (
      <HomepageProductGrid
        products={products}
        categories={categories}
        content={sections['shop_all_preview']?.content}
        sectionKey="shop_all_preview"
      />
    ),

    fresh_from_forge: <FreshFromTheForge items={gallery} />,

    materials_teaser: (
      <MaterialsTeaser
        materials={materials.map((m) => ({
          key: m.key,
          name: m.display_name,
          description: m.tagline || '',
          bestFor: m.alias_keys?.split(',').map((k) => k.trim()) || [],
          emoji: m.emoji,
          gradient: m.gradient || 'linear-gradient(160deg, #2A1800, #4A2E0A)',
        }))}
      />
    ),

    process_strip: <ProcessStrip />,

    custom_order_pitch: <CustomOrderPitch />,

    testimonials: <TestimonialsSection testimonials={testimonials} />,

    faq_preview: <FaqPreview faqs={faq} />,

    // The notify card keeps its own storefront-settings gate on top of the
    // section's visibility (§3.8): an admin can disable the form without hiding
    // the section.
    future_products_notify:
      notifySettings?.enabled !== false ? (
        <FutureProductsNotifyCard
          content={sections['future_products_notify']?.content}
          sectionKey="future_products_notify"
        />
      ) : null,

    newsletter: <NewsletterBlock />,

    resources_teaser: <ResourcesTeaser />,
  }

  return (
    <>
      {/* Announcement banner (client: reads localStorage for dismiss state).
          §7.4: rendered only when the CMS has an *active* announcement — the
          component no longer substitutes a static banner when the row is
          inactive or missing. */}
      {announcement && <AnnouncementBanner data={announcement} />}

      {/* Global header */}
      <Header currentPath="/" />

      {/* Main content — section order is CMS-driven (§7.2) */}
      <Box
        component="main"
        id="main-content"
        tabIndex={-1}
        sx={{ outline: 'none', flex: 1, display: 'flex', flexDirection: 'column' }}
      >
        {orderedSections
          .filter((section) => section.is_visible)
          .map((section) => (
            <Fragment key={section.key}>{sectionElements[section.key] ?? null}</Fragment>
          ))}
      </Box>

      {/* Footer */}
      <Footer />
    </>
  )
}
