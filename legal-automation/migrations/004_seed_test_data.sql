-- UP: Seed test data for development and testing

-- Insert test clients
INSERT INTO crm_clients (id, name, email, phone, cpf, status, case_types, city, state, industry) VALUES
('client-001', 'João Silva', 'joao@example.com', '11987654321', '12345678901', 'customer', ARRAY['trabalhista', 'civil'], 'São Paulo', 'SP', 'Manufatura'),
('client-002', 'Maria Santos', 'maria@example.com', '11987654322', '12345678902', 'customer', ARRAY['familia', 'civil'], 'Rio de Janeiro', 'RJ', 'Varejo'),
('client-003', 'Empresa XYZ LTDA', 'contato@xyz.com', '1133334444', '12345678901234', 'customer', ARRAY['comercial', 'trabalhista'], 'Belo Horizonte', 'MG', 'Tecnologia'),
('client-004', 'Pedro Costa', 'pedro@example.com', '21987654323', '12345678903', 'prospect', ARRAY['criminal'], 'Brasília', 'DF', 'Consultoria'),
('client-005', 'Ana Oliveira', 'ana@example.com', '85987654324', '12345678904', 'lead', ARRAY['imobiliario'], 'Fortaleza', 'CE', 'Imóveis')
ON CONFLICT (email) DO NOTHING;

-- Insert test legal cases
INSERT INTO legal_cases (id, case_number, client_id, case_type, court_name, judge_name, process_number, status, outcome, success_rate, estimated_duration, filing_date, deadline_date, amount_claimed, lawyer_assigned) VALUES
('case-001', '0001234-56.2024.1.02.3500', 'client-001', 'trabalhista', 'TJ-SP', 'Juiz Carlos Mendes', '1234567890123456789', 'in_progress', NULL, 65.00, 180, '2024-01-15', '2024-07-15', 50000.00, 'Dr. Felipe Rocha'),
('case-002', '0002345-67.2024.8.04.7200', 'client-002', 'familia', 'TJ-RJ', 'Juiza Patricia Costa', '1234567890123456790', 'registered', NULL, 45.00, 240, '2024-02-01', '2024-08-01', 0.00, 'Dra. Mariana Gomes'),
('case-003', '0003456-78.2024.1.26.0100', 'client-003', 'comercial', 'TJ-MG', 'Juiz Ricardo Alves', '1234567890123456791', 'closed', 'favorable', 85.00, 120, '2023-12-10', '2024-04-10', 150000.00, 'Dr. André Silva'),
('case-004', '0004567-89.2024.1.01.3800', 'client-004', 'criminal', 'TJ-DF', 'Juiz Paulo Ferreira', '1234567890123456792', 'in_progress', NULL, 55.00, 200, '2024-01-20', '2024-07-20', 0.00, 'Dr. Bruno Castro'),
('case-005', '0005678-90.2024.8.07.0000', 'client-005', 'imobiliario', 'TJ-CE', 'Juiza Helena Martins', '1234567890123456793', 'registered', NULL, 70.00, 160, '2024-02-15', '2024-08-15', 200000.00, 'Dra. Fernanda Lima')
ON CONFLICT (case_number) DO NOTHING;

-- Insert test contracts
INSERT INTO contracts (id, client_id, title, description, content, status, version, signature_required, signed_at) VALUES
('contract-001', 'client-001', 'Contrato de Representação Legal', 'Contrato de prestação de serviços legais', 'CONTRATO DE REPRESENTAÇÃO LEGAL...', 'signed', 1, true, '2024-01-15 10:30:00'),
('contract-002', 'client-002', 'Procuração Específica', 'Procuração para atos específicos', 'PROCURAÇÃO ESPECÍFICA...', 'draft', 1, false, NULL),
('contract-003', 'client-003', 'Retainer Agreement', 'Contrato de retenção de serviços', 'RETAINER AGREEMENT...', 'signed', 2, true, '2023-12-20 14:00:00'),
('contract-004', 'client-004', 'Acordo de Confidencialidade', 'NDA entre partes', 'ACORDO DE CONFIDENCIALIDADE...', 'pending_signature', 1, true, NULL),
('contract-005', 'client-005', 'Contrato de Compra e Venda', 'Imóvel - Contrato de compra', 'CONTRATO DE COMPRA E VENDA...', 'review', 1, true, NULL)
ON CONFLICT DO NOTHING;

-- Insert test invoices
INSERT INTO financial_invoices (id, invoice_number, client_id, case_id, amount, amount_paid, status, due_date, issued_date, payment_method) VALUES
('invoice-001', 'NF-2024-001', 'client-001', 'case-001', 5000.00, 5000.00, 'paid', '2024-02-15', '2024-01-20', 'transferência'),
('invoice-002', 'NF-2024-002', 'client-002', 'case-002', 3500.00, 1750.00, 'partially_paid', '2024-03-15', '2024-02-01', 'cartão'),
('invoice-003', 'NF-2024-003', 'client-003', 'case-003', 15000.00, 0.00, 'overdue', '2024-02-28', '2024-01-15', NULL),
('invoice-004', 'NF-2024-004', 'client-004', 'case-004', 2500.00, 0.00, 'sent', '2024-03-20', '2024-02-20', NULL),
('invoice-005', 'NF-2024-005', 'client-005', 'case-005', 8000.00, 8000.00, 'paid', '2024-03-31', '2024-02-28', 'boleto')
ON CONFLICT (invoice_number) DO NOTHING;

-- Insert test intimations
INSERT INTO intimations (id, case_id, document_type, title, received_date, deadline_date, notification_method, sender_name) VALUES
('intimation-001', 'case-001', 'Audiência', 'Intimação para Audiência de Instrução', '2024-02-10 09:00:00', '2024-03-10 23:59:59', 'Eletrônica', 'Tribunal de Justiça SP'),
('intimation-002', 'case-002', 'Petição', 'Intimação da Petição Inicial', '2024-02-20 10:30:00', '2024-03-20 23:59:59', 'Pessoalmente', 'Cartório'),
('intimation-003', 'case-003', 'Sentença', 'Intimação da Sentença', '2024-02-01 14:00:00', '2024-02-15 23:59:59', 'Eletrônica', 'Tribunal de Justiça MG'),
('intimation-004', 'case-004', 'Despacho', 'Despacho do Juiz', '2024-02-15 11:15:00', '2024-03-01 23:59:59', 'Email', 'Protocolo Eletrônico'),
('intimation-005', 'case-005', 'Recurso', 'Prazo para Apresentação de Recurso', '2024-02-20 16:45:00', '2024-03-10 23:59:59', 'Eletrônica', 'Tribunal de Justiça CE')
ON CONFLICT DO NOTHING;

-- Insert test court analytics
INSERT INTO court_analytics (id, court_name, total_cases, favorable_cases, unfavorable_cases, success_rate, avg_duration_days, avg_case_value) VALUES
('analytics-tj-sp', 'TJ-SP', 5000, 3500, 1500, 70.00, 180, 85000.00),
('analytics-tj-rj', 'TJ-RJ', 3800, 2470, 1330, 65.00, 210, 95000.00),
('analytics-tj-mg', 'TJ-MG', 2900, 2030, 870, 70.00, 165, 75000.00),
('analytics-tj-df', 'TJ-DF', 1500, 900, 600, 60.00, 240, 65000.00),
('analytics-tj-ce', 'TJ-CE', 1200, 720, 480, 60.00, 220, 55000.00)
ON CONFLICT (court_name) DO NOTHING;

-- Insert test lawyer performance
INSERT INTO lawyer_performance (id, lawyer_name, total_cases, cases_won, cases_lost, win_rate, active_cases, experience_years) VALUES
('lawyer-001', 'Dr. Felipe Rocha', 45, 32, 13, 71.11, 5, 12),
('lawyer-002', 'Dra. Mariana Gomes', 38, 22, 16, 57.89, 8, 8),
('lawyer-003', 'Dr. André Silva', 52, 41, 11, 78.85, 3, 15),
('lawyer-004', 'Dr. Bruno Castro', 28, 15, 13, 53.57, 6, 6),
('lawyer-005', 'Dra. Fernanda Lima', 35, 26, 9, 74.29, 4, 10)
ON CONFLICT (lawyer_name) DO NOTHING;

-- Insert test case analytics
INSERT INTO case_analytics (id, case_id, success_rate, avg_duration_days, favorable_outcomes, unfavorable_outcomes, settled_outcomes, predicted_outcome, prediction_confidence) VALUES
('analytics-case-001', 'case-001', 65.00, 180, 0, 0, 0, 'favorable', 72.50),
('analytics-case-002', 'case-002', 45.00, 240, 0, 0, 0, 'unfavorable', 58.30),
('analytics-case-003', 'case-003', 85.00, 120, 1, 0, 0, 'favorable', 95.40),
('analytics-case-004', 'case-004', 55.00, 200, 0, 0, 0, 'settlement', 61.20),
('analytics-case-005', 'case-005', 70.00, 160, 0, 0, 0, 'favorable', 77.80)
ON CONFLICT DO NOTHING;

-- Insert test audit logs
INSERT INTO audit_logs (id, user_id, action, entity_type, entity_id, status) VALUES
('audit-001', 'user-admin', 'CREATE', 'Client', 'client-001', 'success'),
('audit-002', 'user-admin', 'CREATE', 'Case', 'case-001', 'success'),
('audit-003', 'user-lawyer-001', 'UPDATE', 'Case', 'case-001', 'success'),
('audit-004', 'user-admin', 'CREATE', 'Invoice', 'invoice-001', 'success'),
('audit-005', 'user-admin', 'UPDATE', 'Invoice', 'invoice-001', 'success')
ON CONFLICT DO NOTHING;

-- DOWN: Delete all seed data
-- DELETE FROM audit_logs WHERE id LIKE 'audit-%';
-- DELETE FROM case_analytics WHERE id LIKE 'analytics-case-%';
-- DELETE FROM lawyer_performance WHERE id LIKE 'lawyer-%';
-- DELETE FROM court_analytics WHERE id LIKE 'analytics-%';
-- DELETE FROM intimations WHERE id LIKE 'intimation-%';
-- DELETE FROM financial_invoices WHERE id LIKE 'invoice-%';
-- DELETE FROM contracts WHERE id LIKE 'contract-%';
-- DELETE FROM legal_cases WHERE id LIKE 'case-%';
-- DELETE FROM crm_clients WHERE id LIKE 'client-%';
