import { NextRequest, NextResponse } from 'next/server';
import { obterPool } from '@/server/integracao/db';
import { converterDocumentoParaMarkdown } from '@/server/contratos/conversorDocumentos';
import { analisarContratoComIA, salvarAnaliseContrato } from '@/server/contratos/analisadorContratos';
import { randomUUID } from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

const UPLOAD_DIR = path.join(process.cwd(), 'tmp', 'uploads', 'contratos');

async function ensureUploadDir() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
}

export async function POST(request: NextRequest) {
  try {
    await ensureUploadDir();

    const formData = await request.formData();
    const arquivo = formData.get('arquivo') as Blob;
    const imovel_id = formData.get('imovel_id') as string;
    const tipo_documento = formData.get('tipo_documento') as string;
    const numero_contrato = formData.get('numero_contrato') as string;

    if (!arquivo || !imovel_id) {
      return NextResponse.json(
        { error: 'Arquivo e imovel_id são obrigatórios' },
        { status: 400 }
      );
    }

    const pool = obterPool();
    const buffer = Buffer.from(await arquivo.arrayBuffer());
    const nomeArquivo = arquivo.name || 'contrato';
    const tipoMime = arquivo.type || 'application/octet-stream';

    // Salvar arquivo
    const arquivoId = randomUUID();
    const extensao = nomeArquivo.includes('.') ? nomeArquivo.split('.').pop() : 'pdf';
    const nomeArquivoSalvo = `${arquivoId}.${extensao}`;
    const caminhoArquivo = path.join(UPLOAD_DIR, nomeArquivoSalvo);

    fs.writeFileSync(caminhoArquivo, buffer);

    // 1. Converter documento para Markdown
    console.log('Convertendo documento para Markdown...');
    const conversao = await converterDocumentoParaMarkdown(
      buffer,
      nomeArquivo,
      tipoMime
    );

    if (!conversao.sucesso) {
      return NextResponse.json(
        { error: 'Falha ao converter documento', avisos: conversao.avisos },
        { status: 400 }
      );
    }

    // 2. Analisar com IA
    console.log('Analisando contrato com IA...');
    const analise = await analisarContratoComIA(
      conversao.conteudo_markdown,
      nomeArquivo
    );

    // 3. Criar registro do contrato no banco
    const contrato_id = randomUUID();
    const dataCriacao = new Date();

    await pool.query(
      `insert into contratos_aluguel (
        id, imovel_id, numero_contrato, arquivo_contrato_url,
        arquivo_contrato_tipo, arquivo_contrato_md,
        analise_ia, dados_extraidos, confianca_extracao,
        status, criado_em, criado_por
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        contrato_id,
        imovel_id,
        numero_contrato || analise.dados_extraidos.numero_contrato,
        `/uploads/contratos/${nomeArquivoSalvo}`,
        tipoMime,
        conversao.conteudo_markdown,
        JSON.stringify(analise),
        JSON.stringify(analise.dados_extraidos),
        analise.confianca,
        analise.confianca >= 0.8 ? 'rascunho' : 'rascunho', // Require validation if low confidence
        dataCriacao,
        'sistema',
      ]
    );

    // 4. Registrar arquivo na tabela de arquivos
    await pool.query(
      `insert into contratos_aluguel_arquivos (
        id, contrato_id, tipo_documento, nome_arquivo, url_arquivo,
        tipo_arquivo, tamanho_bytes, conteudo_markdown, data_conversao
      ) values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [
        arquivoId,
        contrato_id,
        tipo_documento || 'contrato_principal',
        nomeArquivo,
        `/uploads/contratos/${nomeArquivoSalvo}`,
        tipoMime,
        buffer.length,
        conversao.conteudo_markdown,
        new Date(),
      ]
    );

    return NextResponse.json(
      {
        sucesso: true,
        contrato_id,
        arquivo_id: arquivoId,
        analise: {
          confianca: analise.confianca,
          dados_extraidos: analise.dados_extraidos,
          alertas: analise.alertas,
          recomendacoes: analise.recomendacoes,
          campos_incertos: analise.campos_incertos,
          resume_executivo: analise.resume_executivo,
        },
        conversao: {
          tipo_arquivo_original: conversao.tipo_arquivo_original,
          paginas_detectadas: conversao.paginas_detectadas,
          tempo_processamento_ms: conversao.tempo_processamento_ms,
        },
      },
      { status: 201 }
    );
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    console.error('Erro ao processar contrato:', mensagem);
    return NextResponse.json(
      { error: mensagem },
      { status: 500 }
    );
  }
}
