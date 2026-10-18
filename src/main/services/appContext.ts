import type { DatabaseSync } from 'node:sqlite'
import { join } from 'node:path'
import { SettingsRepository } from '../db/settingsRepository'
import { ProjectRepository } from '../db/projectRepository'
import { RequirementRepository } from '../db/requirementRepository'
import { ChatRepository } from '../db/chatRepository'
import { MessageRepository } from '../db/messageRepository'
import { ChecklistRepository } from '../db/checklistRepository'
import { FileService } from './fileService'

export class AppContext {
  readonly settings: SettingsRepository
  readonly projects: ProjectRepository
  readonly requirements: RequirementRepository
  readonly chats: ChatRepository
  readonly messages: MessageRepository
  readonly checklist: ChecklistRepository
  readonly files: FileService

  constructor(
    readonly db: DatabaseSync,
    readonly userDataPath: string
  ) {
    this.settings = new SettingsRepository(db)
    this.projects = new ProjectRepository(db)
    this.requirements = new RequirementRepository(db)
    this.chats = new ChatRepository(db)
    this.messages = new MessageRepository(db)
    this.checklist = new ChecklistRepository(db)
    this.files = new FileService()
  }

  get tempDirectory(): string {
    return join(this.userDataPath, 'tmp')
  }
}
