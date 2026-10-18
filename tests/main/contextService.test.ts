import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { hashText, tokenizeQuery, wildcardToRegExp } from '@main/services/contextService'

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
