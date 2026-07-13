import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';
import { FechamentosTable } from './components/FechamentosTable';
import { PrestadoresStats } from './components/PrestadoresStats';

export default async function PrestadoresAdminPage() {
  const supabase = createClient();

  // Verificar autenticação e permissão
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect('/auth/login');
  }

  // Verificar se é admin
  const { data: isAdmin, error: adminError } = await supabase.rpc(
    'fn_eh_admin_ou_economista'
  );

  if (adminError || !isAdmin) {
    return (
      <div className="p-8">
        <div className="bg-red-100 text-red-700 p-4 rounded">
          Acesso negado. Apenas administradores podem acessar este painel.
        </div>
      </div>
    );
  }

  // Buscar todos os prestadores
  const { data: prestadores, error: prestadoresError } = await supabase
    .from('prestadores_servico')
    .select(
      `
      id,
      nome_completo,
      cpf_cnpj,
      categoria,
      tipo,
      status,
      contratos_prestador (
        id,
        tipo_remuneracao,
        valor_base,
        frequencia_fechamento
      )
    `
    )
    .eq('status', 'ativo')
    .order('nome_completo');

  if (prestadoresError) {
    console.error('Erro ao buscar prestadores:', prestadoresError);
  }

  // Buscar fechamentos pendentes
  const { data: fechamentosPendentes, error: fechamentosError } = await supabase
    .from('fechamentos_prestador')
    .select(
      `
      id,
      contrato_id,
      prestador_id,
      data_inicio,
      data_fim,
      total_proventos,
      total_deducoes,
      valor_liquido,
      status,
      motivo_devolucao,
      prestadores_servico (
        nome_completo,
        categoria
      )
    `
    )
    .in('status', ['enviado_para_gestao', 'devolvido'])
    .order('data_fim', { ascending: false });

  if (fechamentosError) {
    console.error('Erro ao buscar fechamentos:', fechamentosError);
  }

  // Calcular estatísticas
  const { data: statsProventos } = await supabase
    .from('fechamentos_prestador')
    .select('valor_liquido')
    .eq('status', 'pago')
    .gte('data_fim', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString());

  const totalPago = statsProventos?.reduce((sum, f) => sum + (f.valor_liquido || 0), 0) || 0;
  const totalPendente =
    fechamentosPendentes?.reduce((sum, f) => sum + (f.valor_liquido || 0), 0) || 0;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white border-b">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <h1 className="text-3xl font-bold mb-2">Gestão de Prestadores</h1>
          <p className="text-gray-600">
            Gerencie apontamentos, fechamentos e pagamentos de prestadores de serviço
          </p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Stats Cards */}
        <PrestadoresStats
          totalPrestadores={prestadores?.length || 0}
          totalPago={totalPago}
          totalPendente={totalPendente}
          fechamentosPendentes={fechamentosPendentes?.length || 0}
        />

        {/* Tabs */}
        <div className="mt-8">
          <div className="border-b mb-6">
            <div className="flex gap-8">
              <button className="px-4 py-2 border-b-2 border-blue-600 text-blue-600 font-medium">
                Fechamentos Pendentes
              </button>
              <button className="px-4 py-2 border-b-2 border-transparent text-gray-600 font-medium hover:text-gray-900">
                Todos os Prestadores
              </button>
            </div>
          </div>

          {/* Fechamentos Pendentes Table */}
          {fechamentosPendentes && fechamentosPendentes.length > 0 ? (
            <FechamentosTable fechamentos={fechamentosPendentes} />
          ) : (
            <div className="bg-white rounded-lg border p-8 text-center text-gray-500">
              Nenhum fechamento pendente de aprovação
            </div>
          )}
        </div>

        {/* Prestadores List */}
        {prestadores && prestadores.length > 0 && (
          <div className="mt-8 bg-white rounded-lg border">
            <div className="p-6 border-b">
              <h2 className="text-lg font-semibold">Prestadores Ativos</h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left px-6 py-3 font-medium text-sm">Nome</th>
                    <th className="text-left px-6 py-3 font-medium text-sm">Categoria</th>
                    <th className="text-left px-6 py-3 font-medium text-sm">Tipo</th>
                    <th className="text-left px-6 py-3 font-medium text-sm">Contrato</th>
                    <th className="text-left px-6 py-3 font-medium text-sm">Valor Base</th>
                    <th className="text-left px-6 py-3 font-medium text-sm">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {prestadores.map((prest: any) => {
                    const contrato = prest.contratos_prestador?.[0];
                    return (
                      <tr key={prest.id} className="border-b hover:bg-gray-50">
                        <td className="px-6 py-4 font-medium">{prest.nome_completo}</td>
                        <td className="px-6 py-4 text-sm capitalize">
                          {prest.categoria.replace(/_/g, ' ')}
                        </td>
                        <td className="px-6 py-4 text-sm capitalize">{prest.tipo}</td>
                        <td className="px-6 py-4 text-sm">
                          {contrato?.tipo_remuneracao || '-'}
                        </td>
                        <td className="px-6 py-4 text-sm font-semibold">
                          {contrato?.valor_base ? `R$ ${contrato.valor_base.toFixed(2)}` : '-'}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <a
                            href={`/admin/prestadores/${prest.id}`}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Ver Detalhes
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
