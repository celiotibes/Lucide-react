/**
 * Revision Manager Service
 * Git-like version control for legal documents
 */

import type { DocumentRevision, ChangeLog, RevisionCompare } from '../types/editor'

const generateId = () => crypto.randomUUID()

export class RevisionManager {
  /**
   * Criar nova revisão automaticamente
   */
  createRevision(
    documentId: string,
    content: string,
    changeType: 'content' | 'analysis' | 'ementa' | 'attachment' | 'formatting',
    changeSummary: string,
    previousRevision?: DocumentRevision
  ): DocumentRevision {
    // 1. Gerar nova versão
    let newVersion = '1.0'
    if (previousRevision) {
      const [major, minor] = previousRevision.version.split('.').map(Number)
      newVersion = `${major}.${minor + 1}`
    }

    // 2. Calcular diff
    const diff = this.calculateDiff(previousRevision?.content || '', content)

    // 3. Criar changelog
    const changelog: ChangeLog[] = [
      {
        timestamp: new Date(),
        type: changeType,
        description: changeSummary,
        linesAdded: diff.added.split('\n').length,
        linesRemoved: diff.removed.split('\n').length,
      },
    ]

    // 4. Criar revisão
    const revision: DocumentRevision = {
      id: generateId(),
      documentId,
      version: newVersion,
      versionNumber: parseInt(newVersion.split('.')[0]),
      minorVersion: parseInt(newVersion.split('.')[1]),
      content,
      title: `Revisão ${newVersion}`,
      changelog,
      changeSummary,
      author: 'Usuario',
      createdAt: new Date(),
      status: 'draft',
      previousRevisionId: previousRevision?.id,
      diffWithPrevious: {
        fromVersion: previousRevision?.version || '0.0',
        toVersion: newVersion,
        added: diff.added,
        removed: diff.removed,
        modified: diff.modified,
        summary: changeSummary,
      },
    }

    return revision
  }

  /**
   * Reverter para versão anterior
   */
  revertToRevision(documentId: string, targetRevision: DocumentRevision): DocumentRevision {
    const newRevision = this.createRevision(
      documentId,
      targetRevision.content,
      'content',
      `Reverted to version ${targetRevision.version}`,
      undefined
    )

    newRevision.tags = [...(newRevision.tags || []), 'reverted']
    return newRevision
  }

  /**
   * Comparar duas revisões
   */
  compareRevisions(revision1: DocumentRevision, revision2: DocumentRevision): RevisionCompare {
    const diff = this.calculateDiff(revision1.content, revision2.content)

    return {
      revision1,
      revision2,
      additions: diff.added.split('\n').filter((l) => l.trim()),
      removals: diff.removed.split('\n').filter((l) => l.trim()),
      modifications: [],
    }
  }

  /**
   * Mesclar duas revisões
   */
  mergeRevisions(
    baseRevision: DocumentRevision,
    revisionToMerge: DocumentRevision,
    conflictResolution: 'keep_base' | 'take_new' | 'manual',
    documentId: string
  ): DocumentRevision {
    let mergedContent = baseRevision.content

    if (conflictResolution === 'take_new') {
      mergedContent = revisionToMerge.content
    } else if (conflictResolution === 'manual') {
      mergedContent = this.detectAndMarkConflicts(baseRevision.content, revisionToMerge.content)
    }

    return this.createRevision(
      documentId,
      mergedContent,
      'content',
      `Merged ${revisionToMerge.version} into ${baseRevision.version}`,
      baseRevision
    )
  }

  /**
   * Calcular diff entre dois conteúdos
   */
  private calculateDiff(
    before: string,
    after: string
  ): { added: string; removed: string; modified: string } {
    const beforeLines = before.split('\n')
    const afterLines = after.split('\n')

    const added = afterLines.filter((line) => !beforeLines.includes(line)).join('\n')
    const removed = beforeLines.filter((line) => !afterLines.includes(line)).join('\n')

    return {
      added,
      removed,
      modified: '',
    }
  }

  /**
   * Detectar e marcar conflitos de merge
   */
  private detectAndMarkConflicts(base: string, merge: string): string {
    return `<<<<<<< BASE\n${base}\n=======\n${merge}\n>>>>>>> MERGE`
  }
}

export const revisionManager = new RevisionManager()
