// Scooter collections — series + feature-based groupings
// Each collection's `filter` runs on the normalized scooter object from getScooters()

const parseRange = (s) => {
  const m = String(s?.specs?.range || '').match(/(\d+(?:\.\d+)?)/)
  return m ? parseFloat(m[1]) : 0
}

const matchTitle = (re) => (s) => re.test(s.title)
const isUsed = (s) => /\(used\)/i.test(s.title)

export const collections = [
  // Series
  {
    slug: 's-series',
    kind: 'series',
    title: 'S Series',
    tagline: 'Powerhouse performance with off-road capabilities.',
    description: 'Built for riders who refuse to slow down. The S Series pairs dual-motor power and rugged suspension for true all-terrain confidence — from city streets to forest trails.',
    image: '/images/Sseries.jpg',
    filter: (s) => /JOYOR\s+S\d/i.test(s.title) && !isUsed(s),
  },
  {
    slug: 't-series',
    kind: 'series',
    title: 'T Series',
    tagline: 'All the power, none of the bumps.',
    description: 'Premium dual-motor scooters engineered for stability and comfort over long distances. The T Series delivers smooth high-speed cruising on every commute.',
    image: '/images/Tseries.jpg',
    filter: (s) => /JOYOR\s+T\d/i.test(s.title) && !isUsed(s),
  },
  {
    slug: 'y-series',
    kind: 'series',
    title: 'Y Series',
    tagline: 'Sleek, stylish, and agile for modern urban life.',
    description: 'A modern take on city mobility — the Y Series combines lightweight design, refined controls and street-ready performance for daily commuters.',
    image: '/images/Yseries.jpg',
    filter: (s) => /JOYOR\s+Y\d/i.test(s.title) && !isUsed(s),
  },
  {
    slug: 'c-series',
    kind: 'series',
    title: 'C Series',
    tagline: 'Compact, portable, and versatile for every journey.',
    description: 'The C Series is built for riders who need portability without compromise. Compact frames, removable batteries and smart features make these the perfect first-mile companion.',
    image: '/images/Cseries.jpg',
    filter: (s) => /JOYOR\s+C\d/i.test(s.title) && !isUsed(s),
  },
  {
    slug: 'f-series',
    kind: 'series',
    title: 'F Series',
    tagline: 'Lightweight folding design for the mobile professional.',
    description: 'Engineered for life on the move. The F Series folds in seconds, fits anywhere and is ready when you need it.',
    image: '/images/Fseries.jpg',
    filter: (s) => /JOYOR\s+F\d/i.test(s.title) && !isUsed(s),
  },

  // Features
  {
    slug: 'all-terrain',
    kind: 'feature',
    title: 'All-Terrain',
    tagline: 'Engineered for any surface, any condition.',
    description: 'From rocky trails to rough urban terrain — these scooters are built with rugged suspension, all-terrain tires and dual-motor power to handle whatever the road throws at you.',
    image: '/images/Sseries.jpg',
    filter: (s) => /all-terrain/i.test(s.title) && !isUsed(s),
  },
  {
    slug: 'city',
    kind: 'feature',
    title: 'City Commuter',
    tagline: 'Smart, refined and ready for the daily ride.',
    description: 'Designed around the rhythm of the city — agile handling, responsive brakes and a quiet motor make these scooters the ideal choice for everyday commuting.',
    image: '/images/Yseries.jpg',
    filter: (s) => /city commuter/i.test(s.title) && !isUsed(s),
  },
  {
    slug: 'long-range',
    kind: 'feature',
    title: 'Long Range',
    tagline: 'Go further, ride longer.',
    description: 'For riders who want to cover real distance. These models deliver 60km+ of range on a single charge, so the next stop is never out of reach.',
    image: '/images/Tseries.jpg',
    filter: (s) => parseRange(s) >= 60 && !isUsed(s),
  },
  {
    slug: 'certified',
    kind: 'feature',
    title: 'ABE Certified',
    tagline: 'Street-legal in Germany.',
    description: 'These scooters carry full ABE (Allgemeine Betriebserlaubnis) certification — meaning they meet German road regulations and are ready to ride legally on public roads.',
    image: '/images/Cseries.jpg',
    filter: (s) => /\babe\b/i.test(s.title) && !isUsed(s),
  },
]

export function getCollectionBySlug(slug) {
  return collections.find((c) => c.slug === slug)
}
