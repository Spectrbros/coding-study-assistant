import type { AiSendRequest, AppLanguage, ContextSource, HelpMode } from '@shared/types'
import type { ChatMessagePayload } from './deepseekClient'

const MODE_INSTRUCTIONS: Record<HelpMode, { ru: string; en: string }> = {
  normal: {
    ru: 'Режим «Обычный помощник»: отвечай по существу, коротко и по делу, но не теряй важные детали. Если вопрос учебный — помогай понять, а не просто дать ответ.',
    en: 'Mode "General assistant": answer to the point, concise but complete. For study questions help the student understand rather than just handing over an answer.'
  },
  explain: {
    ru: 'Режим «Объяснить»: объясняй пошагово и простыми словами, вводи ключевые термины, показывай, как это работает, и в конце дай 2–3 вопроса для самопроверки.',
    en: 'Mode "Explain": explain step by step in plain language, introduce key terms, show how it works, and finish with 2-3 self-check questions.'
  },
  debug: {
    ru: 'Режим «Помочь с ошибкой»: сначала перечисли наиболее вероятные причины (гипотезы), затем для каждой — как проверить и как исправить. Не выдумывай код, которого нет во фрагментах. Явно помечай предположения.',
    en: 'Mode "Debug": list the most likely causes first, then how to verify and fix each one. Do not invent code that is not in the provided fragments. Clearly mark assumptions.'
  },
  implement: {
    ru: 'Режим «Помочь реализовать»: предложи план реализации, затем код и инструкции по интеграции. Учитывай требования проекта и ограничения стека. Предупреждай о рисках и о том, что нужно проверить.',
    en: 'Mode "Implement": propose an implementation plan, then the code and integration steps. Respect the project requirements and stack constraints. Warn about risks and what must be verified.'
  },
  defense: {
    ru: 'Режим «Подготовка к защите»: сформулируй вопросы преподавателя по теме (5–8), для каждого дай образцовый ответ и подсказку, что подчеркнуть. Отмечай слабые места решения.',
    en: 'Mode "Defense preparation": produce 5-8 examiner questions on the topic, a model answer for each, and what to emphasize. Point out weak spots of the solution.'
  }
}

const BASE_RULES = {
  ru: [
    'Ты — учебный ассистент по программированию внутри локального приложения. Пользователь изучает программирование и выполняет учебный проект.',
    'Отвечай только на русском языке.',
    'Не выдумывай содержимое файлов проекта: если фрагмент не передан в контексте, скажи об этом прямо и попроси нужный файл.',
    'Ссылайся на источники в виде `путь:строки`, если они переданы в контексте.',
    'Не предлагай команды, которые изменяют систему пользователя без предупреждения; явно перечисляй побочные эффекты.',
    'Соблюдай авторскую этику: не выполняй за пользователя всю учебную работу целиком, объясняй шаги и предлагай проверить их самостоятельно.',
    'Оформляй ответ в Markdown: короткие разделы, списки, блоки кода с указанием языка.'
  ].join(' '),
  en: [
    'You are a programming study assistant inside a local desktop app. The user is learning programming and working on a coursework project.',
    'Answer in English only.',
    'Never invent project files: if a fragment is not in the context, say so and ask for it.',
    'Reference sources as `path:lines` when they are provided.',
    'Do not propose commands that change the user system without warning; list side effects explicitly.',
    'Respect academic integrity: do not do the whole assignment for the user; explain steps and ask them to verify.',
    'Format answers in Markdown: short sections, lists, fenced code blocks with language.'
  ].join(' ')
}

export function normalizeLanguage(language: AppLanguage): 'ru' | 'en' {
  return language === 'en' ? 'en' : 'ru'
}

export function buildSystemPrompt(mode: HelpMode, language: AppLanguage): string {
  const lang = normalizeLanguage(language)
  return `${BASE_RULES[lang]}\n\n${MODE_INSTRUCTIONS[mode][lang]}`
}

function formatSource(source: ContextSource, language: AppLanguage): string {
  const headerParts: string[] = []
  if (source.path) {
    headerParts.push(language === 'en' ? `File: ${source.path}` : `Файл: ${source.path}`)
  } else {
    headerParts.push(language === 'en' ? `Attachment: ${source.label}` : `Вложение: ${source.label}`)
  }
  if (source.startLine !== null && source.endLine !== null) {
    const linesLabel = language === 'en' ? 'lines' : 'строки'
    headerParts.push(`${linesLabel} ${source.startLine}-${source.endLine}`)
  }
  const fence = '```'
  return `### ${headerParts.join(', ')}\n${fence}\n${source.content}\n${fence}`
}

export interface PromptBuildInput {
  request: AiSendRequest
  history: Array<{ role: 'user' | 'assistant'; content: string }>
  maxHistoryMessages: number
}

export function buildChatMessages(input: PromptBuildInput): ChatMessagePayload[] {
  const { request } = input
  const lang = normalizeLanguage(request.language)
  const messages: ChatMessagePayload[] = [{ role: 'system', content: buildSystemPrompt(request.mode, request.language) }]

  if (request.requirementText && request.requirementText.trim().length > 0) {
    const title = lang === 'en' ? 'PROJECT REQUIREMENTS' : 'ТРЕБОВАНИЯ ПРОЕКТА'
    messages.push({ role: 'system', content: `## ${title}\n${request.requirementText.trim()}` })
  }

  if (request.sources.length > 0) {
    const title = lang === 'en' ? 'PROJECT CONTEXT (read-only excerpts)' : 'КОНТЕКСТ ПРОЕКТА (фрагменты, только чтение)'
    const body = request.sources.map((source) => formatSource(source, request.language)).join('\n\n')
    messages.push({ role: 'system', content: `## ${title}\n${body}` })
  }

  for (const message of input.history.slice(-input.maxHistoryMessages)) {
    if (message.content.trim().length > 0) {
      messages.push({ role: message.role, content: message.content })
    }
  }

  const textParts: string[] = [request.text.trim()]
  for (const attachment of request.attachments) {
    if (attachment.text && attachment.text.trim().length > 0) {
      textParts.push(`### ${attachment.fileName}\n${'```'}\n${attachment.text.trim()}\n${'```'}`)
    }
  }

  const images = request.attachments.filter((attachment) => attachment.kind === 'image' && attachment.dataUrl)
  const userText = textParts.join('\n\n')

  if (images.length > 0) {
    messages.push({
      role: 'user',
      content: [
        { type: 'text', text: userText },
        ...images.map((image) => ({
          type: 'image_url' as const,
          image_url: { url: image.dataUrl as string }
        }))
      ]
    })
  } else {
    messages.push({ role: 'user', content: userText })
  }

  return messages
}

export function estimateTokens(text: string): number {
  // Грубая, но устойчивая оценка: ~3.3 символа на токен для смеси ru/en текста и кода.
  return Math.ceil(text.length / 3.3)
}

export function makeChatTitle(text: string): string {
  const singleLine = text.replace(/\s+/g, ' ').trim()
  if (singleLine.length === 0) {
    return 'Новый чат'
  }
  return singleLine.length > 60 ? `${singleLine.slice(0, 57)}...` : singleLine
}
