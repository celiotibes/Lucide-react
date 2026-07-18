import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

interface ChunkMetadata {
  sessionId: string;
  chunkIndex: number;
  totalChunks: number;
  fileName: string;
}

const UPLOAD_DIR = path.join(process.cwd(), 'tmp', 'uploads');
const CHUNK_TIMEOUT = 24 * 60 * 60 * 1000; // 24 hours

async function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

function getSessionDir(sessionId: string): string {
  return path.join(UPLOAD_DIR, sessionId);
}

function getChunkPath(sessionId: string, chunkIndex: number): string {
  return path.join(getSessionDir(sessionId), `chunk-${chunkIndex}`);
}

async function saveChunk(sessionId: string, chunkIndex: number, buffer: Buffer): Promise<void> {
  const sessionDir = getSessionDir(sessionId);

  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  const chunkPath = getChunkPath(sessionId, chunkIndex);
  fs.writeFileSync(chunkPath, buffer);
}

async function assembleChunks(
  sessionId: string,
  totalChunks: number,
  outputPath: string
): Promise<void> {
  const writeStream = fs.createWriteStream(outputPath);

  for (let i = 0; i < totalChunks; i++) {
    const chunkPath = getChunkPath(sessionId, i);
    if (!fs.existsSync(chunkPath)) {
      throw new Error(`Chunk ${i} not found`);
    }

    const buffer = fs.readFileSync(chunkPath);
    writeStream.write(buffer);
  }

  return new Promise((resolve, reject) => {
    writeStream.end(() => {
      // Clean up chunks
      const sessionDir = getSessionDir(sessionId);
      try {
        fs.rmSync(sessionDir, { recursive: true });
      } catch (err) {
        console.warn('Failed to clean up session directory:', err);
      }
      resolve();
    });

    writeStream.on('error', reject);
  });
}

export async function POST(req: NextRequest) {
  try {
    await ensureUploadDir();

    const formData = await req.formData();
    const chunk = formData.get('chunk') as Blob;
    const chunkIndex = parseInt(formData.get('chunkIndex') as string);
    const totalChunks = parseInt(formData.get('totalChunks') as string);
    const sessionId = formData.get('sessionId') as string;
    const fileName = formData.get('fileName') as string;

    if (!chunk || isNaN(chunkIndex) || isNaN(totalChunks) || !sessionId || !fileName) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Convert blob to buffer
    const buffer = Buffer.from(await chunk.arrayBuffer());

    // Save chunk
    await saveChunk(sessionId, chunkIndex, buffer);

    // Check if all chunks are received
    const sessionDir = getSessionDir(sessionId);
    const files = fs.readdirSync(sessionDir);
    const receivedChunks = files.filter((f) => f.startsWith('chunk-')).length;

    if (receivedChunks === totalChunks) {
      // All chunks received, assemble file
      const mediaDir = path.join(UPLOAD_DIR, 'media');
      if (!fs.existsSync(mediaDir)) {
        fs.mkdirSync(mediaDir, { recursive: true });
      }

      const finalPath = path.join(mediaDir, `${sessionId}-${fileName}`);
      await assembleChunks(sessionId, totalChunks, finalPath);

      return NextResponse.json(
        {
          message: 'Upload completed',
          sessionId,
          filePath: finalPath,
        },
        { status: 200 }
      );
    }

    return NextResponse.json(
      {
        message: 'Chunk received',
        sessionId,
        chunkIndex,
        receivedChunks,
        totalChunks,
      },
      { status: 202 }
    );
  } catch (error) {
    console.error('Upload chunk error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Upload failed' },
      { status: 500 }
    );
  }
}
