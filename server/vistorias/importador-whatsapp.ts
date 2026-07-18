import { parsePhoneNumber } from 'libphonenumber-js';

export interface MensagemWhatsApp {
  data: string;
  hora: string;
  remetente: string;
  telefone?: string;
  conteudo: string;
  midia?: string;
  dataTimestamp: Date;
}

export interface Extracao {
  dataRelato: Date;
  remetente: string;
  telefone?: string;
  danoDescrito: string;
  confiancaRelato: number; // 0-100
  tiposDano: string[];
  precisao?: string; // 'alta' | 'média' | 'baixa'
}

/**
 * Parser para exportação de WhatsApp em formato texto (copiar-colar)
 * Formato esperado: [dd/MM/yyyy, HH:mm:ss] Remetente: mensagem
 */
export function parseWhatsAppTexto(conteudoTexto: string): MensagemWhatsApp[] {
  const linhas = conteudoTexto.split('\n').filter((l) => l.trim());
  const mensagens: MensagemWhatsApp[] = [];

  const regexMensagem =
    /\[(\d{1,2})\/(\d{1,2})\/(\d{4}),\s*(\d{1,2}):(\d{2}):(\d{2})\]\s*(.+?):\s*(.+)/;
  const anoAtual = new Date().getFullYear();

  for (const linha of linhas) {
    const correspondencia = linha.match(regexMensagem);
    if (!correspondencia) {
      continue;
    }

    const [, dia, mes, ano, hora, minuto, segundo, remetente, conteudo] = correspondencia;

    const dataTimestamp = new Date(
      parseInt(ano),
      parseInt(mes) - 1,
      parseInt(dia),
      parseInt(hora),
      parseInt(minuto),
      parseInt(segundo)
    );

    mensagens.push({
      data: `${dia}/${mes}/${ano}`,
      hora: `${hora}:${minuto}:${segundo}`,
      remetente: remetente.trim(),
      conteudo: conteudo.trim(),
      dataTimestamp,
    });
  }

  return mensagens;
}

/**
 * Parser para JSON exportado do WhatsApp (quando disponível)
 */
export function parseWhatsAppJSON(conteudoJSON: string): MensagemWhatsApp[] {
  try {
    const dados = JSON.parse(conteudoJSON);

    if (!Array.isArray(dados)) {
      return [];
    }

    return dados.map((msg: any) => ({
      data: msg.date || msg.data || '',
      hora: msg.time || msg.hora || '',
      remetente: msg.from || msg.remetente || 'Desconhecido',
      telefone: msg.phone || msg.telefone,
      conteudo: msg.text || msg.conteudo || msg.message || '',
      midia: msg.media || msg.midia,
      dataTimestamp: new Date(msg.timestamp || msg.dataTimestamp),
    }));
  } catch (erro) {
    throw new Error(`Erro ao fazer parse JSON: ${erro instanceof Error ? erro.message : String(erro)}`);
  }
}

/**
 * Identifica palavras-chave que indicam danos
 */
const PALAVRAS_CHAVE_DANOS: Record<string, string[]> = {
  infiltração: ['infiltração', 'vazamento', 'gotejamento', 'umidade', 'mofo'],
  pintura: ['pintura descascada', 'parede suja', 'mancha', 'tinta'],
  vidro: ['vidro quebrado', 'espelho quebrado', 'vidraça'],
  porta: ['porta danificada', 'maçaneta quebrada', 'dobradiça'],
  piso: ['piso danificado', 'azulejo solto', 'piso quebrado'],
  eletricidade: ['tomada', 'luz não funciona', 'fiação', 'curto-circuito'],
  canalização: ['cano entupido', 'encanação', 'sifão'],
  geral: ['danificado', 'quebrado', 'amassado', 'furado', 'rachado'],
};

/**
 * Extrai informações de dano de um texto
 */
export function extrairInformacoesDano(texto: string): {
  danoIdentificado: boolean;
  tiposDano: string[];
  confianca: number;
  descricao: string;
} {
  const textoLower = texto.toLowerCase();
  const tiposDanoEncontrados = new Set<string>();

  // Procurar por palavras-chave
  for (const [tipo, palavras] of Object.entries(PALAVRAS_CHAVE_DANOS)) {
    if (palavras.some((p) => textoLower.includes(p))) {
      tiposDanoEncontrados.add(tipo);
    }
  }

  // Calcular confiança
  let confianca = 0;
  if (tiposDanoEncontrados.size > 0) {
    confianca = 80 + Math.min(tiposDanoEncontrados.size * 5, 20); // 80-100
  } else if (
    texto.length > 50 &&
    (textoLower.includes('problema') || textoLower.includes('defeito'))
  ) {
    confianca = 60;
  }

  return {
    danoIdentificado: confianca >= 60,
    tiposDano: Array.from(tiposDanoEncontrados),
    confianca,
    descricao: texto,
  };
}

/**
 * Classifica relato de dano usando padrões (sem LLM, offline)
 */
export function classificarRelatoDano(mensagem: MensagemWhatsApp): Extracao | null {
  const extracao = extrairInformacoesDano(mensagem.conteudo);

  if (!extracao.danoIdentificado) {
    return null;
  }

  let precisao: 'alta' | 'média' | 'baixa' = 'baixa';
  if (extracao.confianca >= 90) {
    precisao = 'alta';
  } else if (extracao.confianca >= 70) {
    precisao = 'média';
  }

  return {
    dataRelato: mensagem.dataTimestamp,
    remetente: mensagem.remetente,
    telefone: mensagem.telefone,
    danoDescrito: extracao.descricao,
    confiancaRelato: extracao.confianca,
    tiposDano: extracao.tiposDano,
    precisao,
  };
}

/**
 * Processa chat inteiro e extrai todos os danos relatados
 */
export function extrairDanosDoChat(mensagens: MensagemWhatsApp[]): Extracao[] {
  const danos: Extracao[] = [];

  for (const mensagem of mensagens) {
    const extracao = classificarRelatoDano(mensagem);
    if (extracao) {
      danos.push(extracao);
    }
  }

  return danos;
}

/**
 * Importa arquivo WhatsApp completo (texto ou JSON)
 */
export async function importarChatWhatsApp(conteudo: string, formato: 'texto' | 'json' = 'texto') {
  try {
    let mensagens: MensagemWhatsApp[];

    if (formato === 'json') {
      mensagens = parseWhatsAppJSON(conteudo);
    } else {
      mensagens = parseWhatsAppTexto(conteudo);
    }

    const danos = extrairDanosDoChat(mensagens);

    return {
      sucesso: true,
      totalMensagens: mensagens.length,
      dansoEncontrados: danos.length,
      danos,
      mensagens,
    };
  } catch (erro) {
    return {
      sucesso: false,
      erro: erro instanceof Error ? erro.message : String(erro),
      totalMensagens: 0,
      danosEncontrados: 0,
      danos: [],
      mensagens: [],
    };
  }
}

/**
 * Filtra relatos por confiança mínima
 */
export function filtrarPorConfianca(
  relatos: Extracao[],
  confiancaMinima: number = 70
): Extracao[] {
  return relatos.filter((r) => r.confiancaRelato >= confiancaMinima);
}

/**
 * Agrupa danos por tipo
 */
export function agruparPorTipo(danos: Extracao[]): Map<string, Extracao[]> {
  const agrupados = new Map<string, Extracao[]>();

  for (const dano of danos) {
    for (const tipo of dano.tiposDano) {
      if (!agrupados.has(tipo)) {
        agrupados.set(tipo, []);
      }
      agrupados.get(tipo)!.push(dano);
    }
  }

  return agrupados;
}
