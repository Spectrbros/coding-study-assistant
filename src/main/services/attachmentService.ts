import { readFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { dialog, type BrowserWindow, type OpenDialogOptions } from 'electron'
import type { AttachmentResult } from '@shared/types'
import {
  IMAGE_EXTENSIONS,
  TEXT_EXTENSIONS,
  attachmentExtension,
  attachmentFailure,
  attachmentName,
  decodeAttachmentText,
  extractDocxText,
  extractPdfText,
  imageDataUrl,
  looksLikeImage,
  unsupportedError
} from './attachmentExtract'

function validationError(message: string): Error & { code: string } {
  return Object.assign(new Error(message), { code: 'validation' })
}

/**
 * Обрабатывает вложения, выбранные пользователем через системный диалог.
 * Renderer не передаёт произвольные пути: диалог открывается в main-процессе.
 */
export class AttachmentService {
  async processFile(absolutePath: string, maxBytes: number): Promise<AttachmentResult> {
    const fileName = attachmentName(absolutePath)
    const extension = attachmentExtension(absolutePath)
    let sizeBytes = 0

    try {
      const buffer = await readFile(absolutePath)
      sizeBytes = buffer.length
      if (sizeBytes === 0) {
        return attachmentFailure(fileName, sizeBytes, validationError('Файл пустой'))
      }
      if (sizeBytes > maxBytes) {
        return attachmentFailure(
          fileName,
          sizeBytes,
          validationError(`Файл больше лимита ${Math.round(maxBytes / 1024)} КБ`)
        )
      }

      if (IMAGE_EXTENSIONS.has(extension)) {
        if (!looksLikeImage(buffer)) {
          return attachmentFailure(fileName, sizeBytes, validationError('Файл не является изображением'))
        }
        return {
          id: randomUUID(),
          fileName,
          sizeBytes,
          kind: 'image',
          text: null,
          dataUrl: imageDataUrl(buffer, extension),
          note: 'Изображение отправляется только моделям с поддержкой изображений.',
          error: null
        }
      }

      if (extension === '.pdf') {
        const extracted = await extractPdfText(buffer)
        if (extracted.text.trim().length === 0) {
          return attachmentFailure(
            fileName,
            sizeBytes,
            validationError('В PDF не найден текстовый слой (возможно, это скан)')
          )
        }
        return {
          id: randomUUID(),
          fileName,
          sizeBytes,
          kind: 'pdf',
          text: extracted.text,
          dataUrl: null,
          note: extracted.note,
          error: null
        }
      }

      if (extension === '.docx') {
        const text = await extractDocxText(buffer)
        if (text.trim().length === 0) {
          return attachmentFailure(fileName, sizeBytes, validationError('Документ не содержит текста'))
        }
        return {
          id: randomUUID(),
          fileName,
          sizeBytes,
          kind: 'docx',
          text,
          dataUrl: null,
          note: null,
          error: null
        }
      }

      if (TEXT_EXTENSIONS.has(extension) || extension === '') {
        const decoded = decodeAttachmentText(buffer)
        return {
          id: randomUUID(),
          fileName,
          sizeBytes,
          kind: 'text',
          text: decoded.text.slice(0, 200_000),
          dataUrl: null,
          note: decoded.encoding === 'windows-1251' ? 'Файл прочитан в кодировке Windows-1251.' : null,
          error: null
        }
      }

      return attachmentFailure(fileName, sizeBytes, unsupportedError())
    } catch (error) {
      return attachmentFailure(fileName, sizeBytes, error)
    }
  }

  async pickAndProcess(parent: BrowserWindow | null, maxBytes: number): Promise<AttachmentResult[]> {
    const options: OpenDialogOptions = {
      title: 'Прикрепить файлы',
      properties: ['openFile', 'multiSelections', 'dontAddToRecent'],
      filters: [
        {
          name: 'Поддерживаемые файлы',
          extensions: ['txt', 'md', 'json', 'ts', 'tsx', 'js', 'py', 'pdf', 'docx', 'png', 'jpg', 'jpeg', 'webp', 'gif']
        },
        { name: 'Все файлы', extensions: ['*'] }
      ]
    }
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) {
      return []
    }
    const processed: AttachmentResult[] = []
    for (const filePath of result.filePaths.slice(0, 10)) {
      processed.push(await this.processFile(filePath, maxBytes))
    }
    return processed
  }

  async pickRequirementDocument(parent: BrowserWindow | null): Promise<{ fileName: string; content: string } | null> {
    const options: OpenDialogOptions = {
      title: 'Импорт требований',
      properties: ['openFile', 'dontAddToRecent'],
      filters: [
        { name: 'Документы требований', extensions: ['md', 'txt', 'pdf', 'docx'] },
        { name: 'Все файлы', extensions: ['*'] }
      ]
    }
    const result = parent ? await dialog.showOpenDialog(parent, options) : await dialog.showOpenDialog(options)
    const filePath = result.filePaths[0]
    if (result.canceled || !filePath) {
      return null
    }
    const processed = await this.processFile(filePath, 32 * 1024 * 1024)
    if (processed.error || !processed.text) {
      throw Object.assign(new Error(processed.error?.message ?? 'Не удалось извлечь текст документа'), {
        code: processed.error?.code ?? 'file_error'
      })
    }
    return { fileName: processed.fileName, content: processed.text }
  }
}
