# Migrations PostgreSQL - ERP Lucide React

Sistema de migrações para o banco de dados PostgreSQL do ERP.

## Estrutura

Cada migração é um arquivo SQL nomeado sequencialmente:
- `001_create_apontamento_prestador_schema.sql` - Schema para Apontamento do Prestador (Sprint 2)

## Como usar

### Desenvolvimento local

```bash
# Aplicar todas as migrations pendentes
psql -U usuario -d database -f migrations/001_create_apontamento_prestador_schema.sql

# Ou conectar interativamente
psql -U usuario -d database
\i migrations/001_create_apontamento_prestador_schema.sql
```

### Produção

Use uma ferramenta de migração como:
- **Flyway**: `flyway migrate`
- **Liquibase**: `liquibase update`
- **Node.js**: `node-migrate` ou similar

Ou manualmente (com cuidado):
```bash
psql -U usuario -h host -d database -f migrations/001_create_apontamento_prestador_schema.sql
```

## Tabelas criadas na Migration 001

### Módulo Apontamento do Prestador

1. **apontamentos_diarios**: Registros diários de entrada/saída
2. **historico_horarios**: Histórico de eventos com rastreamento
3. **itens_remuneraveis**: Componentes de remuneração (diária, Airbnb, urgência, etc.)
4. **movimentacoes_financeiras**: Vales, empréstimos, adiantamentos
5. **fechamentos_semanais**: Consolidações semanais
6. **emprestimos**: Contratos de empréstimo com juros
7. **retificacoes**: Auditoria de alterações
8. **parametros_operacionais**: Parâmetros de cálculo (combustível, tabelas)

## Integração com Ledger

Todas as operações geram lançamentos automáticos no ledger (`ledger_entries`):

- **origem_modulo**: `"apontamento-prestador"`
- **origem_id**: ID da entidade correspondente (apontamento_id, emprestimo_id, etc.)

Contas contábeis utilizadas:

- `5.1.01` - Despesa com Remuneração de Prestadores
- `3.1.05` - Remuneração de Prestador a Pagar
- `2.1.02` - Empréstimos a Pagar
- `5.3.01` - Despesa com Juros
- `1.1.01` - Caixa

## Índices para Performance

Criados para otimizar queries comuns:

- Prestador + Data (apontamentos)
- Status (apontamentos, fechamentos, empréstimos)
- Apontamento_id (histórico, itens, movimentações)
- Tipo de rubrica/movimentação
- Vigência de parâmetros

## Restrições e Validações

- **UNIQUE**: Um apontamento por prestador por dia
- **UNIQUE**: Um empréstimo por prestador/data_contratacao
- **CHECK**: Status enumerados validados em nível de banco
- **FOREIGN KEY**: Integridade referencial com CASCADE on DELETE

## Rollback

Para desfazer a migration:

```sql
DROP INDEX idx_parametros_operacionais_parametro;
DROP INDEX idx_retificacoes_autor;
DROP INDEX idx_retificacoes_apontamento;
DROP INDEX idx_emprestimos_status;
DROP INDEX idx_emprestimos_prestador;
DROP INDEX idx_fechamentos_status;
DROP INDEX idx_fechamentos_prestador_data;
DROP INDEX idx_movimentacoes_apontamento;
DROP INDEX idx_itens_remuneraveis_tipo;
DROP INDEX idx_itens_remuneraveis_apontamento;
DROP INDEX idx_historico_horarios_apontamento;
DROP INDEX idx_apontamentos_status;
DROP INDEX idx_apontamentos_prestador_data;

DROP TABLE parametros_operacionais;
DROP TABLE retificacoes;
DROP TABLE emprestimos;
DROP TABLE fechamentos_semanais;
DROP TABLE movimentacoes_financeiras;
DROP TABLE itens_remuneraveis;
DROP TABLE historico_horarios;
DROP TABLE apontamentos_diarios;
```

## Notas

- Todas as colunas de timestamp usam `CURRENT_TIMESTAMP` como default
- IDs utilizam `UUID` com `gen_random_uuid()` como padrão
- Soft deletes não implementados (usa CASCADE on DELETE)
- Plano de contas (contas_plano_contas) deve ser pré-populado antes de criar lançamentos
