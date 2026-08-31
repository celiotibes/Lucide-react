'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { createClient } from '@supabase/supabase-js';

interface FormData {
  assunto: string;
  mensagem: string;
  tipo: string;
}

export default function PaginaSuporte() {
  const params = useParams();
  const contratoId = params.id as string;
  const [formulario, setFormulario] = useState<FormData>({
    assunto: '',
    mensagem: '',
    tipo: 'duvida'
  });
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState('');
  const [sucesso, setSucesso] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErro('');
    setSucesso('');

    if (!formulario.assunto.trim() || !formulario.mensagem.trim()) {
      setErro('Assunto e mensagem são obrigatórios');
      setLoading(false);
      return;
    }

    try {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL || '',
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
      );

      const { data: { session } } = await supabase.auth.getSession();

      const res = await fetch(`/api/portal/contratos/${contratoId}/suporte`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token || ''}`
        },
        body: JSON.stringify(formulario)
      });

      if (res.ok) {
        setSucesso('Mensagem enviada! Entraremos em contato em breve.');
        setFormulario({
          assunto: '',
          mensagem: '',
          tipo: 'duvida'
        });
        setTimeout(() => {
          setSucesso('');
        }, 5000);
      } else if (res.status === 401 || res.status === 403) {
        setErro('Você não tem permissão para realizar esta ação');
      } else {
        setErro('Erro ao enviar mensagem');
      }
    } catch (e) {
      setErro('Erro ao conectar ao servidor');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: '700px', margin: '0 auto', padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '30px' }}>
        <h2 style={{ margin: 0 }}>Entre em Contato</h2>
        <Link href={`/portal/contratos/${contratoId}`} style={{ color: '#0066cc', textDecoration: 'none' }}>
          ← Voltar
        </Link>
      </div>

      {erro && (
        <div style={{ background: '#fee2e2', color: '#991b1b', padding: '12px', borderRadius: '4px', marginBottom: '15px', border: '1px solid #fca5a5' }}>
          {erro}
        </div>
      )}

      {sucesso && (
        <div style={{ background: '#dcfce7', color: '#166534', padding: '12px', borderRadius: '4px', marginBottom: '15px', border: '1px solid #86efac' }}>
          {sucesso}
        </div>
      )}

      <form onSubmit={handleSubmit} style={{ background: 'white', borderRadius: '8px', padding: '20px', boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)' }}>
        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="tipo" style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#333' }}>
            Tipo de solicitação
          </label>
          <select
            id="tipo"
            value={formulario.tipo}
            onChange={(e) => setFormulario({ ...formulario, tipo: e.target.value })}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
              fontFamily: 'inherit'
            }}
          >
            <option value="duvida">Dúvida sobre pagamento</option>
            <option value="problema">Problema ou reclamação</option>
            <option value="solicitar">Solicitar informação</option>
            <option value="outro">Outro assunto</option>
          </select>
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="assunto" style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#333' }}>
            Assunto *
          </label>
          <input
            id="assunto"
            type="text"
            value={formulario.assunto}
            onChange={(e) => setFormulario({ ...formulario, assunto: e.target.value })}
            placeholder="Descreva o assunto em poucas palavras"
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
              fontFamily: 'inherit',
              boxSizing: 'border-box'
            }}
            required
          />
        </div>

        <div style={{ marginBottom: '20px' }}>
          <label htmlFor="mensagem" style={{ display: 'block', marginBottom: '8px', fontWeight: '500', color: '#333' }}>
            Mensagem *
          </label>
          <textarea
            id="mensagem"
            value={formulario.mensagem}
            onChange={(e) => setFormulario({ ...formulario, mensagem: e.target.value })}
            placeholder="Descreva detalhadamente sua dúvida ou solicitação"
            rows={6}
            style={{
              width: '100%',
              padding: '10px',
              border: '1px solid #ddd',
              borderRadius: '4px',
              fontSize: '14px',
              fontFamily: 'inherit',
              boxSizing: 'border-box'
            }}
            required
          />
        </div>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', paddingTop: '15px', borderTop: '1px solid #eee' }}>
          <Link
            href={`/portal/contratos/${contratoId}`}
            style={{
              padding: '10px 20px',
              background: '#f0f0f0',
              color: '#333',
              textDecoration: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500'
            }}
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={loading}
            style={{
              padding: '10px 20px',
              background: loading ? '#cccccc' : '#28a745',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '14px',
              fontWeight: '500',
              transition: 'all 0.2s'
            }}
          >
            {loading ? 'Enviando...' : '✓ Enviar mensagem'}
          </button>
        </div>
      </form>

      <div style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: '8px', padding: '15px', marginTop: '20px' }}>
        <p style={{ margin: 0, fontSize: '13px', color: '#1e40af' }}>
          ℹ️ <strong>Tempo de resposta:</strong> Respondemos em até 24 horas úteis.
        </p>
      </div>
    </div>
  );
}
