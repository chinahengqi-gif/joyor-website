import { defineCollection, z } from 'astro:content'
import { glob } from 'astro/loaders'

// Only load markdown from the current build language's folder.
// Example: LANG=de → src/content/blog/de/*.md
// Note: config runs in Node context; read raw env and normalize to a supported
// language so shell vars like C.UTF-8 don't break the glob pattern.
const SUPPORTED = ['en', 'de', 'fr', 'it'] as const
const rawLang = (process.env.LANG || '').split(/[._-]/)[0].toLowerCase()
const LANG = (SUPPORTED as readonly string[]).includes(rawLang) ? rawLang : 'en'

const blog = defineCollection({
  loader: glob({
    pattern: `${LANG}/**/*.md`,
    base: './src/content/blog',
  }),
  schema: ({ image }) =>
    z.object({
      title: z.string(),
      description: z.string(),
      date: z.coerce.date(),
      updated: z.coerce.date().optional(),
      cover: image().optional(),
      coverAlt: z.string().optional(),
      author: z.string().default('Joyor Team'),
      tags: z.array(z.string()).default([]),
      // Stable cross-language key so we can link translations later.
      translationKey: z.string().optional(),
      draft: z.boolean().default(false),
    }),
})

export const collections = { blog }
