'use client';

import Link from 'next/link';

interface Props {
  userEmail?: string;
}

export function HomePageClient({ userEmail }: Props) {
  const user = userEmail ? { email: userEmail } : null;

  return (
    <div className="container-home">
      <div className="hero">
        <div className="hero-content">
          <h1>CRMT</h1>
          <h2>Gestão Imobiliária Completa</h2>
          <p>
            Sistema integrado para gestão de contratos, imóveis, inquilinos, faturamento e recebimentos.
          </p>

          <div className="hero-actions">
            {user ? (
              <>
                <Link href="/dashboard" className="botao-primario">
                  📊 Acessar Dashboard
                </Link>
                <Link href="/portal" className="botao-secundario">
                  👤 Portal do Inquilino
                </Link>
              </>
            ) : (
              <>
                <Link href="/auth/login" className="botao-primario">
                  🔐 Entrar
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="features">
        <h3>Recursos Principais</h3>
        <div className="grid-features">
          <div className="feature">
            <div className="feature-icon">📋</div>
            <h4>Gestão de Contratos</h4>
            <p>Crie, edite e acompanhe todos os seus contratos de locação em um único lugar.</p>
          </div>

          <div className="feature">
            <div className="feature-icon">🏠</div>
            <h4>Cadastro de Imóveis</h4>
            <p>Gerencie propriedades, cômodos, características e dados de localização.</p>
          </div>

          <div className="feature">
            <div className="feature-icon">👥</div>
            <h4>Base de Contatos</h4>
            <p>Administre locatários, fiadores, investidores e outros papéis de pessoas.</p>
          </div>

          <div className="feature">
            <div className="feature-icon">💰</div>
            <h4>Faturamento</h4>
            <p>Integração com Asaas para emissão de boletos, PIX e acompanhamento de recebimentos.</p>
          </div>

          <div className="feature">
            <div className="feature-icon">📊</div>
            <h4>Relatórios</h4>
            <p>Visualize receitas, vencimentos próximos e saúde financeira do portfólio.</p>
          </div>

          <div className="feature">
            <div className="feature-icon">🔒</div>
            <h4>Segurança</h4>
            <p>Autenticação segura com magic links, RLS no banco e auditoria de ações.</p>
          </div>
        </div>
      </div>

      {user && (
        <div className="card-info">
          <p>
            Bem-vindo, <strong>{user.email}</strong>!
          </p>
          <p>
            Você está autenticado. Visite o{' '}
            <Link href="/dashboard">
              <strong>Dashboard</strong>
            </Link>{' '}
            para gerenciar seus contratos e imóveis.
          </p>
        </div>
      )}

      <style jsx>{`
        .container-home {
          max-width: 1000px;
          margin: 0 auto;
          padding: 0 20px;
        }

        .hero {
          display: flex;
          align-items: center;
          justify-content: center;
          min-height: 500px;
          text-align: center;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          border-radius: 12px;
          color: white;
          margin: 40px 0;
          padding: 40px 20px;
        }

        .hero-content h1 {
          margin: 0 0 10px 0;
          font-size: 48px;
          font-weight: 800;
          letter-spacing: -1px;
        }

        .hero-content h2 {
          margin: 0 0 20px 0;
          font-size: 28px;
          font-weight: 400;
          opacity: 0.95;
        }

        .hero-content p {
          margin: 0 0 30px 0;
          font-size: 16px;
          opacity: 0.9;
          max-width: 500px;
        }

        .hero-actions {
          display: flex;
          gap: 15px;
          justify-content: center;
          flex-wrap: wrap;
        }

        .botao-primario,
        .botao-secundario {
          padding: 12px 28px;
          border-radius: 6px;
          font-size: 16px;
          font-weight: 600;
          text-decoration: none;
          transition: all 0.2s;
          display: inline-block;
        }

        .botao-primario {
          background: white;
          color: #667eea;
        }

        .botao-primario:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 20px rgba(0, 0, 0, 0.2);
        }

        .botao-secundario {
          background: rgba(255, 255, 255, 0.2);
          color: white;
          border: 2px solid white;
        }

        .botao-secundario:hover {
          background: rgba(255, 255, 255, 0.3);
          transform: translateY(-2px);
        }

        .features {
          margin: 60px 0 40px 0;
        }

        .features h3 {
          text-align: center;
          font-size: 28px;
          color: #333;
          margin-bottom: 40px;
        }

        .grid-features {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
          gap: 30px;
          margin-bottom: 40px;
        }

        .feature {
          text-align: center;
          padding: 30px;
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
          transition: all 0.3s ease;
        }

        .feature:hover {
          transform: translateY(-8px);
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
        }

        .feature-icon {
          font-size: 48px;
          margin-bottom: 15px;
          line-height: 1;
        }

        .feature h4 {
          margin: 0 0 10px 0;
          color: #333;
          font-size: 18px;
        }

        .feature p {
          margin: 0;
          color: #666;
          font-size: 14px;
          line-height: 1.6;
        }

        .card-info {
          background: #d4edda;
          border: 1px solid #c3e6cb;
          border-radius: 8px;
          padding: 20px;
          margin: 40px 0;
          color: #155724;
          text-align: center;
        }

        .card-info p {
          margin: 10px 0;
        }

        .card-info a {
          color: #155724;
          font-weight: 600;
        }

        @media (max-width: 600px) {
          .hero {
            min-height: 400px;
            margin: 20px 0;
          }

          .hero-content h1 {
            font-size: 36px;
          }

          .hero-content h2 {
            font-size: 20px;
          }

          .hero-actions {
            flex-direction: column;
            align-items: center;
          }

          .botao-primario,
          .botao-secundario {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
