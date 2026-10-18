import { basename, extname } from 'node:path'
import { randomUUID } from 'node:crypto'
import { toErrorPayload } from '@shared/errors'
import type { AttachmentResult } from '@shared/types'
import { decodeTextBuffer } from './fileService'

export const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])
export const TEXT_EXTENSIONS = new Set([
  '.txt', '.md', '.markdown', '.json', '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.py', '.java', '.cs', '.cpp',
  '.cc', '.c', '.h', '.hpp', '.html', '.css', '.scss', '.sql', '.yml', '.yaml', '.toml', '.ini', '.cfg', '.xml',
  '.kt', '.swift', '.go', '.rs', '.rb', '.php', '.sh', '.ps1', '.bat', '.env', '.properties'
])

export const MAX_TEXT_CHARS = 200_000
const MAX_PDF_PAGES = 120

function mimeForImage(extension: string): string {
  switch (extension) {
    case '.png':
      return 'image/png'
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg'
    case '.webp':
      return 'image/webp'
    case '.gif':
      return 'image/gif'
    default:
      return 'application/octet-stream'
  }
}

export function looksLikeImage(buffer: Buffer): boolean {
  if (buffer.length < 12) {
    return false
  }
  if (buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
    return true
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) {
    return true
  }
  if (buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') {
    return true
  }
  return buffer.toString('ascii', 0, 3) === 'GIF'
}

export function imageDataUrl(buffer: Buffer, extension: string): string {
  return `data:${mimeForImage(extension)};base64,${buffer.toString('base64')}`
}

export async function extractPdfText(buffer: Buffer): Promise<{ text: string; note: string | null }> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')

  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: false,
    disableFontFace: true
  })
  const document = await loadingTask.promise

  try {
    const pagesToRead = Math.min(document.numPages, MAX_PDF_PAGES)
    const parts: string[] = []
    for (let pageNumber = 1; pageNumber <= pagesToRead; pageNumber += 1) {
      const page = await document.getPage(pageNumber)
      const content = await page.getTextContent()
      const pageText = content.items
        .map((item) => {
          const text = 'str' in item ? item.str : ''
          const hasEol = 'hasEOL' in item ? item.hasEOL : false
          return text + (hasEol ? '\n' : ' ')
        })
        .join('')
        .replace(/[ \t]+/g, ' ')
        .trim()
      parts.push(`--- Страница ${pageNumber} ---\n${pageText}`)
    }
    return {
      text: parts.join('\n\n').slice(0, MAX_TEXT_CHARS),
      note:
        document.numPages > MAX_PDF_PAGES
          ? `Извлечены первые ${MAX_PDF_PAGES} страниц из ${document.numPages}.`
          : null
    }
  } finally {
    await loadingTask.destroy()
  }
}

export async function extractDocxText(buffer: Buffer): Promise<string> {
  const mammoth = (await import('mammoth')) as unknown as {
    extractRawText: (input: { buffer: Buffer }) => Promise<{ value: string }>
  }
  const result = await mammoth.extractRawText({ buffer })
  return result.value.slice(0, MAX_TEXT_CHARS)
}

export function decodeAttachmentText(buffer: Buffer): { text: string; encoding: string } {
  return decodeTextBuffer(buffer)
}

export function attachmentFailure(fileName: string, sizeBytes: number, error: unknown): AttachmentResult {
  const payload = toErrorPayload(error)
  return {
    id: randomUUID(),
    fileName,
    sizeBytes,
    kind: 'unsupported',
    text: null,
    dataUrl: null,
    note: null,
    error: { code: payload.code, message: payload.message, status: payload.status, details: payload.details }
  }
}

export function attachmentName(path: string): string {
  return basename(path)
}

export function attachmentExtension(path: string): string {
  return extname(path).toLowerCase()
}

export function unsupportedError(): Error & { code: string } {
  return Object.assign(new Error('Формат файла не поддерживается'), { code: 'unsupported' })
}
