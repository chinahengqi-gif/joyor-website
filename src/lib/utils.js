/**
 * 将文本转为 URL slug
 * 支持 ASCII 和非 ASCII 字符（如中文）
 */
export function slugify(text) {
  const slug = text
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return slug || encodeURIComponent(text.toLowerCase())
}
