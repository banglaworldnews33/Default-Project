import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const pub = path.join(root, 'public')

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true })
}

function cardSvg({ title, tag, bg = '#f4efe6', accent = '#8b5e39', icon = 'tshirt' }) {
  const iconShapes = {
    tshirt: `<path d="M160 210 L200 170 L240 180 C240 200 260 200 260 180 L300 170 L340 210 L310 230 L290 220 L290 330 L210 330 L210 220 L190 230 Z" fill="${accent}" opacity="0.85"/>`,
    dress: `<path d="M220 170 L280 170 L310 230 L270 230 L320 330 L180 330 L230 230 L190 230 Z" fill="${accent}" opacity="0.85"/>`,
    baby: `<circle cx="250" cy="210" r="35" fill="${accent}" opacity="0.85"/><path d="M215 255 C215 240 285 240 285 255 L290 320 L210 320 Z" fill="${accent}" opacity="0.85"/><circle cx="235" cy="205" r="4" fill="#fff"/><circle cx="265" cy="205" r="4" fill="#fff"/>`,
    clothes: `<rect x="190" y="190" width="120" height="130" rx="12" fill="${accent}" opacity="0.85"/><path d="M230 190 L250 215 L270 190" stroke="#fff" stroke-width="4" fill="none"/>`,
    care: `<rect x="220" y="200" width="60" height="110" rx="10" fill="${accent}" opacity="0.85"/><rect x="235" y="180" width="30" height="20" rx="4" fill="${accent}" opacity="0.7"/><circle cx="250" cy="250" r="16" fill="#fff" opacity="0.9"/>`,
    hoodie: `<path d="M190 190 C190 170 310 170 310 190 L335 230 L310 240 L300 330 L200 330 L190 240 L165 230 Z" fill="${accent}" opacity="0.85"/><circle cx="250" cy="210" r="18" fill="#fff" opacity="0.3"/>`,
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 500 500" width="100%" height="100%">
  <defs>
    <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="${bg}"/>
      <stop offset="100%" stop-color="#ffffff"/>
    </linearGradient>
    <radialGradient id="glow" cx="50%" cy="40%" r="50%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.8"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="500" height="500" fill="url(#g)"/>
  <circle cx="250" cy="230" r="140" fill="url(#glow)"/>
  <g>
    ${iconShapes[icon] || iconShapes.tshirt}
  </g>
  <rect x="30" y="410" width="440" height="60" rx="10" fill="#ffffff" opacity="0.9"/>
  <text x="50" y="438" font-family="'Inter', -apple-system, sans-serif" font-size="16" font-weight="700" fill="#171717">${title}</text>
  <text x="50" y="458" font-family="'Inter', -apple-system, sans-serif" font-size="12" fill="#737373">${tag}</text>
</svg>`
}

ensureDir(path.join(pub, 'images/products'))
ensureDir(path.join(pub, 'images/categories'))

const categoriesList = [
  { slug: 'men', title: 'Men Collection', tag: 'Polos, tees, shirts & more', icon: 'tshirt', bg: '#f1f5f9', accent: '#334155' },
  { slug: 'women', title: 'Women Collection', tag: 'Three piece, kurti & party wear', icon: 'dress', bg: '#fdf2f8', accent: '#9d174d' },
  { slug: 'baby-moms', title: 'Baby & Moms', tag: 'Pure cotton wear & care sets', icon: 'baby', bg: '#fef3c7', accent: '#b45309' },
  { slug: 'clothes', title: 'Everyday Clothes', tag: 'Pants, hoodies & daily basics', icon: 'clothes', bg: '#ecfdf5', accent: '#047857' },
]

for (const c of categoriesList) {
  fs.writeFileSync(
    path.join(pub, `images/categories/${c.slug}.svg`),
    cardSvg({ title: c.title, tag: c.tag, bg: c.bg, accent: c.accent, icon: c.icon }),
  )
}

const productsList = [
  { slug: 'mens-premium-tshirt', title: "Men's Premium T-Shirt", tag: '180 GSM combed cotton', icon: 'tshirt', bg: '#f8fafc', accent: '#0f172a' },
  { slug: 'mens-casual-shirt', title: "Men's Casual Shirt", tag: 'Full-sleeve breathable cotton', icon: 'tshirt', bg: '#f0f9ff', accent: '#0369a1' },
  { slug: 'womens-three-piece', title: "Women's Three Piece", tag: 'Printed kameez & cotton dupatta', icon: 'dress', bg: '#fff1f2', accent: '#be123c' },
  { slug: 'womens-kurti', title: "Women's Kurti", tag: 'Straight cotton slub', icon: 'dress', bg: '#fdf4ff', accent: '#a21caf' },
  { slug: 'baby-cotton-dress', title: 'Baby Cotton Dress', tag: 'Gentle pure cotton A-line', icon: 'baby', bg: '#fefce8', accent: '#ca8a04' },
  { slug: 'baby-romper', title: 'Baby Romper', tag: 'Snap buttons for easy changing', icon: 'baby', bg: '#eff6ff', accent: '#1d4ed8' },
  { slug: 'mom-baby-care-set', title: 'Mom & Baby Care Set', tag: 'Gentle shampoo, oil & lotion', icon: 'care', bg: '#f0fdf4', accent: '#15803d' },
  { slug: 'mens-polo-shirt', title: "Men's Polo Shirt", tag: 'Classic pique knit', icon: 'tshirt', bg: '#f1f5f9', accent: '#334155' },
  { slug: 'womens-sharee-blouse', title: "Women's Sharee Blouse", tag: 'Ready-to-wear padded fit', icon: 'dress', bg: '#fff7ed', accent: '#c2410c' },
  { slug: 'kids-soft-jeans', title: 'Kids Soft Jeans', tag: 'Stretchy waistband denim', icon: 'clothes', bg: '#f8fafc', accent: '#1e293b' },
  { slug: 'unisex-hoodie', title: 'Unisex Hoodie', tag: 'Warm brushed fleece', icon: 'hoodie', bg: '#f5f5f4', accent: '#44403c' },
  { slug: 'womens-leggings', title: "Women's Leggings", tag: 'Four-way stretch comfort', icon: 'clothes', bg: '#faf5ff', accent: '#6b21a8' },
  { slug: 'placeholder-2', title: 'Nextgen Style', tag: 'Fabric detail & side profile', icon: 'tshirt', bg: '#f9fafb', accent: '#6b7280' },
  { slug: 'placeholder-3', title: 'Nextgen Style', tag: 'Back detail & texture', icon: 'clothes', bg: '#f9fafb', accent: '#6b7280' },
  { slug: 'placeholder-4', title: 'Nextgen Style', tag: 'Styling view', icon: 'dress', bg: '#f9fafb', accent: '#6b7280' },
  { slug: 'placeholder-5', title: 'Nextgen Style', tag: 'Close-up weave', icon: 'care', bg: '#f9fafb', accent: '#6b7280' },
]

for (const p of productsList) {
  fs.writeFileSync(
    path.join(pub, `images/products/${p.slug}.svg`),
    cardSvg({ title: p.title, tag: p.tag, bg: p.bg, accent: p.accent, icon: p.icon }),
  )
}

// Favicon
fs.writeFileSync(
  path.join(pub, 'favicon.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64">
  <rect width="64" height="64" rx="16" fill="#171717"/>
  <path d="M18 46 L18 18 L32 36 L46 18 L46 46" stroke="#c9a06c" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" fill="none"/>
</svg>`,
)

// OG image
fs.writeFileSync(
  path.join(pub, 'og-image.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 630" width="1200" height="630">
  <rect width="1200" height="630" fill="#171717"/>
  <rect x="60" y="60" width="1080" height="510" rx="24" fill="#262626" stroke="#333" stroke-width="2"/>
  <circle cx="1000" cy="200" r="220" fill="#c9a06c" opacity="0.15"/>
  <text x="120" y="240" font-family="'Playfair Display', Georgia, serif" font-size="72" font-weight="700" fill="#ffffff">NEXTGEN SHOP</text>
  <text x="120" y="320" font-family="'Inter', sans-serif" font-size="36" fill="#c9a06c">Style for Everyone</text>
  <text x="120" y="380" font-family="'Inter', sans-serif" font-size="22" fill="#a3a3a3">Premium fashion, baby & moms products. Cash on Delivery across Bangladesh.</text>
  <rect x="120" y="440" width="220" height="56" rx="10" fill="#c9a06c"/>
  <text x="160" y="476" font-family="'Inter', sans-serif" font-size="20" font-weight="600" fill="#171717">Shop Now →</text>
</svg>`,
)

console.log('Placeholders created.')
