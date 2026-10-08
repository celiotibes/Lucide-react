# ============================================================================
# Production Terraform Variables
# Phase 22.23 - Disaster Recovery Automation
# ============================================================================

environment = "production"

# ============================================================================
# AWS Configuration
# ============================================================================

aws_primary_region   = "us-east-1"
aws_secondary_region = "us-west-2"

# Database subnets (must exist in your VPC)
db_subnet_ids = [
  "subnet-0123456789abcdef0",
  "subnet-0abcdef0123456789"
]

db_instance_class = "db.r6g.xlarge"

# ============================================================================
# GCP Configuration
# ============================================================================

gcp_project_id      = "lucide-crmt-prod"
gcp_primary_region  = "us-central1"
gcs_backup_bucket_name = "lucide-crmt-backups"

# ============================================================================
# Azure Configuration
# ============================================================================

azure_subscription_id = "00000000-0000-0000-0000-000000000000"
azure_resource_group  = "lucide-crmt-dr"
azure_location        = "East US"

# ============================================================================
# Backup Configuration
# ============================================================================

backup_enabled              = true
backup_schedule_hourly      = "cron(0 * * * ? *)"      # Every hour
backup_schedule_daily       = "cron(0 2 * * ? *)"      # 2 AM UTC daily
backup_schedule_weekly      = "cron(0 3 ? * SUN *)"    # 3 AM UTC Sunday

backup_retention_hourly_days   = 7
backup_retention_daily_days    = 30
backup_retention_monthly_days  = 90

# ============================================================================
# Recovery Configuration (RTO/RPO)
# ============================================================================

rto_seconds = 3600    # 1 hour
rpo_seconds = 3600    # 1 hour

auto_failover_enabled              = true
failover_health_check_interval      = 30   # seconds
failover_failure_threshold          = 3    # consecutive failures

# ============================================================================
# Encryption & Security
# ============================================================================

encryption_enabled       = true
kms_key_rotation_enabled = true

# ============================================================================
# Replication Configuration
# ============================================================================

replication_enabled            = true
replication_target_regions     = ["us-west-2", "eu-west-1"]
replication_lag_threshold_minutes = 15

# ============================================================================
# Notifications
# ============================================================================

alert_email = "devops@example.com"
alert_email_backup_failure = "backups@example.com"
alert_slack_webhook = "https://hooks.slack.com/services/YOUR/WEBHOOK/URL"
alert_pagerduty_integration_key = ""  # Set in secrets manager

# ============================================================================
# DR Drill Configuration
# ============================================================================

dr_drill_schedule          = "cron(0 2 1 * ? *)"  # 1st day of month, 2 AM UTC
dr_drill_enabled           = true
dr_drill_validate_restore  = true

# ============================================================================
# Monitoring Configuration
# ============================================================================

cloudwatch_log_retention_days = 30
enable_performance_insights   = true
enable_enhanced_monitoring    = true
monitoring_metric_alarm_enabled = true

# ============================================================================
# VPC Configuration
# ============================================================================

vpc_cidr               = "10.0.0.0/16"
private_subnet_cidrs   = ["10.0.1.0/24", "10.0.2.0/24"]
enable_vpc_endpoint_s3 = true
enable_vpc_endpoint_kms = true

# ============================================================================
# Cost Optimization
# ============================================================================

use_spot_instances           = false
storage_optimization_enabled = true

# ============================================================================
# Compliance & Security
# ============================================================================

enable_audit_logging                 = true
require_mfa_for_sensitive_operations = true
minimum_tls_version                 = "1.2"

# ============================================================================
# Common Tags
# ============================================================================

common_tags = {
  Project      = "lucide-crmt"
  Phase        = "22.23"
  Component    = "disaster-recovery"
  ManagedBy    = "Terraform"
  Environment  = "production"
  CostCenter   = "infrastructure"
  Owner        = "devops-team"
  DataClass    = "confidential"
}
