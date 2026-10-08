import { Database, Q } from '@nozbe/watermelondb';
import { Document } from '../models/Document';
import { logger } from '../../utils/logger';

export class DocumentRepository {
  constructor(private database: Database) {}

  async create(data: {
    serverId?: string;
    type: string;
    counterpartyName: string;
    filePath: string;
    fileSize: number;
  }): Promise<Document> {
    try {
      return await this.database.action(async () => {
        const documentsCollection = this.database.collections.get('documents');
        const newDocument = await documentsCollection.create((doc) => {
          doc.serverId = data.serverId || `local_${Date.now()}`;
          doc.type = data.type;
          doc.counterpartyName = data.counterpartyName;
          doc.filePath = data.filePath;
          doc.fileSize = data.fileSize;
          doc.status = 'pending';
          doc.confidence = 0;
          doc.extractedData = JSON.stringify({});
          doc.uploadedAt = 0;
          doc.syncPending = true;
        });
        logger.info(`Document created: ${newDocument.id}`);
        return newDocument;
      });
    } catch (error) {
      logger.error('Failed to create document', error);
      throw error;
    }
  }

  async update(
    documentId: string,
    data: Partial<{
      type: string;
      counterpartyName: string;
      status: string;
      confidence: number;
      extractedData: any;
    }>,
  ): Promise<Document> {
    try {
      return await this.database.action(async () => {
        const document = await this.getById(documentId);
        if (!document) {
          throw new Error(`Document not found: ${documentId}`);
        }

        await document.update((doc) => {
          if (data.type) doc.type = data.type;
          if (data.counterpartyName)
            doc.counterpartyName = data.counterpartyName;
          if (data.status) doc.status = data.status;
          if (data.confidence !== undefined) doc.confidence = data.confidence;
          if (data.extractedData)
            doc.extractedData = JSON.stringify(data.extractedData);
          doc.syncPending = true;
        });
        logger.info(`Document updated: ${documentId}`);
        return document;
      });
    } catch (error) {
      logger.error('Failed to update document', error);
      throw error;
    }
  }

  async getById(documentId: string): Promise<Document | null> {
    try {
      const documentsCollection = this.database.collections.get('documents');
      const document = await documentsCollection.find(documentId);
      return document || null;
    } catch (error) {
      if (error instanceof Error && error.message.includes('not found')) {
        return null;
      }
      logger.error('Failed to get document', error);
      throw error;
    }
  }

  async getByServerId(serverId: string): Promise<Document | null> {
    try {
      const documentsCollection = this.database.collections.get('documents');
      const results = await documentsCollection
        .query(Q.where('server_id', serverId))
        .fetch();
      return results[0] || null;
    } catch (error) {
      logger.error('Failed to get document by server ID', error);
      throw error;
    }
  }

  async getAll(): Promise<Document[]> {
    try {
      const documentsCollection = this.database.collections.get('documents');
      return await documentsCollection.query().fetch();
    } catch (error) {
      logger.error('Failed to fetch all documents', error);
      throw error;
    }
  }

  async getByType(type: string): Promise<Document[]> {
    try {
      const documentsCollection = this.database.collections.get('documents');
      return await documentsCollection
        .query(Q.where('type', Q.eq(type)))
        .fetch();
    } catch (error) {
      logger.error('Failed to fetch documents by type', error);
      throw error;
    }
  }

  async getPending(): Promise<Document[]> {
    try {
      const documentsCollection = this.database.collections.get('documents');
      return await documentsCollection
        .query(
          Q.where('status', Q.oneOf(['pending', 'processing'])),
        )
        .fetch();
    } catch (error) {
      logger.error('Failed to fetch pending documents', error);
      throw error;
    }
  }

  async getSyncPending(): Promise<Document[]> {
    try {
      const documentsCollection = this.database.collections.get('documents');
      return await documentsCollection
        .query(Q.where('sync_pending', true))
        .fetch();
    } catch (error) {
      logger.error('Failed to fetch sync pending documents', error);
      throw error;
    }
  }

  async delete(documentId: string): Promise<void> {
    try {
      return await this.database.action(async () => {
        const document = await this.getById(documentId);
        if (document) {
          await document.destroyPermanently();
          logger.info(`Document deleted: ${documentId}`);
        }
      });
    } catch (error) {
      logger.error('Failed to delete document', error);
      throw error;
    }
  }

  async markSynced(documentId: string): Promise<void> {
    try {
      return await this.database.action(async () => {
        const document = await this.getById(documentId);
        if (document) {
          await document.update((doc) => {
            doc.syncPending = false;
            doc.syncedAt = Date.now();
          });
        }
      });
    } catch (error) {
      logger.error('Failed to mark document as synced', error);
      throw error;
    }
  }
}
