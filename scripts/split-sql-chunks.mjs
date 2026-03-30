import { readFileSync, writeFileSync } from 'node:fs'

const source = 'criar_projeto_monolitico.sql'
const content = readFileSync(source, 'utf8')
const marker = '-- =====================================================================\n-- '

const pieces = content.split(marker).map((piece, idx) => (idx === 0 ? piece : marker + piece))
pieces.shift()

let chunk = ''
let size = 0
const chunks = []

for (const piece of pieces) {
  if (size + piece.length > 80000 && chunk.trim()) {
    chunks.push(chunk)
    chunk = ''
    size = 0
  }
  chunk += piece
  size += piece.length
}
if (chunk.trim()) chunks.push(chunk)

chunks.forEach((body, i) => {
  const file = `tmp_sql_chunk_${String(i + 1).padStart(2, '0')}.sql`
  const finalContent = body
  writeFileSync(file, finalContent, 'utf8')
  console.log(`${file} ${Buffer.byteLength(finalContent)}`)
})
