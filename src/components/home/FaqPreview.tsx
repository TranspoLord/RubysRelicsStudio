'use client'

import { useState } from 'react'
import Box from '@mui/material/Box'
import Container from '@mui/material/Container'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Accordion from '@mui/material/Accordion'
import AccordionSummary from '@mui/material/AccordionSummary'
import AccordionDetails from '@mui/material/AccordionDetails'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ArrowForwardIcon from '@mui/icons-material/ArrowForward'
import Link from 'next/link'
import { alpha } from '@mui/material/styles'
import { brandTokens } from '@/theme/theme'
import type { DbFaqItem } from '@/lib/supabase/queries/homepage'

interface FaqPreviewProps {
  faqs?: DbFaqItem[]
}

const STATIC_FAQS: DbFaqItem[] = [
  {
    id: 'faq-nsfw',
    question: 'Is NSFW or suggestive content acceptable?',
    answer:
      'Yes, we accept NSFW or suggestive artwork as long as it is legal. We do not discriminate based on subject matter or artistic expression within legal boundaries. We do not print unlawful material or artwork listed on the Public Restriction List.',
    link_label: 'Content policy',
    link_href: '/resources/terms',
    is_visible: true,
    sort_order: 1,
  },
  {
    id: 'faq-artwork',
    question: 'Can I upload my own artwork?',
    answer:
      'Yes — most of our products support custom artwork uploads. We accept PNG, JPG, and PDF files. For best results, provide the highest-resolution file you have. The configurator will preview estimated quality before you add to cart. Reference photos are also welcome for custom order requests.',
    link_label: 'Artwork requirements',
    link_href: '/resources/artwork',
    is_visible: true,
    sort_order: 2,
  },
  {
    id: 'faq-materials',
    question: 'What materials do you work with?',
    answer:
      'We engrave and cut on wood (basswood, walnut), acrylic (clear, frosted, black, mirror), leather, and slate. We also do sublimation printing on ceramic mugs, powder-coated tumblers, cotton apparel, and canvas. Every material has specific quality characteristics — our Materials Guide explains each one.',
    link_label: 'Materials guide',
    link_href: '/resources/materials',
    is_visible: true,
    sort_order: 3,
  },
  {
    id: 'faq-production',
    question: 'How long does production take?',
    answer:
      'Most orders are crafted within 3–7 business days depending on category and current queue depth. Production time is visible on every product page and is always driven by live queue data — never a static promise. Shipping time is additional. Rush availability is sometimes offered for a surcharge.',
    link_label: 'Shipping & Fulfillment',
    link_href: '/resources/shipping',
    is_visible: true,
    sort_order: 4,
  },
  {
    id: 'faq-custom',
    question: 'Do you take completely custom commissions?',
    answer:
      "Absolutely. If your idea doesn't fit our standard catalog, submit a Custom Order request. Describe your vision, upload reference files, and we'll review feasibility. If we can do it, we'll send you a quote. You only pay once you approve the price — no upfront commitment.",
    link_label: 'Start a custom request',
    link_href: '/custom-orders',
    is_visible: true,
    sort_order: 5,
  },
]

export function FaqPreview({ faqs }: FaqPreviewProps = {}) {
  const items = faqs && faqs.length > 0 ? faqs : STATIC_FAQS
  const [expanded, setExpanded] = useState<string | false>(false)

  const handleChange = (panel: string) => (_: React.SyntheticEvent, isExpanded: boolean) => {
    setExpanded(isExpanded ? panel : false)
  }

  return (
    <Box
      component="section"
      aria-labelledby="faq-heading"
      sx={{ py: { xs: 8, md: 10 } }}
    >
      <Container maxWidth="md">
        <Box sx={{ textAlign: 'center', mb: { xs: 5, md: 6 } }}>
          <Typography variant="overline" sx={{ color: 'primary.main', display: 'block', mb: 1 }}>
            Quick Answers
          </Typography>
          <Typography
            id="faq-heading"
            variant="h2"
            component="h2"
            sx={{ color: 'text.primary' }}
          >
            Frequently Asked
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {items.map((item) => (
            <Accordion
              key={item.id}
              expanded={expanded === item.id}
              onChange={handleChange(item.id)}
              disableGutters
              elevation={0}
              sx={{
                backgroundColor: alpha(brandTokens.bgCard, 0.85),
                border: `1px solid ${expanded === item.id
                  ? alpha(brandTokens.forgeGold, 0.3)
                  : alpha(brandTokens.parchment, 0.08)
                }`,
                borderRadius: '8px !important',
                transition: 'border-color 0.2s ease',
                '&::before': { display: 'none' },
                '&:focus-within': {
                  outline: `2px solid ${brandTokens.forgeGold}`,
                  outlineOffset: '2px',
                },
              }}
            >
              <AccordionSummary
                expandIcon={
                  <ExpandMoreIcon
                    sx={{
                      color: expanded === item.id ? 'primary.main' : 'text.secondary',
                      transition: 'color 0.2s ease',
                    }}
                  />
                }
                aria-controls={`${item.id}-content`}
                id={`${item.id}-header`}
                sx={{
                  px: 3,
                  py: 1.5,
                  '&:hover': { backgroundColor: alpha(brandTokens.parchment, 0.03) },
                }}
              >
                <Typography
                  variant="subtitle1"
                  sx={{
                    fontWeight: 500,
                    color: expanded === item.id ? 'primary.light' : 'text.primary',
                    fontSize: { xs: '0.95rem', md: '1rem' },
                    transition: 'color 0.2s ease',
                  }}
                >
                  {item.question}
                </Typography>
              </AccordionSummary>

              <AccordionDetails
                id={`${item.id}-content`}
                role="region"
                aria-labelledby={`${item.id}-header`}
                sx={{ px: 3, pb: 2.5, pt: 0 }}
              >
                <Typography
                  variant="body2"
                  color="text.secondary"
                  sx={{ lineHeight: 1.8, mb: item.link_href ? 2 : 0 }}
                >
                  {item.answer}
                </Typography>
                {item.link_href && item.link_label && (
                  <Box
                    component={Link}
                    href={item.link_href}
                    sx={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 0.5,
                      color: 'primary.light',
                      fontSize: '0.85rem',
                      textDecoration: 'none',
                      fontWeight: 500,
                      '&:hover': { color: 'primary.main' },
                      '&:focus-visible': {
                        outline: `2px solid ${brandTokens.forgeGold}`,
                        outlineOffset: '2px',
                        borderRadius: 1,
                      },
                    }}
                  >
                    {item.link_label}
                    <ArrowForwardIcon sx={{ fontSize: '0.85rem' }} />
                  </Box>
                )}
              </AccordionDetails>
            </Accordion>
          ))}
        </Box>

        <Box sx={{ textAlign: 'center', mt: 5 }}>
          <Button
            component={Link}
            href="/resources/faq"
            variant="outlined"
            color="primary"
            endIcon={<ArrowForwardIcon />}
          >
            View All FAQs
          </Button>
        </Box>
      </Container>
    </Box>
  )
}
