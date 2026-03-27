import dns from 'node:dns'
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first')
}

const SHOP = import.meta.env.SHOPIFY_STORE_DOMAIN || '27a117-f1.myshopify.com'
const SHOP_NAME = SHOP.replace('.myshopify.com', '')
const CLIENT_ID = import.meta.env.SHOPIFY_CLIENT_ID
const CLIENT_SECRET = import.meta.env.SHOPIFY_CLIENT_SECRET
const COLLECTION_HANDLE = import.meta.env.SHOPIFY_COLLECTION || 'joyor-e-scooter-parts'

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

// 构建期间缓存产品数据，避免每个页面重复拉取
let cachedProducts = null

/**
 * 拉取指定 collection 的全部产品（自动翻页，构建期间自动缓存）
 * 包含 productType、compatible 元字段、parts_cla 元字段
 */
export async function getCollectionProducts() {
  if (cachedProducts) return cachedProducts

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
              productType
              tags
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
              images(first: 5) {
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

  cachedProducts = products
  return products
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
    productType: node.productType || '',
    category: node.partsCla?.value || node.productType || '',
    compatible,
    tags: node.tags,
    price: {
      amount: parseFloat(node.priceRange.minVariantPrice.amount) / 100,
      currency: node.priceRange.minVariantPrice.currencyCode,
    },
    images: node.images.edges.map(({ node: img }) => ({
      url: img.url,
      alt: img.altText || '',
    })),
    buyUrl: `https://joyorprime.com/products/${node.handle}`,
  }
}

// === Scooter Collection ===

let cachedScooters = null

/**
 * 拉取 scooter 系列全部产品（含规格元字段）
 */
export async function getScooters() {
  if (cachedScooters) return cachedScooters

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
            images(first: 3) {
              edges { node { url altText } }
            }
            supply: metafield(namespace: "custom", key: "supply") { value }
            batterylife: metafield(namespace: "custom", key: "batterylife") { value }
            speed: metafield(namespace: "custom", key: "speed") { value }
            motor: metafield(namespace: "custom", key: "motor") { value }
          }
        }
      }
    }
  }`

  const { data } = await adminFetch(query)
  const edges = data.collectionByHandle?.products?.edges || []

  cachedScooters = edges.map(({ node }) => ({
    id: node.id,
    handle: node.handle,
    title: node.title,
    description: node.description,
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
    buyUrl: `https://joyorprime.com/products/${node.handle}`,
  }))

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
