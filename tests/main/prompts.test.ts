import { describe, expect, it } from 'vitest'
import type { AiSendRequest, AttachmentPayload, ContextSource } from '@shared/types'
import {
  buildChatMessages,
  buildSystemPrompt,
  estimateTokens,
  makeChatTitle,
  normalizeLanguage
} from '@main/services/prompts'

function makeSource(overrides: Partial<ContextSource> = {}): ContextSource {
  return {
    id: 'src-1',
    kind: 'search',
    label: 'src/index.ts',
    path: 'src/index.ts',
    startLine: 1,
    endLine: 10,
    content: 'const answer = 42',
    score: 1,
    mtimeMs: null,
    sha256: null,
    ...overrides
  }
}

function makeRequest(overrides: Partial<AiSendRequest> = {}): AiSendRequest {
  return {
    requestId: 'req-1',
    chatId: 'chat-1',
    text: 'How does this work?',
    mode: 'normal',
    model: 'deepseek-chat',
    thinkingEnabled: true,
    reasoningEffort: 'high',
    language: 'ru',
    requirementText: null,
    sources: [],
    attachments: [],
    ...overrides
  }
}

describe('buildSystemPrompt', () => {
  it('uses the Russian rules and the selected mode instruction', () => {
    const prompt = buildSystemPrompt('debug', 'ru')
    expect(prompt).toContain('Отвечай только на русском языке')
    expect(prompt).toContain('Режим «Помочь с ошибкой»')
    expect(prompt).toContain('гипотезы')
  })

  it('switches to English rules and instructions', () => {
    const prompt = buildSystemPrompt('defense', 'en')
    expect(prompt).toContain('Answer in English only')
    expect(prompt).toContain('Defense preparation')
    expect(prompt).not.toContain('Отвечай только')
  })

  it('normalizes unknown or missing languages to Russian', () => {
    expect(normalizeLanguage('en')).toBe('en')
    expect(normalizeLanguage('ru')).toBe('ru')
    expect(normalizeLanguage('de' as never)).toBe('ru')
  })
})

describe('buildChatMessages', () => {
  it('orders system, requirements, context, history and the user message', () => {
    const messages = buildChatMessages({
      request: makeRequest({ requirementText: 'Build a todo app', sources: [makeSource()] }),
      history: [
        { role: 'user', content: 'First question' },
        { role: 'assistant', content: 'First answer' }
      ],
      maxHistoryMessages: 10
    })

    expect(messages.map((message) => message.role)).toEqual([
      'system',
      'system',
      'system',
      'user',
      'assistant',
      'user'
    ])
    expect(messages[1]?.content).toContain('ТРЕБОВАНИЯ ПРОЕКТА')
    expect(messages[1]?.content).toContain('Build a todo app')
    expect(messages[2]?.content).toContain('src/index.ts, строки 1-10')
    expect(messages[5]?.content).toBe('How does this work?')
  })

  it('keeps only the most recent history entries', () => {
    const messages = buildChatMessages({
      request: makeRequest(),
      history: [
        { role: 'user', content: 'one' },
        { role: 'assistant', content: 'two' },
        { role: 'user', content: 'three' }
      ],
      maxHistoryMessages: 2
    })

    expect(messages.some((message) => message.content === 'one')).toBe(false)
    expect(messages.some((message) => message.content === 'two')).toBe(true)
    expect(messages.some((message) => message.content === 'three')).toBe(true)
  })

  it('drops blank history entries and blank requirements', () => {
    const messages = buildChatMessages({
      request: makeRequest({ requirementText: '   ' }),
      history: [{ role: 'user', content: '  ' }],
      maxHistoryMessages: 10
    })

    expect(messages).toHaveLength(2)
    expect(messages[0]?.role).toBe('system')
    expect(messages[1]?.role).toBe('user')
  })

  it('inlines text attachments into the user message', () => {
    const attachment: AttachmentPayload = {
      kind: 'text',
      fileName: 'notes.txt',
      sizeBytes: 12,
      mimeType: 'text/plain',
      text: 'Important note',
      dataUrl: null
    }
    const messages = buildChatMessages({
      request: makeRequest({ attachments: [attachment] }),
      history: [],
      maxHistoryMessages: 10
    })

    const content = messages[messages.length - 1]?.content as string
    expect(content).toContain('How does this work?')
    expect(content).toContain('### notes.txt')
    expect(content).toContain('Important note')
  })

  it('sends images as multimodal content parts', () => {
    const image: AttachmentPayload = {
      kind: 'image',
      fileName: 'screen.png',
      sizeBytes: 1024,
      mimeType: 'image/png',
      text: null,
      dataUrl: 'data:image/png;base64,AAAA'
    }
    const messages = buildChatMessages({
      request: makeRequest({ attachments: [image] }),
      history: [],
      maxHistoryMessages: 10
    })

    const last = messages[messages.length - 1]
    expect(Array.isArray(last?.content)).toBe(true)
    const parts = last?.content as Array<{ type: string; image_url?: { url: string } }>
    expect(parts[0]?.type).toBe('text')
    expect(parts[1]?.image_url?.url).toBe('data:image/png;base64,AAAA')
  })
})

describe('text helpers', () => {
  it('estimates tokens from the character count', () => {
    expect(estimateTokens('')).toBe(0)
    expect(estimateTokens('a'.repeat(33))).toBe(10)
    expect(estimateTokens('a'.repeat(34))).toBe(11)
  })

  it('builds short single-line chat titles', () => {
    expect(makeChatTitle('  hello\n\nworld  ')).toBe('hello world')
    expect(makeChatTitle('   ')).toBe('Новый чат')
    const long = makeChatTitle('x'.repeat(100))
    expect(long).toHaveLength(60)
    expect(long.endsWith('...')).toBe(true)
  })
})
