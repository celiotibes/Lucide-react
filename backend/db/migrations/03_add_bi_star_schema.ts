/**
 * Migration: Add BI Star Schema
 * Cria tabelas de Fato e Dimensão para o módulo de BI Contábil
 *
 * Star Schema:
 * - Tabelas de Fato: fact_financial_movements, fact_daily_kpis
 * - Tabelas de Dimensão: dim_accounts, dim_calendar, dim_cost_centers
 * - Tabela Agregada: agg_daily_kpis (pré-calculada para performance)
 */

export async function up(db: any): Promise<void> {
  console.log('Executando migração: Add BI Star Schema');

  // ============================================================================
  // DIMENSÕES (Dimension Tables)
  // ============================================================================

  // 1. Dimensão: Calendário
  await db.query(`
    CREATE TABLE IF NOT EXISTS dim_calendar (
      date_id DATE PRIMARY KEY,
      year INT NOT NULL,
      month INT NOT NULL,
      quarter INT NOT NULL,
      week INT NOT NULL,
      day_of_week INT NOT NULL,
      day_name VARCHAR(10) NOT NULL,
      month_name VARCHAR(10) NOT NULL,
      is_weekend BOOLEAN NOT NULL,
      is_holiday BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    COMMENT ON TABLE dim_calendar IS 'Dimensão de Calendário para análise temporal';
  `);

  // Criar índice para performance
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_dim_calendar_year_month
    ON dim_calendar(year, month)
  `);

  // 2. Dimensão: Plano de Contas (Chart of Accounts)
  await db.query(`
    CREATE TABLE IF NOT EXISTS dim_accounts (
      account_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      account_code VARCHAR(20) NOT NULL UNIQUE,
      account_name VARCHAR(255) NOT NULL,
      account_type VARCHAR(50) NOT NULL CHECK (
        account_type IN ('asset', 'liability', 'equity', 'revenue', 'expense')
      ),
      account_category VARCHAR(100),
      parent_account_id UUID REFERENCES dim_accounts(account_id),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    COMMENT ON TABLE dim_accounts IS 'Dimensão do Plano de Contas Contábil';
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_dim_accounts_type
    ON dim_accounts(account_type)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_dim_accounts_parent
    ON dim_accounts(parent_account_id)
  `);

  // 3. Dimensão: Centros de Custo (Cost Centers)
  await db.query(`
    CREATE TABLE IF NOT EXISTS dim_cost_centers (
      cost_center_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      property_id UUID NOT NULL,
      cost_center_name VARCHAR(255) NOT NULL,
      cost_center_type VARCHAR(100) DEFAULT 'property',
      budget_amount DECIMAL(15, 2) DEFAULT 0,
      responsible_name VARCHAR(255),
      responsible_email VARCHAR(255),
      is_active BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    COMMENT ON TABLE dim_cost_centers IS 'Dimensão de Centros de Custo';
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_dim_cost_centers_property
    ON dim_cost_centers(property_id)
  `);

  // ============================================================================
  // TABELAS DE FATO (Fact Tables)
  // ============================================================================

  // 1. Fato: Movimentações Financeiras
  await db.query(`
    CREATE TABLE IF NOT EXISTS fact_financial_movements (
      movement_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      property_id UUID NOT NULL,
      account_id UUID NOT NULL REFERENCES dim_accounts(account_id),
      cost_center_id UUID REFERENCES dim_cost_centers(cost_center_id),
      date_id DATE NOT NULL REFERENCES dim_calendar(date_id),
      movement_type VARCHAR(50) NOT NULL CHECK (
        movement_type IN ('revenue', 'cost', 'expense', 'investment', 'transfer')
      ),
      amount DECIMAL(15, 2) NOT NULL,
      currency VARCHAR(3) DEFAULT 'BRL',
      description TEXT,
      reference_number VARCHAR(100),
      platform VARCHAR(100),
      is_reconciled BOOLEAN DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    COMMENT ON TABLE fact_financial_movements IS 'Fato: Movimentações Financeiras';
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_fact_movements_property_date
    ON fact_financial_movements(property_id, date_id)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_fact_movements_account_type
    ON fact_financial_movements(account_id, movement_type)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_fact_movements_date_range
    ON fact_financial_movements(date_id)
  `);

  // ============================================================================
  // TABELAS AGREGADAS (Aggregated Tables)
  // ============================================================================

  // 1. Agregação: KPIs Diários
  await db.query(`
    CREATE TABLE IF NOT EXISTS agg_daily_kpis (
      kpi_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      property_id UUID NOT NULL,
      date_id DATE NOT NULL REFERENCES dim_calendar(date_id),
      gross_revenue DECIMAL(15, 2) DEFAULT 0,
      net_revenue DECIMAL(15, 2) DEFAULT 0,
      operational_costs DECIMAL(15, 2) DEFAULT 0,
      cogs DECIMAL(15, 2) DEFAULT 0,
      operational_expenses DECIMAL(15, 2) DEFAULT 0,
      ebitda DECIMAL(15, 2) DEFAULT 0,
      interest_expense DECIMAL(15, 2) DEFAULT 0,
      tax_expense DECIMAL(15, 2) DEFAULT 0,
      net_profit DECIMAL(15, 2) DEFAULT 0,
      profit_margin_percentage NUMERIC(5, 2) DEFAULT 0,
      operating_margin_percentage NUMERIC(5, 2) DEFAULT 0,
      cash_flow DECIMAL(15, 2) DEFAULT 0,
      liquidity_current NUMERIC(5, 2) DEFAULT 0,
      debt_to_equity NUMERIC(5, 2) DEFAULT 0,
      calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    COMMENT ON TABLE agg_daily_kpis IS 'Agregação: KPIs Diários Pré-calculados';
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_agg_kpis_property_date
    ON agg_daily_kpis(property_id, date_id DESC)
  `);
  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_agg_kpis_date_range
    ON agg_daily_kpis(date_id DESC)
  `);

  // 2. Agregação: KPIs Mensais
  await db.query(`
    CREATE TABLE IF NOT EXISTS agg_monthly_kpis (
      kpi_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      property_id UUID NOT NULL,
      year INT NOT NULL,
      month INT NOT NULL,
      gross_revenue DECIMAL(15, 2) DEFAULT 0,
      net_revenue DECIMAL(15, 2) DEFAULT 0,
      operational_costs DECIMAL(15, 2) DEFAULT 0,
      ebitda DECIMAL(15, 2) DEFAULT 0,
      net_profit DECIMAL(15, 2) DEFAULT 0,
      profit_margin_percentage NUMERIC(5, 2) DEFAULT 0,
      cash_flow DECIMAL(15, 2) DEFAULT 0,
      movement_count INT DEFAULT 0,
      calculated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
    COMMENT ON TABLE agg_monthly_kpis IS 'Agregação: KPIs Mensais Pré-calculados';
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_agg_monthly_kpis_property_period
    ON agg_monthly_kpis(property_id, year, month DESC)
  `);

  // ============================================================================
  // PREENCHIMENTO INICIAL DE CALENDÁRIO (Próximos 5 anos)
  // ============================================================================

  await db.query(`
    INSERT INTO dim_calendar
    (date_id, year, month, quarter, week, day_of_week, day_name, month_name, is_weekend)
    SELECT
      d::DATE as date_id,
      EXTRACT(YEAR FROM d)::INT as year,
      EXTRACT(MONTH FROM d)::INT as month,
      CEILING(EXTRACT(MONTH FROM d) / 3.0)::INT as quarter,
      EXTRACT(WEEK FROM d)::INT as week,
      EXTRACT(DOW FROM d)::INT as day_of_week,
      TO_CHAR(d, 'Dy') as day_name,
      TO_CHAR(d, 'Month') as month_name,
      EXTRACT(DOW FROM d) IN (0, 6) as is_weekend
    FROM generate_series(
      DATE_TRUNC('day', CURRENT_DATE - INTERVAL '1 year'),
      CURRENT_DATE + INTERVAL '4 years',
      INTERVAL '1 day'
    ) AS d
    ON CONFLICT (date_id) DO NOTHING;
  `);

  console.log('✅ Star Schema criado com sucesso');
}

export async function down(db: any): Promise<void> {
  console.log('Revertendo migração: Add BI Star Schema');

  const tables = [
    'agg_monthly_kpis',
    'agg_daily_kpis',
    'fact_financial_movements',
    'dim_cost_centers',
    'dim_accounts',
    'dim_calendar',
  ];

  for (const table of tables) {
    await db.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
  }

  console.log('✅ Star Schema removido com sucesso');
}
