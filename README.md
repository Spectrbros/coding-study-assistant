# Coding Study Assistant

Локальный Windows-ассистент для учебных проектов по программированию на базе DeepSeek API.
Electron + React + TypeScript + SQLite. Приложение читает папку проекта только на чтение,
хранит историю и настройки локально, а в DeepSeek отправляет только те фрагменты,
которые пользователь явно подтвердил.

## Скачать

Готовые сборки для Windows x64 публикуются в разделе
[Releases](https://github.com/Spectrbros/coding-study-assistant/releases/latest):

- `Coding-Study-Assistant-<version>-x64.exe` — установщик NSIS;
- `Coding-Study-Assistant-<version>-portable.exe` — portable-версия без установки.

API-ключ DeepSeek в сборку не входит: его нужно указать в «Настройках» при первом запуске.

## Возможности

- Проекты с привязкой к локальной папке (без изменения исходников).
- Чаты с историей, режимами помощи: обычный, объяснить, ошибка, реализовать, защита.
- Поиск по контексту проекта, предпросмотр фрагментов, ручное добавление файлов,
  проверка актуальности (SHA-256) перед отправкой.
- Требования проекта и чек-лист: ручные пункты, предложение и оценка через ИИ.
- Безопасные проверочные команды (npm, pytest, Maven, Gradle, .NET, CMake),
  запускаемые в копии проекта во временной папке.
- Вложения: текст, PDF, DOCX, изображения (с учётом лимитов).
- Русский и английский интерфейс, тёмная и светлая тема.
- API-ключ DeepSeek хранится только в зашифрованном виде через `safeStorage` (DPAPI).

## Безопасность

- `contextIsolation: true`, `sandbox: true`, `nodeIntegration: false`.
- Renderer не имеет сетевого доступа: production CSP запрещает `connect-src`.
  Запросы к DeepSeek выполняются только в main-процессе.
- Все IPC-каналы типизированы и валидируются схемами Zod; ответы проверяются
  на принадлежность отправителю (sender guard).
- Пути к файлам проверяются на выход за пределы папки проекта; открыть через
  `system.openPath` можно только каталог данных приложения.
- Проверочные команды формируются только приложением из фиксированного списка,
  запускаются без административных прав в копии проекта.
- Изоляция запусков — **по копии**, а не полноценная песочница: команда имеет
  доступ к учётной записи и сети. Изменение исходников во время запуска
  обнаруживается по отпечатку и показывается в интерфейсе.

## Стек

- Electron 44, electron-vite 6, React 19, TypeScript 7.
- better-sqlite3 (WAL, миграции), Zod.
- react-markdown + highlight.js, lucide-react, CSS Modules.
- Vitest + Testing Library.

## Структура

```
src/main       main-процесс: окно, безопасность, IPC, SQLite, DeepSeek, запуски
src/preload    узкий типизированный мост window.api
src/renderer   React-интерфейс, состояние, i18n, стили
src/shared     общие типы, каналы IPC, схемы, ошибки
tests          unit-тесты сервисов и UI-примитивов
```

## Запуск для разработки

Требуется Node.js >= 22.12.0 и npm.

```powershell
npm install
npm run dev
```

Если Node/npm не установлены глобально, можно использовать портативный Node:

```powershell
$node = "$PWD\.tools\node-v24.22.0-win-x64"
$env:PATH = "$node;$env:PATH"
& "$node\npm.cmd" install
& "$node\npm.cmd" run dev
```

При первом запуске откройте «Настройки», вставьте API-ключ DeepSeek и сохраните его.
Ключ проверяется запросом списка моделей и шифруется средствами ОС.

## Скрипты

| Команда | Назначение |
| --- | --- |
| `npm run dev` | Запуск приложения в режиме разработки |
| `npm run typecheck` | Проверка типов main/preload и renderer |
| `npm test` | Unit-тесты Vitest |
| `npm run build` | Сборка main/preload/renderer в `out/` |
| `npm run package:dir` | Непакованная Windows-сборка в `release/win-unpacked` |
| `npm run package:win` | NSIS-установщик и portable `.exe` в `release/` |

Локальная проверка без глобального Node:

```powershell
$node = "$PWD\.tools\node-v24.22.0-win-x64\node.exe"
& $node .\node_modules\vitest\vitest.mjs run
& $node .\node_modules\typescript\bin\tsc -p tsconfig.node.json --noEmit
& $node .\node_modules\typescript\bin\tsc -p tsconfig.web.json --noEmit
```

## Сборка Windows-релиза

```powershell
npm run package:win
```

Результат: `release/Coding-Study-Assistant-<version>-x64.exe` (установщик NSIS)
и `release/Coding-Study-Assistant-<version>-portable.exe` (portable). Нативные
модули (`better-sqlite3`) распаковываются из asar автоматически.

## Публикация релиза

Релизы собираются автоматически: workflow `.github/workflows/release.yml`
запускается на push тега `v*` в GitHub Actions (windows-latest), прогоняет
typecheck и тесты, затем публикует сборки в GitHub Releases через
`electron-builder --publish always`.

```powershell
npm version patch        # или minor / major — обновит version, коммит и тег
git push --follow-tags   # запушит коммит и тег, стартует сборка релиза
```

Версию в теге и `package.json` нужно держать одинаковой: `npm version`
делает это автоматически.

## Данные приложения

База SQLite, настройки и временные копии проектов находятся в
`app.getPath('userData')` (обычно `%APPDATA%\Coding Study Assistant`).
Каталог можно открыть из окна «Настройки» → «Открыть папку данных».
Удаление проекта в приложении не удаляет исходную папку с кодом.

## Ограничения

- Для ответов ИИ нужен действующий ключ DeepSeek и доступ к сети.
- Приложение не является песочницей и не гарантирует безопасность
  произвольных команд проекта — запускайте проверки осознанно.
- Поддерживается Windows x64; другие платформы не тестировались.
