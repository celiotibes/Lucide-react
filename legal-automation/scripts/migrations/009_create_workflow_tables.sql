-- Phase 20: Customizable Approval Workflows Tables

-- Create workflow_templates table
CREATE TABLE IF NOT EXISTS workflow_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,
  name VARCHAR(500) NOT NULL,
  description TEXT,
  trigger_type VARCHAR(100) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  template_version INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_workflow_templates_user_id ON workflow_templates(user_id);
CREATE INDEX idx_workflow_templates_active ON workflow_templates(is_active);
CREATE INDEX idx_workflow_templates_trigger_type ON workflow_templates(trigger_type);

-- Create workflow_steps table
CREATE TABLE IF NOT EXISTS workflow_steps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_template_id UUID NOT NULL,
  step_order INTEGER NOT NULL,
  step_type VARCHAR(100) NOT NULL,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  approver_id VARCHAR(255),
  approver_role VARCHAR(100),
  timeout_days INTEGER,
  auto_approve_on_timeout BOOLEAN DEFAULT FALSE,
  conditions JSONB DEFAULT '{}'::jsonb,
  actions JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workflow_template_id) REFERENCES workflow_templates(id) ON DELETE CASCADE
);

CREATE INDEX idx_workflow_steps_template_id ON workflow_steps(workflow_template_id);
CREATE INDEX idx_workflow_steps_order ON workflow_steps(workflow_template_id, step_order);

-- Create workflow_instances table
CREATE TABLE IF NOT EXISTS workflow_instances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_template_id UUID NOT NULL,
  case_id VARCHAR(255) NOT NULL,
  user_id VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  current_step_id UUID,
  started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  rejected_at TIMESTAMP,
  rejection_reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  FOREIGN KEY (workflow_template_id) REFERENCES workflow_templates(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (current_step_id) REFERENCES workflow_steps(id) ON DELETE SET NULL
);

CREATE INDEX idx_workflow_instances_template_id ON workflow_instances(workflow_template_id);
CREATE INDEX idx_workflow_instances_case_id ON workflow_instances(case_id);
CREATE INDEX idx_workflow_instances_user_id ON workflow_instances(user_id);
CREATE INDEX idx_workflow_instances_status ON workflow_instances(status);
CREATE INDEX idx_workflow_instances_current_step ON workflow_instances(current_step_id);

-- Create workflow_approvals table
CREATE TABLE IF NOT EXISTS workflow_approvals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_instance_id UUID NOT NULL,
  step_id UUID NOT NULL,
  approver_id VARCHAR(255) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  comment TEXT,
  decision_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workflow_instance_id) REFERENCES workflow_instances(id) ON DELETE CASCADE,
  FOREIGN KEY (step_id) REFERENCES workflow_steps(id) ON DELETE CASCADE,
  FOREIGN KEY (approver_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_workflow_approvals_instance_id ON workflow_approvals(workflow_instance_id);
CREATE INDEX idx_workflow_approvals_step_id ON workflow_approvals(step_id);
CREATE INDEX idx_workflow_approvals_approver_id ON workflow_approvals(approver_id);
CREATE INDEX idx_workflow_approvals_status ON workflow_approvals(status);

-- Create workflow_audit_log table
CREATE TABLE IF NOT EXISTS workflow_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_instance_id UUID NOT NULL,
  actor_id VARCHAR(255) NOT NULL,
  action_type VARCHAR(100) NOT NULL,
  action_details TEXT,
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workflow_instance_id) REFERENCES workflow_instances(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_workflow_audit_log_instance_id ON workflow_audit_log(workflow_instance_id);
CREATE INDEX idx_workflow_audit_log_action_type ON workflow_audit_log(action_type);
CREATE INDEX idx_workflow_audit_log_timestamp ON workflow_audit_log(timestamp);

-- Create workflow_conditions table (for complex logic)
CREATE TABLE IF NOT EXISTS workflow_conditions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  step_id UUID NOT NULL,
  condition_type VARCHAR(100) NOT NULL,
  field_name VARCHAR(255),
  operator VARCHAR(50),
  value TEXT,
  logic_operator VARCHAR(10) DEFAULT 'AND',
  FOREIGN KEY (step_id) REFERENCES workflow_steps(id) ON DELETE CASCADE
);

CREATE INDEX idx_workflow_conditions_step_id ON workflow_conditions(step_id);

-- Create workflow_notifications table
CREATE TABLE IF NOT EXISTS workflow_notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_instance_id UUID NOT NULL,
  recipient_id VARCHAR(255) NOT NULL,
  notification_type VARCHAR(100) NOT NULL,
  notification_status VARCHAR(50) DEFAULT 'pending',
  sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (workflow_instance_id) REFERENCES workflow_instances(id) ON DELETE CASCADE,
  FOREIGN KEY (recipient_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_workflow_notifications_instance_id ON workflow_notifications(workflow_instance_id);
CREATE INDEX idx_workflow_notifications_recipient_id ON workflow_notifications(recipient_id);
CREATE INDEX idx_workflow_notifications_status ON workflow_notifications(notification_status);

-- Create workflow_escalations table
CREATE TABLE IF NOT EXISTS workflow_escalations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_instance_id UUID NOT NULL,
  step_id UUID NOT NULL,
  escalation_level INTEGER NOT NULL,
  escalated_to_id VARCHAR(255) NOT NULL,
  escalation_reason VARCHAR(500),
  escalated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP,
  FOREIGN KEY (workflow_instance_id) REFERENCES workflow_instances(id) ON DELETE CASCADE,
  FOREIGN KEY (step_id) REFERENCES workflow_steps(id) ON DELETE CASCADE,
  FOREIGN KEY (escalated_to_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX idx_workflow_escalations_instance_id ON workflow_escalations(workflow_instance_id);
CREATE INDEX idx_workflow_escalations_step_id ON workflow_escalations(step_id);
CREATE INDEX idx_workflow_escalations_escalated_to ON workflow_escalations(escalated_to_id);

-- Create trigger to update workflow_templates.updated_at
CREATE OR REPLACE FUNCTION update_workflow_templates_timestamp()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workflow_templates_updated_at_trigger
BEFORE UPDATE ON workflow_templates
FOR EACH ROW
EXECUTE FUNCTION update_workflow_templates_timestamp();

-- Create function to auto-complete workflow when all steps approved
CREATE OR REPLACE FUNCTION check_workflow_completion()
RETURNS TRIGGER AS $$
DECLARE
  pending_approvals INT;
BEGIN
  SELECT COUNT(*) INTO pending_approvals
  FROM workflow_approvals
  WHERE workflow_instance_id = NEW.workflow_instance_id
  AND status = 'pending';

  IF pending_approvals = 0 THEN
    UPDATE workflow_instances
    SET status = 'approved', completed_at = CURRENT_TIMESTAMP
    WHERE id = NEW.workflow_instance_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workflow_approval_completion_trigger
AFTER UPDATE ON workflow_approvals
FOR EACH ROW
WHEN (NEW.status != 'pending')
EXECUTE FUNCTION check_workflow_completion();

-- Create function to log workflow audit trail
CREATE OR REPLACE FUNCTION log_workflow_action()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO workflow_audit_log (workflow_instance_id, actor_id, action_type, action_details)
  VALUES (
    NEW.id,
    COALESCE(current_setting('app.user_id', true)::varchar, 'system'),
    TG_ARGV[0],
    jsonb_pretty(row_to_json(NEW)::jsonb)
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER workflow_instance_audit_trigger
AFTER INSERT OR UPDATE ON workflow_instances
FOR EACH ROW
EXECUTE FUNCTION log_workflow_action('workflow_update');

CREATE TRIGGER workflow_approval_audit_trigger
AFTER INSERT OR UPDATE ON workflow_approvals
FOR EACH ROW
EXECUTE FUNCTION log_workflow_action('approval_decision');
