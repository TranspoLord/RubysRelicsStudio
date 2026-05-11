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
    summary: 'Core usage terms, order commitments, and customer responsibilities.',
    lastUpdated: 'May 8, 2026',
    sections: [
      {
        heading: 'Orders and Acceptance',
        body: [
          "Placing an order means you confirm all provided details are accurate, including quantities, personalization text, and upload content.",
          'Orders become production work once payment is confirmed and are fulfilled according to current queue and complexity.',
        ],
      },
      {
        heading: 'Artwork and Content Rights',
        body: [
          'You are responsible for ensuring your uploaded artwork and requested text are legally usable and do not infringe third-party rights.',
          'Ruby\'s Relics may reject, pause, or cancel requests that appear unsafe, unlawful, or rights-restricted.',
        ],
      },
      {
        heading: 'Production and Fulfillment',
        body: [
          'All items are produced by a one-dragon studio and lead times may shift with queue depth, complexity, and material availability.',
          'Quoted or displayed timelines are estimates rather than guaranteed delivery dates unless explicitly stated in writing.',
        ],
      },
    ],
  },
  privacy: {
    slug: 'privacy',
    title: 'Privacy Policy',
    summary: 'How customer data is collected, used, and retained for storefront operations.',
    lastUpdated: 'May 8, 2026',
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
          'Sensitive payment handling is delegated to Stripe and is not stored as raw card details in this storefront.',
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
        heading: 'Managing Preferences',
        body: [
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
    lastUpdated: 'May 8, 2026',
    sections: [
      {
        heading: 'Production First, Then Shipment',
        body: [
          'Most products are made to order, so production time is a core part of total delivery time.',
          'Order pages and product pages show estimated production windows to set expectations early.',
        ],
      },
      {
        heading: 'Carriers and Tracking',
        body: [
          'Shipping carrier selection may vary by package profile and destination.',
          'When tracking is available, shipment milestones are shared through order status links or direct communication.',
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
        heading: 'Can I upload my own artwork?',
        body: [
          'Yes. Customizable product pages and custom-order intake support customer artwork submission when applicable.',
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
        ],
      },
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
