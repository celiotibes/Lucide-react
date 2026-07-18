import { getDatabase } from '../db';
import { v4 as uuidv4 } from 'uuid';
import { adicionarAoSync } from '../sync/queue';

export interface Vistoria {
  id: string;
  tipo: 'entrada' | 'periodica' | 'saida' | 'conferencia';
  modo: 'presencial' | 'autovistoria';
  status: string;
  imovel_id: string;
  contrato_id: string;
  vistoria_base_id: string | null;
  data_agendada: string | null;
  data: string;
  realizada_por: string | null;
  synced: boolean;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Ambiente {
  id: string;
  vistoria_id: string;
  nome: string;
  ordem: number;
  synced: boolean;
  created_at: string;
}

export interface Item {
  id: string;
  ambiente_id: string;
  nome: string;
  tipo: string;
  ordem: number;
  obrigatorio: boolean;
  synced: boolean;
  created_at: string;
}

export interface ItemVistoria {
  id: string;
  vistoria_id: string;
  item_id: string;
  item_checklist_id: string | null;
  estado: 'novo' | 'bom' | 'regular' | 'danificado' | 'inexistente' | null;
  observacao: string | null;
  midia_json: string | null;
  transcricao_audio: string | null;
  audio_path: string | null;
  synced: boolean;
  synced_at: string | null;
  created_at: string;
  updated_at: string;
}

// Vistoria operations
export async function criarVistoria(dados: {
  tipo: Vistoria['tipo'];
  modo: Vistoria['modo'];
  imovel_id: string;
  contrato_id: string;
  vistoria_base_id?: string | null;
  data_agendada?: string | null;
}): Promise<Vistoria> {
  const db = await getDatabase();
  const id = uuidv4();
  const agora = new Date().toISOString();

  const vistoria: Vistoria = {
    id,
    tipo: dados.tipo,
    modo: dados.modo,
    status: 'em_andamento',
    imovel_id: dados.imovel_id,
    contrato_id: dados.contrato_id,
    vistoria_base_id: dados.vistoria_base_id || null,
    data_agendada: dados.data_agendada || null,
    data: agora,
    realizada_por: null,
    synced: false,
    synced_at: null,
    created_at: agora,
    updated_at: agora,
  };

  await db.runAsync(
    `INSERT INTO vistorias (
      id, tipo, modo, status, imovel_id, contrato_id, vistoria_base_id,
      data_agendada, data, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      vistoria.id,
      vistoria.tipo,
      vistoria.modo,
      vistoria.status,
      vistoria.imovel_id,
      vistoria.contrato_id,
      vistoria.vistoria_base_id,
      vistoria.data_agendada,
      vistoria.data,
      vistoria.created_at,
      vistoria.updated_at,
    ]
  );

  await adicionarAoSync('vistoria', id, 'create', vistoria);

  return vistoria;
}

export async function obterVistoria(id: string): Promise<Vistoria | null> {
  const db = await getDatabase();
  const result = await db.getFirstAsync<Vistoria>(
    `SELECT * FROM vistorias WHERE id = ?`,
    [id]
  );
  return result || null;
}

export async function obterVistorias(): Promise<Vistoria[]> {
  const db = await getDatabase();
  const result = await db.getAllAsync<Vistoria>(
    `SELECT * FROM vistorias ORDER BY data DESC`
  );
  return result || [];
}

export async function atualizarVistoria(id: string, dados: Partial<Vistoria>): Promise<void> {
  const db = await getDatabase();
  const agora = new Date().toISOString();

  const campos = Object.keys(dados)
    .filter((k) => k !== 'id' && k !== 'created_at')
    .map((k) => `${k} = ?`)
    .join(', ');

  const valores = Object.keys(dados)
    .filter((k) => k !== 'id' && k !== 'created_at')
    .map((k) => dados[k as keyof typeof dados]);

  await db.runAsync(
    `UPDATE vistorias SET ${campos}, updated_at = ? WHERE id = ?`,
    [...valores, agora, id]
  );

  await adicionarAoSync('vistoria', id, 'update', {
    ...dados,
    updated_at: agora,
  });
}

// Ambiente operations
export async function criarAmbiente(
  vistoria_id: string,
  nome: string,
  ordem: number
): Promise<Ambiente> {
  const db = await getDatabase();
  const id = uuidv4();
  const agora = new Date().toISOString();

  const ambiente: Ambiente = {
    id,
    vistoria_id,
    nome,
    ordem,
    synced: false,
    created_at: agora,
  };

  await db.runAsync(
    `INSERT INTO ambientes (id, vistoria_id, nome, ordem, created_at)
     VALUES (?, ?, ?, ?, ?)`,
    [id, vistoria_id, nome, ordem, agora]
  );

  return ambiente;
}

export async function obterAmbientes(vistoria_id: string): Promise<Ambiente[]> {
  const db = await getDatabase();
  const result = await db.getAllAsync<Ambiente>(
    `SELECT * FROM ambientes WHERE vistoria_id = ? ORDER BY ordem`,
    [vistoria_id]
  );
  return result || [];
}

// Item operations
export async function criarItem(
  ambiente_id: string,
  nome: string,
  tipo: string,
  ordem: number,
  obrigatorio: boolean = true
): Promise<Item> {
  const db = await getDatabase();
  const id = uuidv4();
  const agora = new Date().toISOString();

  const item: Item = {
    id,
    ambiente_id,
    nome,
    tipo,
    ordem,
    obrigatorio,
    synced: false,
    created_at: agora,
  };

  await db.runAsync(
    `INSERT INTO itens (id, ambiente_id, nome, tipo, ordem, obrigatorio, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [id, ambiente_id, nome, tipo, ordem, obrigatorio ? 1 : 0, agora]
  );

  return item;
}

export async function obterItens(ambiente_id: string): Promise<Item[]> {
  const db = await getDatabase();
  const result = await db.getAllAsync<Item>(
    `SELECT * FROM itens WHERE ambiente_id = ? ORDER BY ordem`,
    [ambiente_id]
  );
  return result || [];
}

// ItemVistoria operations
export async function criarOuAtualizarItemVistoria(
  vistoria_id: string,
  item_id: string,
  item_checklist_id: string | null,
  estado: ItemVistoria['estado'],
  observacao: string | null
): Promise<ItemVistoria> {
  const db = await getDatabase();
  const id = uuidv4();
  const agora = new Date().toISOString();

  // Check if exists
  const existe = await db.getFirstAsync<{ id: string }>(
    `SELECT id FROM itens_vistoria WHERE vistoria_id = ? AND item_id = ?`,
    [vistoria_id, item_id]
  );

  if (existe) {
    const resultado = id;
    await db.runAsync(
      `UPDATE itens_vistoria
       SET estado = ?, observacao = ?, updated_at = ?
       WHERE vistoria_id = ? AND item_id = ?`,
      [estado, observacao, agora, vistoria_id, item_id]
    );

    await adicionarAoSync('item', item_id, 'update', {
      vistoria_id,
      item_id,
      item_checklist_id,
      estado,
      observacao,
      updated_at: agora,
    });

    const updated = await db.getFirstAsync<ItemVistoria>(
      `SELECT * FROM itens_vistoria WHERE vistoria_id = ? AND item_id = ?`,
      [vistoria_id, item_id]
    );

    return updated || { id: '', vistoria_id, item_id, item_checklist_id, estado, observacao, synced: false, midia_json: null, transcricao_audio: null, audio_path: null, synced_at: null, created_at: agora, updated_at: agora };
  } else {
    const itemVistoria: ItemVistoria = {
      id,
      vistoria_id,
      item_id,
      item_checklist_id,
      estado,
      observacao,
      midia_json: null,
      transcricao_audio: null,
      audio_path: null,
      synced: false,
      synced_at: null,
      created_at: agora,
      updated_at: agora,
    };

    await db.runAsync(
      `INSERT INTO itens_vistoria (
        id, vistoria_id, item_id, item_checklist_id, estado, observacao, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, vistoria_id, item_id, item_checklist_id, estado, observacao, agora, agora]
    );

    await adicionarAoSync('item', id, 'create', itemVistoria);

    return itemVistoria;
  }
}

export async function obterItensVistoria(vistoria_id: string): Promise<ItemVistoria[]> {
  const db = await getDatabase();
  const result = await db.getAllAsync<ItemVistoria>(
    `SELECT * FROM itens_vistoria WHERE vistoria_id = ?`,
    [vistoria_id]
  );
  return result || [];
}
