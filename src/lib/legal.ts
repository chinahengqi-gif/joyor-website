const LEGAL_ROUTE_MAP = {
  legal_notice: {
    en: '/impressum/',
    de: '/impressum/',
    fr: '/mentions-legales/',
    it: '/note-legali/',
  },
  privacy: {
    en: '/datenschutz/',
    de: '/datenschutz/',
    fr: '/confidentialite/',
    it: '/privacy/',
  },
  returns: {
    en: '/widerrufsrecht/',
    de: '/widerrufsrecht/',
    fr: '/droit-retractation/',
    it: '/diritto-recesso/',
  },
  terms: {
    en: '/agb/',
    de: '/agb/',
    fr: '/cgv/',
    it: '/termini/',
  },
  shipping: {
    en: '/versand/',
    de: '/versand/',
    fr: '/livraison/',
    it: '/spedizione/',
  },
} as const

type Lang = 'en' | 'de' | 'fr' | 'it'
type LegalKey = keyof typeof LEGAL_ROUTE_MAP

const PATH_TO_KEY = new Map<string, LegalKey>(
  Object.entries(LEGAL_ROUTE_MAP).flatMap(([key, routes]) =>
    Object.values(routes).map((path) => [path, key as LegalKey]),
  ),
)

export function getLegalPath(key: LegalKey, lang: Lang) {
  return LEGAL_ROUTE_MAP[key][lang] || LEGAL_ROUTE_MAP[key].en
}

export function getLocalizedPathname(pathname: string, lang: Lang) {
  const cleanPath = pathname.endsWith('/') ? pathname : `${pathname}/`
  const legalKey = PATH_TO_KEY.get(cleanPath)
  return legalKey ? getLegalPath(legalKey, lang) : cleanPath
}

export function getLegalLinks(lang: Lang) {
  return {
    legalNotice: getLegalPath('legal_notice', lang),
    privacy: getLegalPath('privacy', lang),
    returns: getLegalPath('returns', lang),
    terms: getLegalPath('terms', lang),
    shipping: getLegalPath('shipping', lang),
  }
}
