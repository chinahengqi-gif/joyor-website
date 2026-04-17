/**
 * 购物车状态管理（localStorage 持久化）
 * 购物车数据仅用于本站展示，结账时跳转 joyorprime.com
 */

const CART_KEY = 'joyor_cart'

export function getCart() {
  if (typeof window === 'undefined') return []
  try {
    return JSON.parse(localStorage.getItem(CART_KEY) || '[]')
  } catch {
    return []
  }
}

export function saveCart(cart) {
  localStorage.setItem(CART_KEY, JSON.stringify(cart))
  window.dispatchEvent(new CustomEvent('cart:updated', { detail: cart }))
}

export function addToCart({ handle, title, price, image, quantity = 1 }) {
  const cart = getCart()
  const existing = cart.find(item => item.handle === handle)
  if (existing) {
    existing.quantity += quantity
  } else {
    cart.push({ handle, title, price, image, quantity })
  }
  saveCart(cart)
  return cart
}

export function updateQuantity(handle, quantity) {
  let cart = getCart()
  if (quantity <= 0) {
    cart = cart.filter(item => item.handle !== handle)
  } else {
    const item = cart.find(item => item.handle === handle)
    if (item) item.quantity = quantity
  }
  saveCart(cart)
  return cart
}

export function removeFromCart(handle) {
  return updateQuantity(handle, 0)
}

export function getCartTotal() {
  return getCart().reduce((sum, item) => sum + item.price * item.quantity, 0)
}

export function getCartCount() {
  return getCart().reduce((sum, item) => sum + item.quantity, 0)
}

export function clearCart() {
  saveCart([])
}

/**
 * 生成 Shopify 多商品结账 URL
 */
export function getCheckoutUrl() {
  const cart = getCart()
  if (cart.length === 0) return 'https://joyorprime.com/cart'
  // 跳转到商店购物车页面，用户在那里完成结账
  return 'https://joyorprime.com/cart'
}
