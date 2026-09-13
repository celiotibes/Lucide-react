/**
 * Migration: Add UNIQUE constraint to faturas table
 *
 * Purpose: Prevent duplicate invoice generation for the same contract month
 *
 * Scenario prevented:
 * - Two simultaneous cron jobs both create invoice for contrato_id=123, mês 2024-09
 * - Database constraint ensures only one invoice per (contrato_id, competencia)
 *
 * Status: READY FOR PRODUCTION
 */

-- Add UNIQUE constraint to prevent duplicate faturas
-- A fatura is uniquely identified by the combination of contrato_id and competencia (month)
ALTER TABLE faturas
ADD CONSTRAINT uk_faturas_contrato_competencia
UNIQUE (contrato_id, competencia);

-- Index for foreign key performance (if not already present)
-- CREATE INDEX IF NOT EXISTS idx_faturas_contrato_id ON faturas(contrato_id);

/**
 * Validation:
 * After applying this migration, verify:
 * 1. No existing duplicate (contrato_id, competencia) pairs
 *    SELECT contrato_id, competencia, COUNT(*) as cnt
 *    FROM faturas
 *    GROUP BY contrato_id, competencia
 *    HAVING COUNT(*) > 1;
 *
 * 2. Constraint is active:
 *    SELECT constraint_name FROM information_schema.table_constraints
 *    WHERE table_name = 'faturas'
 *    AND constraint_type = 'UNIQUE';
 *
 * Rollback (if needed):
 * ALTER TABLE faturas DROP CONSTRAINT uk_faturas_contrato_competencia;
 */

/**
 * Application Changes Required:
 *
 * When inserting a fatura, handle duplicate gracefully:
 *
 *    try {
 *      await pool.query(
 *        'INSERT INTO faturas (contrato_id, competencia, ...) VALUES (...)',
 *        [contratoId, competencia, ...]
 *      );
 *    } catch (error) {
 *      if (error.code === '23505') { // Unique violation
 *        console.log(`Fatura já existe para ${contratoId} - ${competencia}`);
 *        // Query existing fatura instead
 *        const { rows } = await pool.query(
 *          'SELECT * FROM faturas WHERE contrato_id = $1 AND competencia = $2',
 *          [contratoId, competencia]
 *        );
 *        return rows[0];
 *      }
 *      throw error;
 *    }
 */

/**
 * Testing:
 *
 * 1. Unit Test - Verify constraint is enforced
 *    INSERT INTO faturas (contrato_id, competencia, ...) VALUES (1, '2024-09', ...);
 *    INSERT INTO faturas (contrato_id, competencia, ...) VALUES (1, '2024-09', ...);
 *    -- Second insert should fail with error code 23505
 *
 * 2. Integration Test - Verify cron handles duplicate
 *    Run gerar-fatura-mensal twice in succession
 *    Both should complete successfully
 *    Second run should detect existing fatura and skip
 *
 * 3. Load Test - Verify race condition is prevented
 *    Simulate two concurrent gerar-fatura-mensal calls
 *    Only one should succeed in creating fatura
 *    Application should handle 23505 error gracefully
 */
