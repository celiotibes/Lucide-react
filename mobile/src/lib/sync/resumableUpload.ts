import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface UploadSession {
  id: string;
  fileUri: string;
  fileName: string;
  fileSize: number;
  uploadedBytes: number;
  chunkSize: number;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  lastChunkIndex: number;
  createdAt: number;
  updatedAt: number;
  error?: string;
  serverUrl?: string;
}

const UPLOAD_SESSIONS_KEY = '@upload_sessions';
const CHUNK_SIZE = 1024 * 1024; // 1MB chunks
const MAX_CHUNK_SIZE = 10 * 1024 * 1024; // 10MB max

export class ResumableUploadManager {
  private sessions: Map<string, UploadSession> = new Map();

  async initialize() {
    // Load sessions from storage
    const stored = await AsyncStorage.getItem(UPLOAD_SESSIONS_KEY);
    if (stored) {
      try {
        const sessions = JSON.parse(stored) as UploadSession[];
        for (const session of sessions) {
          this.sessions.set(session.id, session);
        }
      } catch (err) {
        console.error('Failed to load upload sessions:', err);
      }
    }
  }

  async createUploadSession(
    fileUri: string,
    fileName: string,
    chunkSize: number = CHUNK_SIZE
  ): Promise<UploadSession> {
    // Validate file exists
    const fileInfo = await FileSystem.getInfoAsync(fileUri);
    if (!fileInfo.exists) {
      throw new Error('File does not exist');
    }

    const session: UploadSession = {
      id: `upload-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      fileUri,
      fileName,
      fileSize: fileInfo.size || 0,
      uploadedBytes: 0,
      chunkSize: Math.min(chunkSize, MAX_CHUNK_SIZE),
      status: 'pending',
      lastChunkIndex: -1,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    this.sessions.set(session.id, session);
    await this.persistSessions();

    return session;
  }

  async uploadFile(
    sessionId: string,
    serverUrl: string,
    authToken: string,
    onProgress?: (progress: { uploadedBytes: number; totalBytes: number }) => void
  ): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Upload session not found');
    }

    session.status = 'uploading';
    session.serverUrl = serverUrl;
    await this.persistSessions();

    try {
      const totalChunks = Math.ceil(session.fileSize / session.chunkSize);

      // Start from last uploaded chunk
      for (let chunkIndex = session.lastChunkIndex + 1; chunkIndex < totalChunks; chunkIndex++) {
        const startByte = chunkIndex * session.chunkSize;
        const endByte = Math.min(startByte + session.chunkSize, session.fileSize);

        const chunkUri = `${FileSystem.cacheDirectory}chunk-${sessionId}-${chunkIndex}`;
        await this.extractChunk(session.fileUri, chunkUri, startByte, endByte);

        await this.uploadChunk(
          serverUrl,
          authToken,
          chunkUri,
          chunkIndex,
          totalChunks,
          session.fileName,
          sessionId
        );

        session.uploadedBytes = endByte;
        session.lastChunkIndex = chunkIndex;
        await this.persistSessions();

        if (onProgress) {
          onProgress({
            uploadedBytes: session.uploadedBytes,
            totalBytes: session.fileSize,
          });
        }

        // Clean up chunk file
        try {
          await FileSystem.deleteAsync(chunkUri);
        } catch (err) {
          console.warn('Failed to delete chunk file:', err);
        }
      }

      session.status = 'completed';
      session.updatedAt = Date.now();
      await this.persistSessions();

      // Clean up original file if requested
      return session.id;
    } catch (error) {
      session.status = 'failed';
      session.error = error instanceof Error ? error.message : String(error);
      session.updatedAt = Date.now();
      await this.persistSessions();
      throw error;
    }
  }

  private async extractChunk(
    fileUri: string,
    outputUri: string,
    startByte: number,
    endByte: number
  ): Promise<void> {
    // Read file content (for mobile, we use base64)
    const base64Content = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Convert base64 to bytes and extract chunk
    const buffer = Buffer.from(base64Content, 'base64');
    const chunkBuffer = buffer.slice(startByte, endByte);

    // Write chunk to temp file
    const chunkBase64 = chunkBuffer.toString('base64');
    await FileSystem.writeAsStringAsync(outputUri, chunkBase64, {
      encoding: FileSystem.EncodingType.Base64,
    });
  }

  private async uploadChunk(
    serverUrl: string,
    authToken: string,
    chunkUri: string,
    chunkIndex: number,
    totalChunks: number,
    fileName: string,
    sessionId: string
  ): Promise<void> {
    const formData = new FormData();

    // Read chunk as binary
    const chunkBase64 = await FileSystem.readAsStringAsync(chunkUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    // Create blob-like object
    const chunkBlob = new Blob([Buffer.from(chunkBase64, 'base64')]);

    formData.append('chunk', chunkBlob, `${fileName}.${chunkIndex}`);
    formData.append('chunkIndex', String(chunkIndex));
    formData.append('totalChunks', String(totalChunks));
    formData.append('sessionId', sessionId);

    const response = await fetch(`${serverUrl}/upload-chunk`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`Failed to upload chunk ${chunkIndex}: ${response.statusText}`);
    }
  }

  async resumeUpload(
    sessionId: string,
    serverUrl: string,
    authToken: string,
    onProgress?: (progress: { uploadedBytes: number; totalBytes: number }) => void
  ): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Upload session not found');
    }

    if (session.status === 'completed') {
      return sessionId;
    }

    return this.uploadFile(sessionId, serverUrl, authToken, onProgress);
  }

  getSessionStatus(sessionId: string): UploadSession | null {
    return this.sessions.get(sessionId) || null;
  }

  async cancelUpload(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.status = 'failed';
      session.error = 'Cancelled by user';
      await this.persistSessions();
    }
  }

  async getAllSessions(): Promise<UploadSession[]> {
    return Array.from(this.sessions.values());
  }

  async getActiveSessions(): Promise<UploadSession[]> {
    return Array.from(this.sessions.values()).filter(
      (s) => s.status === 'pending' || s.status === 'uploading'
    );
  }

  private async persistSessions(): Promise<void> {
    try {
      const sessions = Array.from(this.sessions.values());
      await AsyncStorage.setItem(UPLOAD_SESSIONS_KEY, JSON.stringify(sessions));
    } catch (err) {
      console.error('Failed to persist upload sessions:', err);
    }
  }
}

export const resumableUploadManager = new ResumableUploadManager();
