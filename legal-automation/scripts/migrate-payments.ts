import db from '../src/db/connection';
import { logger } from '../src/utils/logger';

export function migratePayments(): void {
  try {
    logger.info('Iniciando migração: Tabelas de Pagamento (Phase 10)');

    // Tabela: payment_transactions
    db.exec(`
      CREATE TABLE IF NOT EXISTS payment_transactions (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        amount REAL NOT NULL,
        currency TEXT NOT NULL DEFAULT 'BRL',
        method TEXT NOT NULL,
        processor TEXT NOT NULL,
        processor_transaction_id TEXT UNIQUE NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        processor_response TEXT,
        paid_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        metadata TEXT,
        ip_address TEXT,
        user_agent TEXT,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id)
      );
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_user_id ON payment_transactions(user_id);
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_status ON payment_transactions(status);
      CREATE INDEX IF NOT EXISTS idx_payment_transactions_created_at ON payment_transactions(created_at);
    `);

    // Tabela: refunds
    db.exec(`
      CREATE TABLE IF NOT EXISTS refunds (
        id TEXT PRIMARY KEY,
        transaction_id TEXT NOT NULL,
        amount REAL NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'requested',
        processor_refund_id TEXT,
        description TEXT,
        requested_at TEXT NOT NULL,
        processed_at TEXT,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (transaction_id) REFERENCES payment_transactions(id)
      );
      CREATE INDEX IF NOT EXISTS idx_refunds_status ON refunds(status);
      CREATE INDEX IF NOT EXISTS idx_refunds_requested_at ON refunds(requested_at);
    `);

    // Tabela: payment_cards
    db.exec(`
      CREATE TABLE IF NOT EXISTS payment_cards (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        cardholder_name TEXT NOT NULL,
        last4 TEXT NOT NULL,
        brand TEXT NOT NULL,
        expiry_month INTEGER NOT NULL,
        expiry_year INTEGER NOT NULL,
        processor_card_id TEXT UNIQUE NOT NULL,
        is_default INTEGER NOT NULL DEFAULT 0,
        is_active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_payment_cards_user_id ON payment_cards(user_id);
      CREATE INDEX IF NOT EXISTS idx_payment_cards_is_default ON payment_cards(is_default);
    `);

    // Tabela: payment_webhooks
    db.exec(`
      CREATE TABLE IF NOT EXISTS payment_webhooks (
        id TEXT PRIMARY KEY,
        processor TEXT NOT NULL,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        processor_event_id TEXT UNIQUE NOT NULL,
        processed_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_payment_webhooks_processor ON payment_webhooks(processor);
      CREATE INDEX IF NOT EXISTS idx_payment_webhooks_type ON payment_webhooks(type);
      CREATE INDEX IF NOT EXISTS idx_payment_webhooks_created_at ON payment_webhooks(created_at);
    `);

    // Tabela: payment_reconciliations
    db.exec(`
      CREATE TABLE IF NOT EXISTS payment_reconciliations (
        id TEXT PRIMARY KEY,
        transaction_id TEXT NOT NULL,
        invoice_id TEXT NOT NULL,
        processed_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'reconciled',
        discrepancy_reason TEXT,
        discrepancy_amount REAL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (transaction_id) REFERENCES payment_transactions(id),
        FOREIGN KEY (invoice_id) REFERENCES invoices(id)
      );
      CREATE INDEX IF NOT EXISTS idx_payment_reconciliations_status ON payment_reconciliations(status);
      CREATE INDEX IF NOT EXISTS idx_payment_reconciliations_processed_at ON payment_reconciliations(processed_at);
    `);

    // Tabela: invoices
    db.exec(`
      CREATE TABLE IF NOT EXISTS invoices (
        id TEXT PRIMARY KEY,
        invoice_number TEXT UNIQUE NOT NULL,
        user_id TEXT NOT NULL,
        amount REAL NOT NULL,
        currency TEXT NOT NULL DEFAULT 'BRL',
        status TEXT NOT NULL DEFAULT 'pending',
        due_date TEXT NOT NULL,
        description TEXT,
        notes TEXT,
        paid_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
      CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
      CREATE INDEX IF NOT EXISTS idx_invoices_due_date ON invoices(due_date);
    `);

    // Tabela: invoice_items
    db.exec(`
      CREATE TABLE IF NOT EXISTS invoice_items (
        id TEXT PRIMARY KEY,
        invoice_id TEXT NOT NULL,
        description TEXT NOT NULL,
        quantity INTEGER NOT NULL,
        unit_price REAL NOT NULL,
        total REAL NOT NULL,
        FOREIGN KEY (invoice_id) REFERENCES invoices(id)
      );
      CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
    `);

    // Tabela: payment_subscriptions
    db.exec(`
      CREATE TABLE IF NOT EXISTS payment_subscriptions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        plan_id TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        processor_subscription_id TEXT UNIQUE NOT NULL,
        current_period_start TEXT NOT NULL,
        current_period_end TEXT NOT NULL,
        canceled_at TEXT,
        cancel_reason TEXT,
        payment_method TEXT NOT NULL,
        processor TEXT NOT NULL,
        auto_renew INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id)
      );
      CREATE INDEX IF NOT EXISTS idx_payment_subscriptions_user_id ON payment_subscriptions(user_id);
      CREATE INDEX IF NOT EXISTS idx_payment_subscriptions_status ON payment_subscriptions(status);
    `);

    // Tabela: payment_plans
    db.exec(`
      CREATE TABLE IF NOT EXISTS payment_plans (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        amount REAL NOT NULL,
        currency TEXT NOT NULL DEFAULT 'BRL',
        interval TEXT NOT NULL,
        interval_count INTEGER NOT NULL DEFAULT 1,
        trial_period_days INTEGER,
        processor_plan_id TEXT UNIQUE NOT NULL,
        is_active INTEGER NOT NULL DEFAULT 1,
        features TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_payment_plans_is_active ON payment_plans(is_active);
    `);

    // Tabela: payment_audit_log
    db.exec(`
      CREATE TABLE IF NOT EXISTS payment_audit_log (
        id TEXT PRIMARY KEY,
        transaction_id TEXT,
        action TEXT NOT NULL,
        actor_id TEXT NOT NULL,
        details TEXT,
        created_at TEXT NOT NULL,
        FOREIGN KEY (transaction_id) REFERENCES payment_transactions(id)
      );
      CREATE INDEX IF NOT EXISTS idx_payment_audit_log_actor_id ON payment_audit_log(actor_id);
      CREATE INDEX IF NOT EXISTS idx_payment_audit_log_created_at ON payment_audit_log(created_at);
    `);

    logger.info('✓ Migração de Pagamento concluída (8 tabelas criadas)');
  } catch (error) {
    logger.error({ err: error }, 'Erro ao migrar tabelas de pagamento');
    throw error;
  }
}

// Executar migração se chamado diretamente
if (require.main === module) {
  migratePayments();
}

export default migratePayments;
