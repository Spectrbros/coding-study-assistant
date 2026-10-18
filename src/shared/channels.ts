/**
 * Единственный источник правды для имён IPC-каналов.
 * Прелоадер и main-процесс используют эти константы, поэтому опечатка
 * в строке канала становится ошибкой компиляции.
 */
export const IPC = {
  systemInfo: 'system:info',
  systemOpenExternal: 'system:open-external',
  systemPickDirectory: 'system:pick-directory',
  systemPickFiles: 'system:pick-files',
  systemCopyText: 'system:copy-text',

  settingsGet: 'settings:get',
  settingsUpdate: 'settings:update',

  keyStatus: 'key:status',
  keyVerify: 'key:verify',
  keySave: 'key:save',

  modelsList: 'models:list',

  aiSend: 'ai:send',
  aiCancel: 'ai:cancel',
  aiEvent: 'ai:event',

  projectsList: 'projects:list',
  projectsCreate: 'projects:create',
  projectsUpdate: 'projects:update',
  projectsDelete: 'projects:delete',
  projectsEvents: 'projects:events',

  requirementsGet: 'requirements:get',
  requirementsSave: 'requirements:save',
  requirementsImport: 'requirements:import',

  chatsList: 'chats:list',
  chatsCreate: 'chats:create',
  chatsUpdate: 'chats:update',
  chatsDelete: 'chats:delete',

  messagesList: 'messages:list',
  messagesClear: 'messages:clear',

  contextBuild: 'context:build',
  contextRevalidate: 'context:revalidate',

  checklistList: 'checklist:list',
  checklistCreate: 'checklist:create',
  checklistUpdate: 'checklist:update',
  checklistDelete: 'checklist:delete',
  checklistLinkState: 'checklist:link-state',
  checklistSuggest: 'checklist:suggest',
  checklistEvaluate: 'checklist:evaluate',
  checklistApplySuggestion: 'checklist:apply-suggestion',

  attachmentsProcess: 'attachments:process',

  runsPropose: 'runs:propose',
  runsExecute: 'runs:execute',
  runsCancel: 'runs:cancel',
  runsEvent: 'runs:event'
} as const

export type IpcChannel = (typeof IPC)[keyof typeof IPC]
