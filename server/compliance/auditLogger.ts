import { createClient } from '@/lib/supabase/server';

export interface AuditLogEntry {
  usuario_id?: string;
  acao: string;
  tabela: string;
  registro_id?: string;
  valores_antes?: any;
  valores_depois?: any;
  ip_address?: string;
  user_agent?: string;
  endpoint?: string;
}

export interface AcessoLogEntry {
  usuario_id: string;
  tipo_evento: 'login' | 'logout' | 'login_falho' | 'acesso_negado' | 'permissao_alterada';
  ip_address: string;
  user_agent?: string;
  recurso_acessado?: string;
  resultado: 'sucesso' | 'falha';
  motivo_falha?: string;
}

export interface FiscalAuditEntry {
  tipo:
    | 'nfse_emitida'
    | 'nfse_cancelada'
    | 'pix_enviado'
    | 'pix_confirmado'
    | 'pix_devolvido'
    | 'fatura_gerada'
    | 'cobranca_emitida'
    | 'documento_assinado';
  pessoa_id?: string;
  prestador_id?: string;
  fechamento_id?: string;
  valor_bruto?: number;
  valor_liquido?: number;
  impostos_retidos?: number;
  numero_documento?: string;
  protocolo?: string;
  data_emissao?: string;
  status: 'registrado' | 'transmitido' | 'autorizado' | 'cancelado' | 'denegado';
  url_documento?: string;
  xml_content?: string;
  chave_acesso?: string;
}

/**
 * Centralizado audit logger para LGPD e compliance.
 *
 * Cada método cria seu próprio client Supabase sob demanda (via
 * `createClient()`, que lê os cookies da requisição em andamento) em vez de
 * reutilizar uma instância cacheada — um client vinculado a cookies não pode
 * ser guardado como estado de módulo/singleton sem vazar a sessão de um
 * usuário para as requisições de outro.
 */
export class AuditLogger {
  /**
   * Log general audit trail
   */
  async logAuditoria(entry: AuditLogEntry): Promise<{ sucesso: boolean; erro?: string }> {
    try {
      const supabase = await createClient();
      const { error } = await supabase.from('auditoria_geral').insert({
        usuario_id: entry.usuario_id,
        acao: entry.acao,
        tabela: entry.tabela,
        registro_id: entry.registro_id,
        valores_antes: entry.valores_antes || null,
        valores_depois: entry.valores_depois || null,
        ip_address: entry.ip_address,
        user_agent: entry.user_agent,
        endpoint: entry.endpoint,
      });

      if (error) {
        console.error('Erro ao registrar auditoria:', error);
        return { sucesso: false, erro: error.message };
      }

      return { sucesso: true };
    } catch (erro) {
      console.error('Erro ao log auditoria:', erro);
      return { sucesso: false, erro: erro instanceof Error ? erro.message : 'Erro desconhecido' };
    }
  }

  /**
   * Log access event (login, acesso, etc)
   */
  async logAcesso(entry: AcessoLogEntry): Promise<{ sucesso: boolean; erro?: string }> {
    try {
      const supabase = await createClient();
      const { error } = await supabase.from('auditoria_acesso').insert({
        usuario_id: entry.usuario_id,
        tipo_evento: entry.tipo_evento,
        ip_address: entry.ip_address,
        user_agent: entry.user_agent,
        recurso_acessado: entry.recurso_acessado,
        resultado: entry.resultado,
        motivo_falha: entry.motivo_falha,
      });

      if (error) {
        console.error('Erro ao registrar acesso:', error);
        return { sucesso: false, erro: error.message };
      }

      return { sucesso: true };
    } catch (erro) {
      console.error('Erro ao log acesso:', erro);
      return { sucesso: false, erro: erro instanceof Error ? erro.message : 'Erro desconhecido' };
    }
  }

  /**
   * Log fiscal audit trail
   */
  async logFiscal(entry: FiscalAuditEntry): Promise<{ sucesso: boolean; erro?: string }> {
    try {
      const supabase = await createClient();
      const { data: user } = await supabase.auth.getUser();

      const { error } = await supabase.from('auditoria_fiscal').insert({
        tipo: entry.tipo,
        pessoa_id: entry.pessoa_id,
        prestador_id: entry.prestador_id,
        fechamento_id: entry.fechamento_id,
        valor_bruto: entry.valor_bruto,
        valor_liquido: entry.valor_liquido,
        impostos_retidos: entry.impostos_retidos,
        numero_documento: entry.numero_documento,
        protocolo: entry.protocolo,
        data_emissao: entry.data_emissao ? new Date(entry.data_emissao) : null,
        data_competencia: entry.data_emissao ? new Date(entry.data_emissao) : null,
        status: entry.status,
        url_documento: entry.url_documento,
        xml_content: entry.xml_content,
        chave_acesso: entry.chave_acesso,
        criado_por: user?.user?.id,
      });

      if (error) {
        console.error('Erro ao registrar auditoria fiscal:', error);
        return { sucesso: false, erro: error.message };
      }

      return { sucesso: true };
    } catch (erro) {
      console.error('Erro ao log fiscal:', erro);
      return { sucesso: false, erro: erro instanceof Error ? erro.message : 'Erro desconhecido' };
    }
  }

  /**
   * Register LGPD data request
   */
  async registrarRequisicaoLgpd(
    pessoa_id: string,
    tipo: 'anonimizacao' | 'portabilidade' | 'deletacao' | 'consentimento',
    motivo: string
  ): Promise<{ sucesso: boolean; requisicao_id?: string; erro?: string }> {
    try {
      const supabase = await createClient();
      const { data: user } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from('requisicoes_lgpd')
        .insert({
          pessoa_id,
          tipo,
          motivo,
          status: 'pendente',
          solicitado_por: user?.user?.id,
        })
        .select('id')
        .single();

      if (error) {
        console.error('Erro ao registrar requisição LGPD:', error);
        return { sucesso: false, erro: error.message };
      }

      return { sucesso: true, requisicao_id: data.id };
    } catch (erro) {
      console.error('Erro ao registrar LGPD:', erro);
      return { sucesso: false, erro: erro instanceof Error ? erro.message : 'Erro desconhecido' };
    }
  }

  /**
   * Anonimizar pessoa (LGPD compliance)
   */
  async anonimizarPessoa(
    pessoa_id: string,
    requisicao_id: string
  ): Promise<{ sucesso: boolean; resultado?: any; erro?: string }> {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc('anonimizar_pessoa', {
        p_pessoa_id: pessoa_id,
        p_requisicao_id: requisicao_id,
      });

      if (error) {
        console.error('Erro ao anonimizar pessoa:', error);
        return { sucesso: false, erro: error.message };
      }

      return { sucesso: true, resultado: data };
    } catch (erro) {
      console.error('Erro ao anonimizar:', erro);
      return { sucesso: false, erro: erro instanceof Error ? erro.message : 'Erro desconhecido' };
    }
  }

  /**
   * Check compliance alerts
   */
  async verificarAlertas(): Promise<{
    sucesso: boolean;
    alertas?: any[];
    erro?: string;
  }> {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('alertas_compliance')
        .select('*')
        .eq('status', 'ativo')
        .order('criado_em', { ascending: false });

      if (error) {
        return { sucesso: false, erro: error.message };
      }

      return { sucesso: true, alertas: data || [] };
    } catch (erro) {
      console.error('Erro ao verificar alertas:', erro);
      return { sucesso: false, erro: erro instanceof Error ? erro.message : 'Erro desconhecido' };
    }
  }

  /**
   * Get audit trail for a record
   */
  async obterAuditoriaRegistro(
    tabela: string,
    registro_id: string
  ): Promise<{ sucesso: boolean; auditoria?: any[]; erro?: string }> {
    try {
      const supabase = await createClient();
      const { data, error } = await supabase
        .from('auditoria_geral')
        .select('*')
        .eq('tabela', tabela)
        .eq('registro_id', registro_id)
        .order('timestamp', { ascending: false });

      if (error) {
        return { sucesso: false, erro: error.message };
      }

      return { sucesso: true, auditoria: data || [] };
    } catch (erro) {
      console.error('Erro ao obter auditoria:', erro);
      return { sucesso: false, erro: erro instanceof Error ? erro.message : 'Erro desconhecido' };
    }
  }

  /**
   * Get fiscal reconciliation for closure
   */
  async obterReconciliacaoFiscal(
    fechamento_id: string
  ): Promise<{ sucesso: boolean; reconciliacao?: any; erro?: string }> {
    try {
      const supabase = await createClient();

      // Buscar dados do fechamento
      const { data: fechamento, error: erroFechamento } = await supabase
        .from('fechamentos_prestador')
        .select('valor_liquido, criado_em')
        .eq('id', fechamento_id)
        .single();

      if (erroFechamento) {
        return { sucesso: false, erro: 'Fechamento não encontrado' };
      }

      // Buscar auditoria fiscal correspondente
      const { data: auditoria, error: erroAuditoria } = await supabase
        .from('auditoria_fiscal')
        .select('*')
        .eq('fechamento_id', fechamento_id)
        .single();

      if (erroAuditoria) {
        return { sucesso: true, reconciliacao: { diferenca: fechamento.valor_liquido } };
      }

      const diferenca = auditoria.valor_liquido - fechamento.valor_liquido;

      return {
        sucesso: true,
        reconciliacao: {
          fechamento_id,
          valor_fechamento: fechamento.valor_liquido,
          valor_auditoria: auditoria.valor_liquido,
          diferenca,
          reconciliado: diferenca === 0,
        },
      };
    } catch (erro) {
      console.error('Erro ao obter reconciliação fiscal:', erro);
      return { sucesso: false, erro: erro instanceof Error ? erro.message : 'Erro desconhecido' };
    }
  }
}

// Singleton export — seguro porque a classe não guarda mais nenhum client
// cacheado; cada chamada de método cria o seu próprio via createClient().
export const auditLogger = new AuditLogger();
