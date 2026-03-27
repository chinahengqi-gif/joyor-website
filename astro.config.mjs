// @ts-check
import { defineConfig } from 'astro/config'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  site: process.env.SITE_URL || 'https://joyorscooter.us',
  output: 'static',
  vite: {
    plugins: [tailwindcss()],
  },
})
