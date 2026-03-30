/**
 * Gera ícones PNG para o PWA (192x192 e 512x512).
 * Rode: node scripts/generate-pwa-icons.js
 * Requer: npm install sharp --save-dev
 */

const fs = require('fs')
const path = require('path')

try {
  const sharp = require('sharp')
  const outDir = path.join(__dirname, '..', 'public', 'icons')
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true })

  const green = '#16a34a'
  const sizes = [192, 512]

  async function generate() {
    for (const size of sizes) {
      const svg = `
        <svg width="${size}" height="${size}" xmlns="http://www.w3.org/2000/svg">
          <rect width="${size}" height="${size}" fill="${green}" rx="${size >= 512 ? 64 : 24}"/>
          <text x="50%" y="50%" dominant-baseline="central" text-anchor="middle" fill="white" font-size="${size * 0.45}" font-weight="700" font-family="system-ui,sans-serif">E</text>
        </svg>
      `
      await sharp(Buffer.from(svg))
        .png()
        .toFile(path.join(outDir, `icon-${size}.png`))
      console.log(`Gerado: public/icons/icon-${size}.png`)
    }
  }

  generate().catch((err) => {
    console.error('Erro. Instale sharp: npm install sharp --save-dev')
    console.error(err)
    process.exit(1)
  })
} catch (e) {
  console.error('Instale sharp: npm install sharp --save-dev')
  process.exit(1)
}
