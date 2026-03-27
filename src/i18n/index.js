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

export const LANG = import.meta.env.LANG || 'en'
export const SITE_URL = import.meta.env.SITE_URL || 'https://joyorscooter.us'
