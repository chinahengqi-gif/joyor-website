import en from './en.json'
import de from './de.json'
import fr from './fr.json'
import it from './it.json'

const langMap = { en, de, fr, it }

export function getTranslations(lang) {
  return langMap[lang] || langMap.en
}

export function t(key, lang, replacements = {}) {
  const translations = getTranslations(lang)
  let text = translations[key] || key
  for (const [k, v] of Object.entries(replacements)) {
    text = text.replace(`{${k}}`, v)
  }
  return text
}

// Normalize LANG to a supported 2-letter code. Shell vars like "C.UTF-8" or
// "en_US.UTF-8" can leak in; strip to the base and whitelist.
const SUPPORTED = ['en', 'de', 'fr', 'it']
const rawLang = String(import.meta.env.LANG || process.env?.LANG || '').split(/[._-]/)[0].toLowerCase()
export const LANG = SUPPORTED.includes(rawLang) ? rawLang : 'en'
export const SITE_URL = import.meta.env.SITE_URL || 'https://joyorscooter.us'
