import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { Project } from '@shared/types'
import { planRunPrompts } from '@main/services/runPlanner'

const createdRoots: string[] = []

function createProject(files: Record<string, string> = {}): Project {
  const rootPath = mkdtempSync(join(tmpdir(), 'csa-planner-'))
  createdRoots.push(rootPath)
  for (const [relativePath, content] of Object.entries(files)) {
    const target = join(rootPath, relativePath)
    mkdirSync(dirname(target), { recursive: true })
    writeFileSync(target, content, 'utf8')
  }
  return {
    id: 'project-1',
    name: 'Planner project',
    description: null,
    rootPath,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    folderExists: true
  }
}

afterEach(() => {
  while (createdRoots.length > 0) {
    const root = createdRoots.pop()
    if (root) {
      rmSync(root, { recursive: true, force: true })
    }
  }
})

describe('planRunPrompts', () => {
  it('returns nothing for an empty folder', () => {
    expect(planRunPrompts(createProject())).toEqual([])
  })

  it('returns nothing when the project folder is missing', () => {
    const project = createProject()
    const missing = { ...project, rootPath: join(project.rootPath, 'missing') }
    expect(planRunPrompts(missing)).toEqual([])
  })

  it('only exposes the fixed npm scripts from package.json', () => {
    const project = createProject({
      'package.json': JSON.stringify({
        scripts: { test: 'vitest', build: 'vite build', lint: 'eslint .', start: 'node index.js' }
      })
    })
    const prompts = planRunPrompts(project)
    const commands = prompts.map((prompt) => prompt.displayCommand)

    expect(commands).toEqual(['npm run test', 'npm run build', 'npm run lint'])
    expect(prompts.every((prompt) => prompt.command === 'npm')).toBe(true)
    expect(prompts[0]?.args).toEqual(['run', 'test'])
    expect(prompts.every((prompt) => prompt.projectId === project.id)).toBe(true)
    expect(prompts.every((prompt) => prompt.isolationNote.length > 0)).toBe(true)
  })

  it('ignores a malformed package.json', () => {
    const project = createProject({ 'package.json': '{ not json' })
    expect(planRunPrompts(project)).toEqual([])
  })

  it('uses compileall for Python projects without tests', () => {
    const project = createProject({ 'main.py': 'print("hello")\n' })
    const prompts = planRunPrompts(project)
    expect(prompts).toHaveLength(1)
    expect(prompts[0]?.command).toBe('python')
    expect(prompts[0]?.args).toEqual(['-m', 'compileall', '-q', '.'])
  })

  it('uses pytest when Python tests are present', () => {
    const project = createProject({
      'pyproject.toml': '[project]\nname = "demo"\n',
      'test_main.py': 'def test_ok():\n    assert True\n'
    })
    const prompts = planRunPrompts(project)
    expect(prompts.map((prompt) => prompt.command)).toEqual(['python'])
    expect(prompts[0]?.args).toEqual(['-m', 'pytest', '-q'])
  })

  it('detects Maven, Gradle, .NET and CMake projects', () => {
    const project = createProject({
      'pom.xml': '<project />',
      'build.gradle': 'plugins {}',
      'app.csproj': '<Project />',
      'CMakeLists.txt': 'project(demo)',
      'build/.keep': ''
    })
    const commands = planRunPrompts(project).map((prompt) => prompt.command)
    expect(commands).toContain('mvn')
    expect(commands).toContain('gradle')
    expect(commands).toContain('dotnet')
    expect(commands).toContain('cmake')
  })

  it('requires an existing build folder for CMake', () => {
    const project = createProject({ 'CMakeLists.txt': 'project(demo)' })
    expect(planRunPrompts(project)).toEqual([])
  })
})
