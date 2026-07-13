import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { ApontamentosCalendar } from './components/ApontamentosCalendar';

export default async function PainelPrestadorPage() {
  const supabase = createClient();

  // Verificar autenticação
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/auth/login');
  }

  // Buscar pessoa associada ao usuário (via email)
  const { data: pessoa, error: pessoaError } = await supabase
    .from('pessoas')
    .select('id, nome, email')
    .eq('email', user.email)
    .single();

  if (pessoaError || !pessoa) {
    return (
      <div className="p-8">
        <div className="bg-red-100 text-red-700 p-4 rounded">
          Conta não encontrada. Contate o administrador.
        </div>
      </div>
    );
  }

  // Buscar prestador
  const { data: prestador, error: prestadorError } = await supabase
    .from('prestadores_servico')
    .select('id, nome_completo, categoria, tipo')
    .eq('pessoa_id', pessoa.id)
    .single();

  if (prestadorError || !prestador) {
    return (
      <div className="p-8">
        <div className="bg-red-100 text-red-700 p-4 rounded">
          Perfil de prestador não encontrado. Contate o administrador.
        </div>
      </div>
    );
  }

  // Buscar contrato ativo
  const { data: contrato, error: contratoError } = await supabase
    .from('contratos_prestador')
    .select('id, tipo_remuneracao, valor_base, frequencia_fechamento, data_inicio')
    .eq('prestador_id', prestador.id)
    .eq('tipo_contrato', 'fixo')
    .maybeSingle();

  if (contratoError || !contrato) {
    return (
      <div className="p-8">
        <div className="bg-yellow-100 text-yellow-700 p-4 rounded">
          Nenhum contrato ativo encontrado.
        </div>
      </div>
    );
  }

  // Buscar apontamentos recentes
  const { data: apontamentos, error: apontamentosError } = await supabase
    .from('apontamentos_prestador')
    .select('id, data, hora_inicio, hora_saida, horas_trabalhadas, status')
    .eq('contrato_id', contrato.id)
    .gte('data', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())
    .order('data', { ascending: false });

  if (apontamentosError) {
    return (
      <div className="p-8">
        <div className="bg-red-100 text-red-700 p-4 rounded">
          Erro ao carregar apontamentos.
        </div>
      </div>
    );
  }

  // Buscar fechamentos recentes
  const { data: fechamentos, error: fechamentosError } = await supabase
    .from('fechamentos_prestador')
    .select('id, data_inicio, data_fim, total_proventos, total_deducoes, valor_liquido, status')
    .eq('contrato_id', contrato.id)
    .order('data_fim', { ascending: false })
    .limit(5);

  if (fechamentosError) {
    console.error('Erro ao carregar fechamentos:', fechamentosError);
  }

  const apontamentosFormatted = (apontamentos || []).map((apt) => ({
    id: apt.id,
    data: new Date(apt.data),
    horaInicio: apt.hora_inicio,
    horaSaida: apt.hora_saida,
    horasTrabalhadas: apt.horas_trabalhadas || 0,
    status: apt.status,
    valorTotal: 0, // Será calculado na UI baseado nas regras
  }));

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <h1 className="text-3xl font-bold mb-2">Painel do Prestador</h1>
          <div className="flex items-center gap-4">
            <div>
              <p className="text-gray-600">
                Bem-vindo, <span className="font-semibold">{prestador.nome_completo}</span>
              </p>
              <p className="text-sm text-gray-500 capitalize">
                {prestador.categoria.replace(/_/g, ' ')} • {prestador.tipo}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Contrato Info Card */}
          <div className="bg-white rounded-lg border p-6">
            <h3 className="font-semibold mb-4">Contrato Atual</h3>
            <div className="space-y-2 text-sm">
              <div>
                <p className="text-gray-600">Tipo de Remuneração</p>
                <p className="font-medium capitalize">{contrato.tipo_remuneracao}</p>
              </div>
              <div>
                <p className="text-gray-600">Valor Base</p>
                <p className="font-medium">R$ {contrato.valor_base?.toFixed(2)}</p>
              </div>
              <div>
                <p className="text-gray-600">Frequência de Fechamento</p>
                <p className="font-medium capitalize">
                  {contrato.frequencia_fechamento === 'mensal' ? 'Mensal' : 'Semanal'}
                </p>
              </div>
              <div>
                <p className="text-gray-600">Vigência</p>
                <p className="font-medium">
                  {new Date(contrato.data_inicio).toLocaleDateString('pt-BR')}+
                </p>
              </div>
            </div>
          </div>

          {/* Apontamentos Info Card */}
          <div className="bg-white rounded-lg border p-6">
            <h3 className="font-semibold mb-4">Apontamentos Este Mês</h3>
            <div className="space-y-2 text-sm">
              <div>
                <p className="text-gray-600">Total de Apontamentos</p>
                <p className="font-medium text-lg">{apontamentos?.length || 0}</p>
              </div>
              <div>
                <p className="text-gray-600">Horas Trabalhadas</p>
                <p className="font-medium text-lg">
                  {apontamentos
                    ?.reduce((sum, apt) => sum + (apt.horas_trabalhadas || 0), 0)
                    .toFixed(1) || 0}
                </p>
              </div>
              <div>
                <p className="text-gray-600">Em Rascunho</p>
                <p className="font-medium">
                  {apontamentos?.filter((apt) => apt.status === 'rascunho').length || 0}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Actions */}
          <div className="bg-white rounded-lg border p-6">
            <h3 className="font-semibold mb-4">Ações Rápidas</h3>
            <div className="space-y-2">
              <button className="w-full px-4 py-2 bg-blue-600 text-white rounded font-medium hover:bg-blue-700 text-sm">
                + Novo Apontamento
              </button>
              <button className="w-full px-4 py-2 border rounded font-medium hover:bg-gray-50 text-sm">
                Ver Fechamentos
              </button>
              <button className="w-full px-4 py-2 border rounded font-medium hover:bg-gray-50 text-sm">
                Download Extrato
              </button>
            </div>
          </div>
        </div>

        {/* Calendar Section */}
        <div className="bg-white rounded-lg border p-6 mb-8">
          <h2 className="text-lg font-semibold mb-4">Calendário de Apontamentos</h2>
          <ApontamentosCalendar
            contratoId={contrato.id}
            apontamentos={apontamentosFormatted}
          />
        </div>

        {/* Recent Closings */}
        {fechamentos && fechamentos.length > 0 && (
          <div className="bg-white rounded-lg border p-6">
            <h2 className="text-lg font-semibold mb-4">Fechamentos Recentes</h2>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="border-b">
                  <tr>
                    <th className="text-left px-4 py-2 font-medium">Período</th>
                    <th className="text-left px-4 py-2 font-medium">Proventos</th>
                    <th className="text-left px-4 py-2 font-medium">Deduções</th>
                    <th className="text-left px-4 py-2 font-medium">Líquido</th>
                    <th className="text-left px-4 py-2 font-medium">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {fechamentos.map((fech) => (
                    <tr key={fech.id} className="border-b hover:bg-gray-50">
                      <td className="px-4 py-2">
                        {new Date(fech.data_inicio).toLocaleDateString('pt-BR')} a{' '}
                        {new Date(fech.data_fim).toLocaleDateString('pt-BR')}
                      </td>
                      <td className="px-4 py-2 text-green-700">
                        R$ {fech.total_proventos.toFixed(2)}
                      </td>
                      <td className="px-4 py-2 text-red-700">
                        R$ {fech.total_deducoes.toFixed(2)}
                      </td>
                      <td className="px-4 py-2 font-semibold">
                        R$ {fech.valor_liquido.toFixed(2)}
                      </td>
                      <td className="px-4 py-2">
                        <span
                          className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${
                            fech.status === 'pago'
                              ? 'bg-green-100 text-green-700'
                              : fech.status === 'aprovado'
                              ? 'bg-blue-100 text-blue-700'
                              : fech.status === 'enviado_para_gestao'
                              ? 'bg-yellow-100 text-yellow-700'
                              : 'bg-gray-100 text-gray-700'
                          }`}
                        >
                          {fech.status === 'pago'
                            ? 'Pago'
                            : fech.status === 'aprovado'
                            ? 'Aprovado'
                            : fech.status === 'enviado_para_gestao'
                            ? 'Aguardando Aprovação'
                            : fech.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
