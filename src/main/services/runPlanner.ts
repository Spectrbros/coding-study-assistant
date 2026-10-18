import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import type { RunPrompt, Project } from '@shared/types'

const ISOLATION_NOTE =
  'Проверка выполняется в копии проекта во временной папке приложения. Это изоляция по копии, а не полноценная песочница: команда имеет доступ к вашей учётной записи и сети.'
const EFFECTS_NOTE = 'Команда может создать файлы внутри копии проекта. Оригинальная папка не изменяется приложением.'

interface PackageJson {
  scripts?: Record<string, string>
}

function readPackageJson(rootPath: string): PackageJson | null {
  const filePath = join(rootPath, 'package.json')
  if (!existsSync(filePath)) {
    return null
  }
  try {
    return JSON.parse(readFileSync(filePath, 'utf8')) as PackageJson
  } catch {
    return null
  }
}

function hasFileWithPrefix(rootPath: string, prefix: string): boolean {
  try {
    return readdirSync(rootPath).some((name) => name.startsWith(prefix) && name.endsWith('.py'))
  } catch {
    return false
  }
}

function hasAny(rootPath: string, names: string[]): boolean {
  return names.some((name) => existsSync(join(rootPath, name)))
}

function makePrompt(
  projectId: string,
  command: string,
  args: string[],
  purpose: string
): RunPrompt {
  return {
    id: randomUUID(),
    projectId,
    command,
    args,
    displayCommand: [command, ...args].join(' '),
    purpose,
    workingDirectoryNote: 'Рабочая папка — копия проекта внутри временного каталога приложения.',
    isolationNote: ISOLATION_NOTE,
    effectsNote: EFFECTS_NOTE
  }
}

/**
 * Формирует список безопасных проверочных команд на основе содержимого проекта.
 * Список фиксирован: renderer не может добавить произвольную команду.
 */
export function planRunPrompts(project: Project): RunPrompt[] {
  const rootPath = project.rootPath
  if (!existsSync(rootPath) || !statSync(rootPath).isDirectory()) {
    return []
  }

  const prompts: RunPrompt[] = []
  let rootEntries: string[] = []
  try {
    rootEntries = readdirSync(rootPath)
  } catch {
    return []
  }
  const pkg = readPackageJson(rootPath)
  const scripts = pkg?.scripts ?? {}

  if (typeof scripts['test'] === 'string') {
    prompts.push(makePrompt(project.id, 'npm', ['run', 'test'], 'Запуск тестов проекта (npm run test).'))
  }
  if (typeof scripts['build'] === 'string') {
    prompts.push(makePrompt(project.id, 'npm', ['run', 'build'], 'Сборка проекта (npm run build).'))
  }
  if (typeof scripts['lint'] === 'string') {
    prompts.push(makePrompt(project.id, 'npm', ['run', 'lint'], 'Проверка стиля кода (npm run lint).'))
  }

  const isPython = hasAny(rootPath, ['requirements.txt', 'pyproject.toml', 'setup.py', 'Pipfile']) || rootEntries.some((name) => name.endsWith('.py'))
  if (isPython) {
    const hasTests = hasAny(rootPath, ['tests', 'test', 'pytest.ini', 'conftest.py']) || hasFileWithPrefix(rootPath, 'test_')
    prompts.push(
      hasTests
        ? makePrompt(project.id, 'python', ['-m', 'pytest', '-q'], 'Запуск тестов Python (pytest).')
        : makePrompt(project.id, 'python', ['-m', 'compileall', '-q', '.'], 'Проверка синтаксиса Python файлов.')
    )
  }

  if (existsSync(join(rootPath, 'pom.xml'))) {
    prompts.push(makePrompt(project.id, 'mvn', ['-B', '-q', 'test'], 'Запуск тестов Maven.'))
  }
  if (hasAny(rootPath, ['build.gradle', 'build.gradle.kts'])) {
    const wrapper = process.platform === 'win32' ? 'gradlew.bat' : './gradlew'
    prompts.push(
      existsSync(join(rootPath, 'gradlew.bat')) || existsSync(join(rootPath, 'gradlew'))
        ? makePrompt(project.id, wrapper, ['test'], 'Запуск тестов Gradle через wrapper.')
        : makePrompt(project.id, 'gradle', ['test'], 'Запуск тестов Gradle.')
    )
  }
  if (hasAny(rootPath, ['global.json']) || rootEntries.some((name) => name.endsWith('.sln') || name.endsWith('.csproj'))) {
    prompts.push(makePrompt(project.id, 'dotnet', ['build', '--nologo'], 'Сборка .NET проекта.'))
  }
  if (existsSync(join(rootPath, 'CMakeLists.txt')) && existsSync(join(rootPath, 'build'))) {
    prompts.push(makePrompt(project.id, 'cmake', ['--build', 'build'], 'Сборка CMake проекта в существующем каталоге build.'))
  }

  return prompts
}
