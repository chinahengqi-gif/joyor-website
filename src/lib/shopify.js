import dns from 'node:dns'
import fs from 'node:fs'
import path from 'node:path'
import { LANG } from '../i18n/index.js'

if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first')
}

// 本地文件缓存：避免 dev 模式下每次刷新都请求 Shopify API
const CACHE_DIR = path.resolve('.cache')
const CACHE_TTL = 30 * 60 * 1000 // 30 分钟

function readCache(key) {
  try {
    const file = path.join(CACHE_DIR, `${key}.json`)
    if (!fs.existsSync(file)) return null
    const { timestamp, data } = JSON.parse(fs.readFileSync(file, 'utf-8'))
    if (Date.now() - timestamp > CACHE_TTL) return null
    return data
  } catch { return null }
}

function writeCache(key, data) {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true })
    fs.writeFileSync(
      path.join(CACHE_DIR, `${key}.json`),
      JSON.stringify({ timestamp: Date.now(), data }),
    )
  } catch { /* 写缓存失败不影响功能 */ }
}

const SHOP = import.meta.env.SHOPIFY_STORE_DOMAIN || '27a117-f1.myshopify.com'
const SHOP_NAME = SHOP.replace('.myshopify.com', '')
const CLIENT_ID = import.meta.env.SHOPIFY_CLIENT_ID
const CLIENT_SECRET = import.meta.env.SHOPIFY_CLIENT_SECRET
const COLLECTION_HANDLE = import.meta.env.SHOPIFY_COLLECTION || 'joyor-e-scooter-parts'
const SHOPIFY_LOCALE = LANG

let cachedToken = null
let tokenExpiresAt = 0

async function getAccessToken() {
  if (cachedToken && Date.now() < tokenExpiresAt) return cachedToken

  const url = `https://${SHOP_NAME}.myshopify.com/admin/oauth/access_token`
  console.log(`[Shopify] Fetching access token from: ${url}`)
  console.log(`[Shopify] Client ID: ${CLIENT_ID?.slice(0, 5)}...`)

  try {
    const res = await fetch(
      url,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `grant_type=client_credentials&client_id=${CLIENT_ID}&client_secret=${CLIENT_SECRET}`,
      }
    )

    if (!res.ok) {
      const errorText = await res.text()
      console.error(`[Shopify] Failed to get access token. Status: ${res.status}, Body: ${errorText}`)
      throw new Error(`Failed to get access token: ${res.status}`)
    }

    const data = await res.json()
    cachedToken = data.access_token
    // 提前 5 分钟过期，避免边界问题
    tokenExpiresAt = Date.now() + (data.expires_in - 300) * 1000
    console.log(`[Shopify] Successfully obtained access token. Expires in: ${data.expires_in}s`)
    return cachedToken
  } catch (error) {
    console.error(`[Shopify] Fetch error in getAccessToken:`, error)
    throw error
  }
}

async function adminFetch(query, variables = {}) {
  const token = await getAccessToken()
  const res = await fetch(
    `https://${SHOP_NAME}.myshopify.com/admin/api/2024-01/graphql.json`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Access-Token': token,
      },
      body: JSON.stringify({ query, variables }),
    }
  )

  if (!res.ok) throw new Error(`Shopify Admin API error: ${res.status}`)
  return res.json()
}

function stripHtml(html = '') {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function getCacheKey(base) {
  return SHOPIFY_LOCALE === 'en' ? base : `${base}-${SHOPIFY_LOCALE}`
}

function getTranslationValue(translations = [], key) {
  return translations.find((entry) => entry.key === key)?.value || ''
}

function toLegacyId(id = '') {
  return String(id).split('/').pop() || ''
}

async function getProductTranslations(resourceIds) {
  if (SHOPIFY_LOCALE === 'en' || !resourceIds.length) return new Map()

  const ids = [...new Set(resourceIds.filter(Boolean))]
  const out = new Map()

  for (let i = 0; i < ids.length; i += 50) {
    const batch = ids.slice(i, i + 50)
    const query = `query ProductTranslations($resourceIds: [ID!]!) {
      translatableResourcesByIds(first: 50, resourceIds: $resourceIds) {
        nodes {
          resourceId
          translations(locale: "${SHOPIFY_LOCALE}") {
            key
            value
          }
        }
      }
    }`
    try {
      const response = await adminFetch(query, { resourceIds: batch })
      const nodes = response?.data?.translatableResourcesByIds?.nodes || []
      nodes.forEach((resource) => {
        if (resource?.resourceId) {
          out.set(resource.resourceId, resource.translations || [])
        }
      })
    } catch (error) {
      console.warn(`[Shopify] Failed to fetch product translations for locale "${SHOPIFY_LOCALE}". Falling back to source language.`, error)
      return new Map()
    }
  }

  return out
}

// 构建期间缓存产品数据，避免每个页面重复拉取
let cachedProducts = null

/**
 * 拉取指定 collection 的全部产品（自动翻页，构建期间自动缓存）
 * 包含 productType、compatible 元字段、parts_cla 元字段
 */
export async function getCollectionProducts() {
  if (cachedProducts) return cachedProducts

  // 优先读本地文件缓存
  const diskCache = readCache(getCacheKey('products'))
  if (diskCache) {
    console.log('[Shopify] Using cached products data (local file)')
    cachedProducts = diskCache
    return cachedProducts
  }

  console.log('[Shopify] Fetching products from Shopify API...')
  const products = []
  let cursor = null
  let hasNextPage = true

  while (hasNextPage) {
    const afterClause = cursor ? `, after: "${cursor}"` : ''
    const query = `{
      collectionByHandle(handle: "${COLLECTION_HANDLE}") {
        products(first: 250${afterClause}) {
          pageInfo {
            hasNextPage
          }
          edges {
            cursor
            node {
              id
              handle
              title
              description
              descriptionHtml
              productType
              tags
              vendor
              compatible: metafield(namespace: "custom", key: "compatible") {
                value
                type
              }
              partsCla: metafield(namespace: "custom", key: "parts_cla") {
                value
              }
              priceRange {
                minVariantPrice {
                  amount
                  currencyCode
                }
              }
              variants(first: 10) {
                edges {
                  node {
                    id
                    title
                    price
                    availableForSale
                    selectedOptions { name value }
                  }
                }
              }
              images(first: 8) {
                edges {
                  node { url altText }
                }
              }
            }
          }
        }
      }
    }`

    const { data } = await adminFetch(query)
    const connection = data.collectionByHandle?.products
    if (!connection) break

    for (const { cursor: c, node } of connection.edges) {
      cursor = c
      products.push(normalizeProduct(node))
    }

    hasNextPage = connection.pageInfo.hasNextPage
  }

  const translations = await getProductTranslations(products.map((p) => p.id))
  const localizedProducts = products.map((product) => localizeProduct(product, translations.get(product.id) || []))

  cachedProducts = localizedProducts
  writeCache(getCacheKey('products'), localizedProducts)
  return localizedProducts
}

/**
 * 整理产品数据为统一格式
 */
function normalizeProduct(node) {
  // compatible 是 list.single_line_text_field，值为 JSON 数组字符串
  let compatible = []
  if (node.compatible?.value) {
    try {
      compatible = JSON.parse(node.compatible.value)
    } catch {
      compatible = [node.compatible.value]
    }
  }

  return {
    id: node.id,
    handle: node.handle,
    title: node.title,
    description: node.description,
    descriptionHtml: node.descriptionHtml || '',
    productType: node.productType || '',
    category: node.partsCla?.value || node.productType || '',
    compatible,
    tags: node.tags,
    vendor: node.vendor || '',
    variantId: toLegacyId(node.variants?.edges?.find(({ node: v }) => v.availableForSale)?.node?.id || node.variants?.edges?.[0]?.node?.id || ''),
    price: {
      amount: parseFloat(node.priceRange.minVariantPrice.amount) / 100,
      currency: node.priceRange.minVariantPrice.currencyCode,
    },
    variants: (node.variants?.edges || []).map(({ node: v }) => ({
      title: v.title,
      price: parseFloat(v.price) / 100,
      available: v.availableForSale,
      options: v.selectedOptions,
    })),
    images: node.images.edges.map(({ node: img }) => ({
      url: img.url,
      alt: img.altText || '',
    })),
    buyUrl: `https://joyorprime.com/products/${node.handle}`,
  }
}

function localizeProduct(product, translations = []) {
  if (!translations.length) return product

  const title = getTranslationValue(translations, 'title') || product.title
  const descriptionHtml = getTranslationValue(translations, 'body_html') || product.descriptionHtml || ''
  const description = descriptionHtml ? stripHtml(descriptionHtml) : product.description
  const productType = getTranslationValue(translations, 'product_type') || product.productType

  return {
    ...product,
    title,
    description,
    descriptionHtml: descriptionHtml || product.descriptionHtml,
    productType,
    category: product.category === product.productType ? productType : product.category,
  }
}

// === Scooter Collection ===

let cachedScooters = null
const collectionCache = new Map()

/**
 * 拉取指定系列全部 scooter 产品（含规格元字段）
 */
export async function getScootersByCollection(handle) {
  if (collectionCache.has(handle)) return collectionCache.get(handle)

  const cacheKey = getCacheKey(`scooters-${handle}`)
  const diskCache = readCache(cacheKey)
  if (diskCache) {
    console.log(`[Shopify] Using cached data for collection "${handle}"`)
    collectionCache.set(handle, diskCache)
    return diskCache
  }

  console.log(`[Shopify] Fetching collection "${handle}" from Shopify API...`)
  const query = `{
    collectionByHandle(handle: "${handle}") {
      products(first: 50) {
        edges {
          node {
            id
            handle
            title
            description
            priceRange { minVariantPrice { amount currencyCode } }
            variants(first: 10) {
              edges {
                node {
                  id
                  availableForSale
                }
              }
            }
            images(first: 3) { edges { node { url altText } } }
            supply: metafield(namespace: "custom", key: "supply") { value }
            batterylife: metafield(namespace: "custom", key: "batterylife") { value }
            speed: metafield(namespace: "custom", key: "speed") { value }
            motor: metafield(namespace: "custom", key: "motor") { value }
            scooterpng: metafield(namespace: "custom", key: "scooterpng") { reference { ... on MediaImage { image { url altText } } } }
            point1: metafield(namespace: "custom", key: "_1") { value }
            point2: metafield(namespace: "custom", key: "_2") { value }
            point3: metafield(namespace: "custom", key: "_3") { value }
          }
        }
      }
    }
  }`

  const { data } = await adminFetch(query)
  const edges = data.collectionByHandle?.products?.edges || []
  const result = edges.map(({ node }) => ({
    id: node.id,
    handle: node.handle,
    title: node.title,
    description: node.description,
    variantId: toLegacyId(node.variants?.edges?.find(({ node: v }) => v.availableForSale)?.node?.id || node.variants?.edges?.[0]?.node?.id || ''),
    price: {
      amount: parseFloat(node.priceRange.minVariantPrice.amount) / 100,
      currency: node.priceRange.minVariantPrice.currencyCode,
    },
    images: node.images.edges.map(({ node: img }) => ({ url: img.url, alt: img.altText || '' })),
    specs: {
      supply: node.supply?.value || '',
      range: node.batterylife?.value || '',
      speed: node.speed?.value || '',
      motor: node.motor?.value || '',
    },
    scooterpng: node.scooterpng?.reference?.image?.url || '',
    sellingPoints: [node.point1?.value || '', node.point2?.value || '', node.point3?.value || ''].filter(Boolean),
    buyUrl: `https://joyorprime.com/products/${node.handle}`,
  }))

  const translations = await getProductTranslations(result.map((item) => item.id))
  const localizedResult = result.map((item) => {
    const translated = localizeProduct(item, translations.get(item.id) || [])
    const resourceTranslations = translations.get(item.id) || []
    return {
      ...translated,
      sellingPoints: [
        getTranslationValue(resourceTranslations, 'metafields.custom._1'),
        getTranslationValue(resourceTranslations, 'metafields.custom._2'),
        getTranslationValue(resourceTranslations, 'metafields.custom._3'),
      ].filter(Boolean).length > 0
        ? [
            getTranslationValue(resourceTranslations, 'metafields.custom._1'),
            getTranslationValue(resourceTranslations, 'metafields.custom._2'),
            getTranslationValue(resourceTranslations, 'metafields.custom._3'),
          ].filter(Boolean)
        : item.sellingPoints,
    }
  })

  writeCache(cacheKey, localizedResult)
  collectionCache.set(handle, localizedResult)
  return localizedResult
}

/**
 * 拉取 scooter 系列全部产品（含规格元字段）
 */
export async function getScooters() {
  if (cachedScooters) return cachedScooters

  const diskCache = readCache(getCacheKey('scooters'))
  if (diskCache) {
    console.log('[Shopify] Using cached scooters data (local file)')
    cachedScooters = diskCache
    return cachedScooters
  }

  console.log('[Shopify] Fetching scooters from Shopify API...')
  const query = `{
    collectionByHandle(handle: "scooter") {
      products(first: 50) {
        edges {
          node {
            id
            handle
            title
            description
            priceRange {
              minVariantPrice { amount currencyCode }
            }
            variants(first: 10) {
              edges {
                node {
                  id
                  availableForSale
                }
              }
            }
            images(first: 3) {
              edges { node { url altText } }
            }
            supply: metafield(namespace: "custom", key: "supply") { value }
            batterylife: metafield(namespace: "custom", key: "batterylife") { value }
            speed: metafield(namespace: "custom", key: "speed") { value }
            motor: metafield(namespace: "custom", key: "motor") { value }
            video: metafield(namespace: "custom", key: "video") { value reference { ... on Video { sources { url mimeType } } } }
            scooterpng: metafield(namespace: "custom", key: "scooterpng") { reference { ... on MediaImage { image { url altText } } } }
            point1: metafield(namespace: "custom", key: "_1") { value }
            point2: metafield(namespace: "custom", key: "_2") { value }
            point3: metafield(namespace: "custom", key: "_3") { value }
          }
        }
      }
    }
  }`

  const { data } = await adminFetch(query)
  const edges = data.collectionByHandle?.products?.edges || []

  const scooters = edges.map(({ node }) => ({
    id: node.id,
    handle: node.handle,
    title: node.title,
    description: node.description,
    variantId: toLegacyId(node.variants?.edges?.find(({ node: v }) => v.availableForSale)?.node?.id || node.variants?.edges?.[0]?.node?.id || ''),
    price: {
      amount: parseFloat(node.priceRange.minVariantPrice.amount) / 100,
      currency: node.priceRange.minVariantPrice.currencyCode,
    },
    images: node.images.edges.map(({ node: img }) => ({
      url: img.url,
      alt: img.altText || '',
    })),
    specs: {
      supply: node.supply?.value || '',
      range: node.batterylife?.value || '',
      speed: node.speed?.value || '',
      motor: node.motor?.value || '',
    },
    scooterpng: node.scooterpng?.reference?.image?.url || '',
    video: node.video?.reference?.sources?.find(s => s.mimeType === 'video/mp4')?.url
           || node.video?.reference?.sources?.[0]?.url || '',
    sellingPoints: [
      node.point1?.value || '',
      node.point2?.value || '',
      node.point3?.value || '',
    ].filter(Boolean),
    buyUrl: `https://joyorprime.com/products/${node.handle}`,
  }))

  const translations = await getProductTranslations(scooters.map((item) => item.id))
  cachedScooters = scooters.map((item) => {
    const translated = localizeProduct(item, translations.get(item.id) || [])
    const resourceTranslations = translations.get(item.id) || []
    return {
      ...translated,
      sellingPoints: [
        getTranslationValue(resourceTranslations, 'metafields.custom._1'),
        getTranslationValue(resourceTranslations, 'metafields.custom._2'),
        getTranslationValue(resourceTranslations, 'metafields.custom._3'),
      ].filter(Boolean).length > 0
        ? [
            getTranslationValue(resourceTranslations, 'metafields.custom._1'),
            getTranslationValue(resourceTranslations, 'metafields.custom._2'),
            getTranslationValue(resourceTranslations, 'metafields.custom._3'),
          ].filter(Boolean)
        : item.sellingPoints,
    }
  })

  writeCache(getCacheKey('scooters'), cachedScooters)
  return cachedScooters
}

/**
 * 获取所有产品分类（去重）
 */
export async function getCategories(products) {
  const categories = [...new Set(products.map(p => p.category).filter(Boolean))]
  return categories.sort()
}

/**
 * 获取所有适配车型（去重）
 */
export async function getModels(products) {
  const models = [...new Set(products.flatMap(p => p.compatible).filter(Boolean))]
  return models.sort()
}
