import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { ContextService, hashText, tokenizeQuery, wildcardToRegExp } from '@main/services/contextService'
import { FileService } from '@main/services/fileService'
import type { Project } from '@shared/types'

function makeProject(rootPath: string): Project {
  return {
    id: 'project-1',
    name: 'project',
    description: null,
    rootPath,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    folderExists: true
  }
}

describe('wildcardToRegExp', () => {
  it('matches simple wildcards against paths', () => {
    const pattern = wildcardToRegExp('*.ts')
    expect(pattern.test('index.ts')).toBe(true)
    expect(pattern.test('src/index.ts')).toBe(true)
    expect(pattern.test('index.js')).toBe(false)
  })

  it('supports wildcards in the middle of a pattern', () => {
    const pattern = wildcardToRegExp('src/*.test.*')
    expect(pattern.test('src/prompts.test.ts')).toBe(true)
    expect(pattern.test('src/prompts.spec.ts')).toBe(false)
    expect(pattern.test('lib/prompts.test.ts')).toBe(false)
  })

  it('escapes regular expression metacharacters and ignores case', () => {
    const pattern = wildcardToRegExp('node_modules')
    expect(pattern.test('node_modules')).toBe(true)
    expect(pattern.test('NODE_MODULES')).toBe(true)
    expect(pattern.test('nodeXmodules')).toBe(false)

    const withDots = wildcardToRegExp('a.txt')
    expect(withDots.test('a.txt')).toBe(true)
    expect(withDots.test('aXtxt')).toBe(false)
  })
})

describe('tokenizeQuery', () => {
  it('lowercases words and splits camelCase identifiers', () => {
    const tokens = tokenizeQuery('find UserRepository and getUserById')
    expect(tokens).toContain('userrepository')
    expect(tokens).toContain('user')
    expect(tokens).toContain('repository')
    expect(tokens).toContain('user')
    expect(tokens).toContain('getuserbyid')
  })

  it('splits snake_case and kebab-case words', () => {
    const tokens = tokenizeQuery('read_project-file_name')
    expect(tokens).toContain('read')
    expect(tokens).toContain('project')
    expect(tokens).toContain('file')
    expect(tokens).toContain('name')
  })

  it('keeps short words out and supports Cyrillic', () => {
    const tokens = tokenizeQuery('найди файл в проекте ab')
    expect(tokens).toContain('найди')
    expect(tokens).toContain('файл')
    expect(tokens).not.toContain('ab')
    expect(tokens).not.toContain('в')
  })

  it('deduplicates tokens and limits their count', () => {
    const tokens = tokenizeQuery('alpha alpha alpha beta')
    expect(tokens.filter((token) => token === 'alpha')).toHaveLength(1)
    expect(tokens.length).toBeLessThanOrEqual(40)

    const many = tokenizeQuery(
      Array.from({ length: 80 }, (_, index) => `token${String(index).padStart(3, '0')}`).join(' ')
    )
    expect(many).toHaveLength(40)
  })
})

describe('hashText', () => {
  it('returns a stable sha256 hex digest', () => {
    const expected = createHash('sha256').update('const value = 1', 'utf8').digest('hex')
    expect(hashText('const value = 1')).toBe(expected)
    expect(hashText('const value = 1')).toHaveLength(64)
  })

  it('produces different digests for different content', () => {
    expect(hashText('a')).not.toBe(hashText('b'))
  })
})

describe('ContextService.build', () => {
  const createFixture = (): { root: string; service: ContextService } => {
    const root = mkdtempSync(join(tmpdir(), 'spectr-context-'))
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'a.ts'), 'export const alpha = 1\n', 'utf8')
    writeFileSync(join(root, 'b.ts'), 'export const beta = 2\n', 'utf8')
    writeFileSync(join(root, 'src', 'z.ts'), 'export const gamma = 3\n', 'utf8')
    writeFileSync(join(root, 'excluded.ts'), 'export const alphaExcluded = 4\n', 'utf8')
    return { root, service: new ContextService({} as FileService) }
  }

  it('returns full contents of all project files sorted by path', async () => {
    const { root, service } = createFixture()
    try {
      const result = await service.build({
        project: makeProject(root),
        mode: 'all',
        query: '',
        excludePatterns: ['excluded.ts'],
        maxContextChars: 100_000,
        manualPaths: []
      })

      expect(result.candidates.map((candidate) => candidate.source.label)).toEqual(['a.ts', 'b.ts', 'src/z.ts'])
      expect(result.candidates.every((candidate) => candidate.source.kind === 'project')).toBe(true)
      expect(result.candidates[0]?.source.content).toBe('export const alpha = 1\n')
      expect(result.truncated).toBe(false)
      expect(result.notice).toBeNull()
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('keeps query-based search as an explicit mode', async () => {
    const { root, service } = createFixture()
    try {
      const result = await service.build({
        project: makeProject(root),
        mode: 'search',
        query: 'alpha',
        excludePatterns: ['excluded.ts'],
        maxContextChars: 100_000,
        manualPaths: []
      })

      expect(result.candidates.map((candidate) => candidate.source.label)).toEqual(['a.ts'])
      expect(result.candidates[0]?.source.kind).toBe('search')
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('marks the result as truncated when the context budget is exhausted', async () => {
    const { root, service } = createFixture()
    try {
      const result = await service.build({
        project: makeProject(root),
        mode: 'all',
        query: '',
        excludePatterns: ['excluded.ts'],
        maxContextChars: 25,
        manualPaths: []
      })

      expect(result.candidates).toHaveLength(1)
      expect(result.truncated).toBe(true)
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('normalizes CRLF sources so they revalidate without false changes', async () => {
    const { root } = createFixture()
    const files = {
      readText: async (_rootPath: string, path: string) => ({
        text: readFileSync(join(root, path), 'utf8')
      })
    } as unknown as FileService
    const service = new ContextService(files)
    writeFileSync(join(root, 'crlf.ts'), 'export const crlf = 1\r\nexport const value = 2\r\n', 'utf8')
    try {
      const project = makeProject(root)
      const result = await service.build({
        project,
        mode: 'all',
        query: '',
        excludePatterns: ['excluded.ts'],
        maxContextChars: 100_000,
        manualPaths: []
      })
      const source = result.candidates.find((candidate) => candidate.source.label === 'crlf.ts')?.source

      expect(source?.content).toBe('export const crlf = 1\nexport const value = 2\n')
      expect(await service.revalidate(project, source ? [source] : [])).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })

  it('normalizes manual paths and avoids duplicating a project file', async () => {
    const { root } = createFixture()
    const service = new ContextService(new FileService())
    writeFileSync(join(root, 'src', 'manual.ts'), 'export const manual = 1\r\nexport const value = 2\r\n', 'utf8')
    try {
      const project = makeProject(root)
      const result = await service.build({
        project,
        mode: 'all',
        query: '',
        excludePatterns: ['excluded.ts'],
        maxContextChars: 100_000,
        manualPaths: ['./src//manual.ts', 'src/manual.ts']
      })
      const manualSources = result.candidates.filter((candidate) => candidate.source.path === 'src/manual.ts')

      expect(manualSources).toHaveLength(1)
      expect(manualSources[0]?.source.kind).toBe('manual')
      expect(manualSources[0]?.source.content).toBe('export const manual = 1\nexport const value = 2\n')
      expect(result.notice).toBeNull()
      expect(await service.revalidate(project, manualSources.map((candidate) => candidate.source))).toEqual([])
    } finally {
      rmSync(root, { recursive: true, force: true })
    }
  })
})
