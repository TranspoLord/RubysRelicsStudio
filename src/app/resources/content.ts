export interface ResourceSection {
  heading: string
  body: string[]
}

export interface ResourcePageContent {
  slug: string
  title: string
  summary: string
  lastUpdated: string
  sections: ResourceSection[]
}

export function getResourcePages(supportEmail: string): Record<string, ResourcePageContent> {
  return {
  terms: {
    slug: 'terms',
    title: 'Terms of Service',
    summary: 'Age, content, IP protections, fulfillment, liability, and dispute terms for custom production orders.',
    lastUpdated: 'July 20, 2026',
    sections: [
      {
        heading: 'Age Requirement and Content Policy',
        body: [
          'By placing an order with Ruby\'s Relics Studio, you represent and warrant that you are at least 18 years old.',
          'Mature or NSFW content may be accepted when lawful. We do not discriminate based on subject matter or artistic expression within legal boundaries.',
          'We do not print unlawful material or artwork listed on the Public Restriction List. Orders canceled for policy violations are refunded minus non-recoverable processing fees.',
        ],
      },
      {
        heading: 'Intellectual Property and Customer Responsibility',
        body: [
          'By submitting artwork, you represent and warrant that you own all rights to the submitted content or have obtained all necessary permissions from the rights holder for reproduction and any intended use.',
          'It is your sole responsibility to ensure you have the legal right to use any artwork, images, trademarks, or other intellectual property submitted for production.',
          'Ruby\'s Relics Studio does not verify intellectual property ownership and relies entirely on your representation of rights. We are not a copyright clearance service.',
          'If your order is for resale or other commercial use, you warrant that the rights holder has consented to that commercial use and that any licensing fees, royalties, or other obligations are your responsibility.',
          'You agree to indemnify and hold Ruby\'s Relics Studio harmless against any claims, losses, damages, and legal costs arising from copyright infringement, trademark violation, or unauthorized use of intellectual property in connection with submitted artwork.',
          'Ruby\'s Relics Studio reserves the right to refuse any order if we suspect intellectual property concerns, regardless of your representation.',
        ],
      },
      {
        heading: 'Nature of Service, Quality, and Pricing',
        body: [
          'Ruby\'s Relics Studio is a boutique one-dragon operation using prosumer equipment, not a mass-production factory.',
          'Minor variation in color and cut alignment (including tolerances up to about 1mm) is inherent to handmade and small-batch production and is not considered a defect.',
          'Ruby\'s Relics Studio provides custom printing and precision cutting services based on customer-supplied digital artwork.',
          'Prices may change without notice. Custom quotes are valid for 30 days from issue unless otherwise stated.',
          'Price updates do not affect orders already paid and formally accepted into production.',
          'We are not responsible for pixelation, blur, or quality loss caused by low-resolution source files. 300 DPI artwork is strongly recommended.',
        ],
      },
      {
        heading: 'Shipping, Conventions, and Liability Transfer',
        body: [
          'Ruby\'s Relics Studio legal and financial liability ends at the earliest applicable point: delivery confirmation from you (email, DM, or text), in-person acceptance at pickup or convention handoff, or after carrier tracking marks a package as Delivered.',
          'We are not liable for carrier errors, delays, theft, or transit damage after shipment handoff, however our packages are insured and we provide reasonable support for claims. We are not responsible for lost or stolen packages after delivery confirmation.',
          'Use and application of stickers or other products on personal or third-party property is at your own risk. Ruby\'s Relics Studio is not liable for damage from application or removal.',
        ],
      },
      {
        heading: 'Attribution and File Retention',
        body: [
          'You may not claim credit for physical manufacturing. If you resell produced items, you agree to clearly credit Ruby\'s Relics Studio as manufacturer.',
          'We do not retain files for resale or commercial use. We are not responsible for lost or deleted files after the retention period.',
          'We do not provide file backups or storage for customer artwork. It is your responsibility to maintain your own copies of submitted files.',
          'Artwork and customer files are retained in a private database. It does not become public nor shared with Square or other third parties.'
        ],
      },
      {
        heading: 'Returns and Refunds',
        body: [
          'Because products are custom-made, all sales are final unless required otherwise by law.',
          'If there is a confirmed manufacturing defect, contact support within 7 days of delivery and include clear photos for review.',
        ],
      },
      {
        heading: 'Production Timeline and Fulfillment',
        body: [
          'Turnaround depends on active queue volume, order complexity, and material readiness.',
          'Orders are fulfilled in line with Ruby\'s Relics Studio production windows and posted reopening schedule.',
          'Tracking details are provided after shipment when available. We are not responsible for carrier-side delays outside studio control.',
        ],
      },
      {
        heading: 'Chargebacks and Disputes',
        body: [
          'By placing an order, you confirm you are the authorized payment method holder and understand the custom, generally non-refundable nature of these products.',
          'Ruby\'s Relics Studio may retain order records, payment confirmations, communication history, and shipment evidence to respond to payment disputes.',
          `For billing or fulfillment issues, contact ${supportEmail} first so we can attempt direct resolution before formal disputes are filed.`,
          'Fraudulent or abusive chargebacks on fulfilled custom orders may be formally contested with supporting records and reported to relevant payment and fraud review channels.',
        ],
      },
    ],
  },
  privacy: {
    slug: 'privacy',
    title: 'Privacy Policy',
    summary: 'How customer data is collected, used, and retained for storefront operations.',
    lastUpdated: 'Jul 20, 2026',
    sections: [
      {
        heading: 'Data We Collect',
        body: [
          'We collect checkout and request details needed to process orders, including contact information, shipping details, and product selections.',
          'We may collect event-level analytics for storefront performance and UX optimization.',
        ],
      },
      {
        heading: 'How Data Is Used',
        body: [
          'Data is used to fulfill orders, communicate order status, prevent abuse, and improve storefront operations.',
          'Sensitive payment handling is delegated to Square and is not stored in our database or storefront.',
        ],
      },
      {
        heading: 'Retention and Contact',
        body: [
          'Order and request records may be retained for operations, support, legal compliance, and financial reporting.',
          `Questions about privacy handling can be sent to ${supportEmail}.`,
        ],
      },
    ],
  },
  cookies: {
    slug: 'cookies',
    title: 'Cookie Policy',
    summary: 'Cookie and local-storage usage for storefront functionality and measurement.',
    lastUpdated: 'May 8, 2026',
    sections: [
      {
        heading: 'Essential Storage',
        body: [
          'Essential browser storage is used to keep cart state and UI continuity between pages and sessions.',
          'These controls support normal storefront use and do not require account creation.',
        ],
      },
      {
        heading: 'Analytics and Optimization',
        body: [
          'Event analytics may be used to measure path selection, browsing behavior, and checkout progression.',
          'Analytics is used for operational improvements and not for selling personal information.',
        ],
      },
      {
        heading: 'Cookie Categories',
        body: [
          'Essential: cart/session continuity and security controls required for normal checkout behavior.',
          'Analytics: aggregate storefront performance metrics (for example traffic and conversion trend reporting).',
          'Preferences: optional UI-state persistence such as dismissed notices and interface selections.',
        ],
      },
      {
        heading: 'Retention Windows',
        body: [
          'Essential cart/session storage may persist up to 30 days unless cleared earlier by the browser or user.',
          'Consent preference storage persists until changed in the cookie preference manager or manually cleared.',
          'Analytics retention follows provider defaults for aggregate reporting and does not include direct customer identity data.',
        ],
      },
      {
        heading: 'Managing Preferences',
        body: [
          'Use the cookie preference manager in the banner to opt in/out of analytics and preference categories.',
          'You can clear browser storage and cookie data from your browser settings at any time.',
          'Some storefront features may behave differently if storage is blocked entirely.',
        ],
      },
    ],
  },
  returns: {
    slug: 'returns',
    title: 'Returns and Refunds',
    summary: 'Eligibility rules and process for return, replacement, and refund outcomes.',
    lastUpdated: 'May 8, 2026',
    sections: [
      {
        heading: 'Custom and Made-to-Order Items',
        body: [
          'Custom-produced items are generally non-returnable unless there is a production defect or fulfillment error.',
          'If a defect is confirmed, we may offer replacement, partial refund, or full refund depending on severity.',
        ],
      },
      {
        heading: 'Ready-Made Items',
        body: [
          'Ready-made stock may be return-eligible in original condition within the posted return window.',
          'Shipping charges are normally non-refundable unless the return is caused by our error.',
        ],
      },
      {
        heading: 'How to Start a Claim',
        body: [
          `Contact ${supportEmail} with order ID, issue description, and clear photos when relevant.`,
          'Claims are reviewed in intake order; resolution timelines can vary based on queue and complexity.',
        ],
      },
    ],
  },
  shipping: {
    slug: 'shipping',
    title: 'Shipping and Fulfillment',
    summary: 'Production windows, shipment handling, and delivery expectation guidance.',
    lastUpdated: 'July 20, 2026',
    sections: [
      {
        heading: 'Production First, Then Shipment',
        body: [
          'Most products are made to order, so production time is a core part of total delivery time.',
          'Order pages and product pages show estimated production windows to set expectations early.',
          'This is not a guarantee of production or delivery date, as queue depth, order complexity, and material readiness can affect fulfillment timing.',
        ],
      },
      {
        heading: 'Carriers and Tracking',
        body: [
          'Shipping carrier selection may vary by package profile and destination.',
          'When tracking is available, shipment milestones are shared through order status links or Square.',
        ],
      },
      {
        heading: 'Delays and Exceptions',
        body: [
          'Severe weather, carrier network events, and address issues may cause transit delays outside studio control.',
          `If there is a fulfillment issue, contact ${supportEmail} with order details for support.`,
        ],
      },
    ],
  },
  materials: {
    slug: 'materials',
    title: 'Materials Guide',
    summary: 'Overview of supported blanks, finishes, and practical use-case notes.',
    lastUpdated: 'May 8, 2026',
    sections: [
      {
        heading: 'Common Surfaces',
        body: [
          'Supported lines may include wood, acrylic, leather, coated drinkware, and sublimation-compatible blanks.',
          'Material availability can shift by supplier inventory and seasonal restocks.',
        ],
      },
      {
        heading: 'Finish Expectations',
        body: [
          'Engraved contrast and sublimation saturation vary by substrate, coating quality, and artwork source quality.',
          'We tune process settings per material category to prioritize readable, durable results.',
        ],
      },
      {
        heading: 'Selection Help',
        body: [
          'When in doubt, use custom-order intake notes to describe intended use and finish goals for guidance.',
          'Material previews on the storefront are educational references and not exact color proofs.',
        ],
      },
    ],
  },
  artwork: {
    slug: 'artwork',
    title: 'Artwork Requirements',
    summary: 'File quality, resolution, and legal ownership guidance for submitted artwork.',
    lastUpdated: 'May 8, 2026',
    sections: [
      {
        heading: 'Recommended Files',
        body: [
          'Provide clear source files whenever possible; vector artwork is preferred for scalable line precision.',
          'Raster artwork should be high resolution and cleanly legible at final output size.',
        ],
      },
      {
        heading: 'Content Constraints',
        body: [
          'Files containing unlawful, unsafe, or rights-restricted material may be declined during review.',
          'Trademarked and copyrighted material requires customer rights clearance before production.',
        ],
      },
      {
        heading: 'Submission Tips',
        body: [
          'Include intended dimensions, placement notes, and any must-preserve design details.',
          'If exact text must match case or spacing, include it explicitly in production notes.',
        ],
      },
    ],
  },
  care: {
    slug: 'care',
    title: 'Care Instructions',
    summary: 'Handling and care recommendations to protect finish quality over time.',
    lastUpdated: 'May 8, 2026',
    sections: [
      {
        heading: 'General Handling',
        body: [
          'Avoid abrasive cleaning products and rough scrubbing on decorated surfaces.',
          'Store and transport finished items to minimize impact, moisture exposure, and edge abrasion.',
        ],
      },
      {
        heading: 'Drinkware and Coated Surfaces',
        body: [
          'Handwashing is generally recommended for decorated drinkware unless otherwise specified.',
          'High heat and aggressive detergents can reduce long-term finish quality on some substrates.',
        ],
      },
      {
        heading: 'Signs and Decor',
        body: [
          'Indoor display environments usually offer the best long-term finish stability.',
          'For outdoor use, request suitable substrate and finish guidance before ordering.',
        ],
      },
    ],
  },
  safety: {
    slug: 'safety',
    title: 'Safety and Sourcing',
    summary: 'Supported process boundaries, material safety scope, and sourcing transparency notes.',
    lastUpdated: 'May 8, 2026',
    sections: [
      {
        heading: 'Process Safety Scope',
        body: [
          'Only supported materials and process-safe blanks are accepted for production.',
          'Unsupported or hazardous requests may be rejected to protect equipment, operators, and final product quality.',
        ],
      },
      {
        heading: 'Sourcing Notes',
        body: [
          'Materials are sourced through vetted channels when possible, with category suitability considered before listing.',
          'Availability and supplier details may change based on stock conditions and quality controls.',
        ],
      },
      {
        heading: 'Customer Guidance',
        body: [
          'If your project has unusual material needs, submit a custom request before purchase for feasibility review.',
          'Do not assume all blanks are food-safe, heat-safe, or outdoor-rated unless explicitly indicated.',
        ],
      },
    ],
  },
  faq: {
    slug: 'faq',
    title: 'Frequently Asked Questions',
    summary: 'Common storefront, customization, and fulfillment questions in one place.',
    lastUpdated: 'May 8, 2026',
    sections: [
      {
        heading: 'Is NSFW or suggestive content acceptable?',
        body: [
          'Yes, we accept NSFW or suggestive artwork as long as it is legal. We do not discriminate based on subject matter or artistic expression within legal boundaries.',
          'Orders canceled for policy violations are refunded minus non-recoverable processing fees. We reserve the right to report unlawful content to authorities.',
          'All standard artwork requirements still apply (resolution, file formats, etc.). See the Artwork Requirements page for details.',
        ],
      },
      {
        heading: 'Can I upload my own artwork?',
        body: [
          'Yes! This storefront is designed for custom artwork submission. You can upload your own designs during the order process.',
          'You must have rights to use submitted artwork for production.',
        ],
      },
      {
        heading: 'How long does production take?',
        body: [
          'Production timing depends on queue depth, order complexity, and material readiness.',
          'Estimate bands are displayed on products and tracked through order status updates.',
        ],
      },
      {
        heading: 'Do you support unusual one-off projects?',
        body: [
          'Yes. Use the custom-order intake route for requests outside standard catalog options.',
          'Each request is reviewed for feasibility, timeline, and quoting before production.',
          'This does not guarantee acceptance, but we will provide feedback and guidance on next steps.',
        ],
      },
      {
        heading: 'What happens to my artwork after order and delivery?',
        body: [
          'Your artwork is stored on a private database that only we can see. It is not shared with Square or other third parties.',
          'To your payment processor, you are buying a simple mug, for example. To us, you are buying a spicy gift for your friend.',
          'Because storage is not cheap, we keep artwork until the 7 day mark after the products are delivered.',
        ],
      }
    ],
  },
  }
}

export const RESOURCE_INDEX = [
  'terms',
  'privacy',
  'cookies',
  'returns',
  'shipping',
  'materials',
  'artwork',
  'care',
  'safety',
  'faq',
]
  .map((slug) => getResourcePages('support@example.com')[slug])
  .filter((item): item is ResourcePageContent => Boolean(item))
