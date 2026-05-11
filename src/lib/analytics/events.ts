// ─── Vercel Analytics event wrappers ─────────────────────────────────────────
// All analytics events defined in EXPANSION_NOTES must flow through this module.
// Keeps event names and payload shapes consistent across the storefront.
// Never include PII (email, name, address) in analytics events.

import { track } from '@vercel/analytics'
import type { OrderPathAnalytic, SearchScope } from '@/types'

// ─── Navigation / page ────────────────────────────────────────────────────────
export const Analytics = {
  // User selects an order path from the homepage
  pathChosen(path: OrderPathAnalytic) {
    track('path_chosen', { path })
  },

  // User clicks a category card
  categoryClicked(categoryKey: string, categorySlug: string) {
    track('category_clicked', { category_key: categoryKey, slug: categorySlug })
  },

  // User clicks a featured collection
  collectionClicked(collectionId: string, title: string) {
    track('collection_clicked', { collection_id: collectionId, title })
  },

  // ─── Search ─────────────────────────────────────────────────────────────────
  searchQuery(query: string, scope: SearchScope, resultCount: number) {
    track('search_query', { query, scope, result_count: resultCount })
  },

  searchResultClicked(query: string, scope: SearchScope, resultKey: string, position: number) {
    track('search_result_clicked', { query, scope, result_key: resultKey, position })
  },

  searchZeroResults(query: string, scope: SearchScope) {
    track('search_zero_results', { query, scope })
  },

  // ─── Product / configurator ──────────────────────────────────────────────────
  productViewed(productId: string, categoryKey: string, orderPath: OrderPathAnalytic) {
    track('product_viewed', { product_id: productId, category_key: categoryKey, order_path: orderPath })
  },

  optionSelected(productId: string, optionKey: string, optionValue: string) {
    track('option_selected', { product_id: productId, option_key: optionKey, option_value: optionValue })
  },

  fileUploaded(productId: string, fileType: 'artwork' | 'reference') {
    track('file_uploaded', { product_id: productId, file_type: fileType })
  },

  recommendationsViewed(productId: string, recommendationIds: string[], algorithm: string) {
    track('recommendations_viewed', {
      product_id: productId,
      recommendation_ids_csv: recommendationIds.join(','),
      recommendation_count: recommendationIds.length,
      algorithm,
    })
  },

  recommendationClicked(productId: string, recommendedProductId: string, position: number, algorithm: string) {
    track('recommendation_clicked', {
      product_id: productId,
      recommended_product_id: recommendedProductId,
      position,
      algorithm,
    })
  },

  addedToCart(productId: string, categoryKey: string, quantity: number) {
    track('added_to_cart', { product_id: productId, category_key: categoryKey, quantity })
  },

  // ─── Cart / checkout ─────────────────────────────────────────────────────────
  cartViewed(itemCount: number) {
    track('cart_viewed', { item_count: itemCount })
  },

  checkoutStarted(orderPath: OrderPathAnalytic, itemCount: number) {
    track('checkout_started', { order_path: orderPath, item_count: itemCount })
  },

  checkoutCompleted(orderPath: OrderPathAnalytic) {
    track('checkout_completed', { order_path: orderPath })
  },

  checkoutAbandoned(orderPath: OrderPathAnalytic, step: string) {
    track('checkout_abandoned', { order_path: orderPath, step })
  },

  // ─── Custom request ──────────────────────────────────────────────────────────
  customRequestStarted() {
    track('custom_request_started')
  },

  customRequestSubmitted() {
    track('custom_request_submitted')
  },

  customRequestAbandoned(step: string) {
    track('custom_request_abandoned', { step })
  },

  // ─── Newsletter ──────────────────────────────────────────────────────────────
  newsletterSignupAttempted(source: string) {
    track('newsletter_signup_attempted', { source })
  },

  // ─── Start-here chooser ──────────────────────────────────────────────────────
  startHereStepCompleted(step: string, answer: string) {
    track('start_here_step', { step, answer })
  },

  startHereCompleted(path: OrderPathAnalytic) {
    track('start_here_completed', { path })
  },

  // ─── Wishlist ────────────────────────────────────────────────────────────────
  wishlistAdded(productId: string) {
    track('wishlist_added', { product_id: productId })
  },

  wishlistRemoved(productId: string) {
    track('wishlist_removed', { product_id: productId })
  },

  // ─── How It Works ────────────────────────────────────────────────────────────
  howItWorksAnchorClicked(anchor: string) {
    track('how_it_works_anchor_clicked', { anchor })
  },

  // ─── Capacity / queue ────────────────────────────────────────────────────────
  waitlistSignupAttempted(categoryKey: string) {
    track('waitlist_signup_attempted', { category_key: categoryKey })
  },
}
