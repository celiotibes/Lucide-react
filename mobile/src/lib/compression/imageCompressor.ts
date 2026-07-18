import * as ImageManipulator from 'expo-image-manipulator';
import * as FileSystem from 'expo-file-system';

export interface CompressionOptions {
  quality?: number;
  width?: number;
  height?: number;
}

const DEFAULT_OPTIONS: CompressionOptions = {
  quality: 0.7,
  width: 1920,
  height: 1920,
};

export async function getImageDimensions(
  uri: string
): Promise<{ width: number; height: number }> {
  try {
    const info = await ImageManipulator.ImageManipulator.manipulateAsync(uri, [], {
      compress: 1,
    });
    return {
      width: info.width,
      height: info.height,
    };
  } catch (error) {
    console.error('Failed to get image dimensions:', error);
    throw new Error('Falha ao obter dimensões da imagem');
  }
}

export async function compressImage(
  uri: string,
  options: CompressionOptions = {}
): Promise<{ uri: string; size: number }> {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  try {
    const { width, height } = await getImageDimensions(uri);

    // Calculate new dimensions maintaining aspect ratio
    let newWidth = width;
    let newHeight = height;

    if (width > opts.width! || height > opts.height!) {
      const ratio = Math.min(opts.width! / width, opts.height! / height);
      newWidth = Math.round(width * ratio);
      newHeight = Math.round(height * ratio);
    }

    const result = await ImageManipulator.ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: newWidth, height: newHeight } }],
      { compress: opts.quality, format: ImageManipulator.SaveFormat.JPEG }
    );

    // Get file size
    const fileInfo = await FileSystem.getInfoAsync(result.uri);
    const sizeInBytes = fileInfo.size || 0;

    return {
      uri: result.uri,
      size: sizeInBytes,
    };
  } catch (error) {
    console.error('Image compression failed:', error);
    throw new Error('Falha ao comprimir imagem');
  }
}

export function estimateCompressionRatio(quality: number): number {
  // Rough estimation: higher quality = larger file
  // Quality 0.7 typically achieves 35-45% of original size
  return 0.35 + quality * 0.2;
}

export async function getSizeInBytes(uri: string): Promise<number> {
  try {
    const fileInfo = await FileSystem.getInfoAsync(uri);
    return fileInfo.size || 0;
  } catch (error) {
    console.error('Failed to get file size:', error);
    return 0;
  }
}

export async function estimateTotalUploadSize(imageUris: string[]): Promise<number> {
  let totalSize = 0;
  for (const uri of imageUris) {
    const size = await getSizeInBytes(uri);
    totalSize += size;
  }
  return totalSize;
}
