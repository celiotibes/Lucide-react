import { getDatabase } from '../db';
import { v4 as uuidv4 } from 'uuid';
import { adicionarAoSync } from '../sync/queue';
import * as FileSystem from 'expo-file-system';
import * as Crypto from 'expo-crypto';

export interface Media {
  id: string;
  item_vistoria_id: string;
  tipo: 'foto' | 'video' | 'audio';
  caminho_local: string;
  url_remota: string | null;
  hash_sha256: string | null;
  tamanho: number | null;
  largura: number | null;
  altura: number | null;
  duracao: number | null;
  exif_json: string | null;
  synced: boolean;
  synced_at: string | null;
  created_at: string;
}

export interface Anotacao {
  id: string;
  media_id: string;
  tipo: 'seta' | 'circulo' | 'retangulo' | 'texto';
  coordenadas_json: string;
  cor: string;
  texto: string | null;
  ordem: number | null;
  synced: boolean;
  created_at: string;
}

export async function criarMedia(
  item_vistoria_id: string,
  tipo: Media['tipo'],
  caminho_local: string,
  metadados?: {
    largura?: number;
    altura?: number;
    duracao?: number;
    exif?: any;
  }
): Promise<Media> {
  const db = await getDatabase();
  const id = uuidv4();
  const agora = new Date().toISOString();

  // Calculate file size and hash
  const fileInfo = await FileSystem.getInfoAsync(caminho_local);
  let hash_sha256: string | null = null;

  if (fileInfo.exists && fileInfo.size) {
    const fileContent = await FileSystem.readAsStringAsync(caminho_local, {
      encoding: FileSystem.EncodingType.Base64,
    });
    hash_sha256 = await Crypto.digestStringAsync(
      Crypto.CryptoDigestAlgorithm.SHA256,
      fileContent
    );
  }

  const media: Media = {
    id,
    item_vistoria_id,
    tipo,
    caminho_local,
    url_remota: null,
    hash_sha256,
    tamanho: fileInfo.size || null,
    largura: metadados?.largura || null,
    altura: metadados?.altura || null,
    duracao: metadados?.duracao || null,
    exif_json: metadados?.exif ? JSON.stringify(metadados.exif) : null,
    synced: false,
    synced_at: null,
    created_at: agora,
  };

  await db.runAsync(
    `INSERT INTO medias (
      id, item_vistoria_id, tipo, caminho_local, url_remota, hash_sha256,
      tamanho, largura, altura, duracao, exif_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      media.id,
      media.item_vistoria_id,
      media.tipo,
      media.caminho_local,
      media.url_remota,
      media.hash_sha256,
      media.tamanho,
      media.largura,
      media.altura,
      media.duracao,
      media.exif_json,
      media.created_at,
    ]
  );

  await adicionarAoSync('media', id, 'create', media);

  return media;
}

export async function obterMedias(item_vistoria_id: string): Promise<Media[]> {
  const db = await getDatabase();
  const result = await db.getAllAsync<Media>(
    `SELECT * FROM medias WHERE item_vistoria_id = ? ORDER BY created_at`,
    [item_vistoria_id]
  );
  return result || [];
}

export async function obterMedia(id: string): Promise<Media | null> {
  const db = await getDatabase();
  const result = await db.getFirstAsync<Media>(
    `SELECT * FROM medias WHERE id = ?`,
    [id]
  );
  return result || null;
}

export async function criarAnotacao(
  media_id: string,
  tipo: Anotacao['tipo'],
  coordenadas: any,
  cor: string = '#FF0000',
  texto?: string
): Promise<Anotacao> {
  const db = await getDatabase();
  const id = uuidv4();
  const agora = new Date().toISOString();

  const anotacao: Anotacao = {
    id,
    media_id,
    tipo,
    coordenadas_json: JSON.stringify(coordenadas),
    cor,
    texto: texto || null,
    ordem: null,
    synced: false,
    created_at: agora,
  };

  await db.runAsync(
    `INSERT INTO anotacoes_foto (
      id, media_id, tipo, coordenadas_json, cor, texto, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      anotacao.id,
      media_id,
      tipo,
      anotacao.coordenadas_json,
      cor,
      texto || null,
      agora,
    ]
  );

  await adicionarAoSync('anotacao', id, 'create', anotacao);

  return anotacao;
}

export async function obterAnotacoes(media_id: string): Promise<Anotacao[]> {
  const db = await getDatabase();
  const result = await db.getAllAsync<Anotacao>(
    `SELECT * FROM anotacoes_foto WHERE media_id = ? ORDER BY ordem`,
    [media_id]
  );
  return result || [];
}

export async function excluirMedia(id: string): Promise<void> {
  const db = await getDatabase();

  // Get media info to delete local file
  const media = await obterMedia(id);
  if (media && media.caminho_local) {
    try {
      await FileSystem.deleteAsync(media.caminho_local);
    } catch (erro) {
      console.error('Erro ao excluir arquivo local:', erro);
    }
  }

  // Delete from database
  await db.runAsync(`DELETE FROM medias WHERE id = ?`, [id]);

  await adicionarAoSync('media', id, 'delete', { id });
}
