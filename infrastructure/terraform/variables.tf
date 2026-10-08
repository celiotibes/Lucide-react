# ============================================================================
# Terraform Variables - Phase 22.23: Disaster Recovery Automation
# ============================================================================

variable "environment" {
  description = "Environment name (dev, staging, production)"
  type        = string
  default     = "production"

  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Environment must be one of: dev, staging, production"
  }
}

# ============================================================================
# AWS Configuration
# ============================================================================

variable "aws_primary_region" {
  description = "AWS primary region for disaster recovery infrastructure"
  type        = string
  default     = "us-east-1"
}

variable "aws_secondary_region" {
  description = "AWS secondary region for backup replication"
  type        = string
  default     = "us-west-2"
}

variable "db_subnet_ids" {
  description = "Subnet IDs for RDS database"
  type        = list(string)
}

variable "db_instance_class" {
  description = "RDS instance class"
  type        = string
  default     = "db.t4g.medium"
}

# ============================================================================
# GCP Configuration
# ============================================================================

variable "gcp_project_id" {
  description = "GCP project ID for backup storage"
  type        = string
}

variable "gcp_primary_region" {
  description = "GCP primary region"
  type        = string
  default     = "us-central1"
}

variable "gcs_backup_bucket_name" {
  description = "GCS bucket name for backups"
  type        = string
  default     = "lucide-crmt-backups"
}

# ============================================================================
# Azure Configuration
# ============================================================================

variable "azure_subscription_id" {
  description = "Azure subscription ID"
  type        = string
}

variable "azure_resource_group" {
  description = "Azure resource group name"
  type        = string
  default     = "lucide-crmt-dr"
}

variable "azure_location" {
  description = "Azure region for resources"
  type        = string
  default     = "East US"
}

# ============================================================================
# Backup Configuration
# ============================================================================

variable "backup_enabled" {
  description = "Enable automated backups"
  type        = bool
  default     = true
}

variable "backup_schedule_hourly" {
  description = "Cron schedule for hourly backups"
  type        = string
  default     = "cron(0 * * * ? *)"
}

variable "backup_schedule_daily" {
  description = "Cron schedule for daily full backups"
  type        = string
  default     = "cron(0 2 * * ? *)"
}

variable "backup_schedule_weekly" {
  description = "Cron schedule for weekly backups"
  type        = string
  default     = "cron(0 3 ? * SUN *)"
}

variable "backup_retention_hourly_days" {
  description = "Retention period for hourly backups (days)"
  type        = number
  default     = 7

  validation {
    condition     = var.backup_retention_hourly_days >= 1 && var.backup_retention_hourly_days <= 365
    error_message = "Retention period must be between 1 and 365 days"
  }
}

variable "backup_retention_daily_days" {
  description = "Retention period for daily backups (days)"
  type        = number
  default     = 30

  validation {
    condition     = var.backup_retention_daily_days >= 1 && var.backup_retention_daily_days <= 3650
    error_message = "Retention period must be between 1 and 3650 days"
  }
}

variable "backup_retention_monthly_days" {
  description = "Retention period for monthly backups (days)"
  type        = number
  default     = 90

  validation {
    condition     = var.backup_retention_monthly_days >= 1 && var.backup_retention_monthly_days <= 3650
    error_message = "Retention period must be between 1 and 3650 days"
  }
}

# ============================================================================
# Recovery Configuration
# ============================================================================

variable "rto_seconds" {
  description = "Recovery Time Objective in seconds"
  type        = number
  default     = 3600  # 1 hour

  validation {
    condition     = var.rto_seconds >= 60 && var.rto_seconds <= 86400
    error_message = "RTO must be between 60 seconds and 24 hours"
  }
}

variable "rpo_seconds" {
  description = "Recovery Point Objective in seconds"
  type        = number
  default     = 3600  # 1 hour

  validation {
    condition     = var.rpo_seconds >= 60 && var.rpo_seconds <= 86400
    error_message = "RPO must be between 60 seconds and 24 hours"
  }
}

variable "auto_failover_enabled" {
  description = "Enable automatic failover on health check failure"
  type        = bool
  default     = true
}

variable "failover_health_check_interval" {
  description = "Health check interval in seconds"
  type        = number
  default     = 30

  validation {
    condition     = var.failover_health_check_interval >= 5 && var.failover_health_check_interval <= 300
    error_message = "Health check interval must be between 5 and 300 seconds"
  }
}

variable "failover_failure_threshold" {
  description = "Number of consecutive failures before triggering failover"
  type        = number
  default     = 3

  validation {
    condition     = var.failover_failure_threshold >= 1 && var.failover_failure_threshold <= 10
    error_message = "Failure threshold must be between 1 and 10"
  }
}

# ============================================================================
# Encryption Configuration
# ============================================================================

variable "encryption_enabled" {
  description = "Enable encryption for backups"
  type        = bool
  default     = true
}

variable "kms_key_rotation_enabled" {
  description = "Enable automatic KMS key rotation"
  type        = bool
  default     = true
}

# ============================================================================
# Replication Configuration
# ============================================================================

variable "replication_enabled" {
  description = "Enable cross-region replication"
  type        = bool
  default     = true
}

variable "replication_target_regions" {
  description = "List of regions for backup replication"
  type        = list(string)
  default     = ["us-west-2", "eu-west-1"]
}

variable "replication_lag_threshold_minutes" {
  description = "Alert threshold for replication lag (minutes)"
  type        = number
  default     = 15
}

# ============================================================================
# Notification Configuration
# ============================================================================

variable "alert_email" {
  description = "Email address for disaster recovery alerts"
  type        = string
  default     = ""
}

variable "alert_email_backup_failure" {
  description = "Email address for backup failure alerts"
  type        = string
  default     = ""
}

variable "alert_slack_webhook" {
  description = "Slack webhook URL for disaster recovery alerts"
  type        = string
  default     = ""
  sensitive   = true
}

variable "alert_pagerduty_integration_key" {
  description = "PagerDuty integration key for critical alerts"
  type        = string
  default     = ""
  sensitive   = true
}

# ============================================================================
# DR Drill Configuration
# ============================================================================

variable "dr_drill_schedule" {
  description = "Cron schedule for automated DR drills"
  type        = string
  default     = "cron(0 2 1 * ? *)"  # First day of month at 2 AM
}

variable "dr_drill_enabled" {
  description = "Enable automated DR drills"
  type        = bool
  default     = true
}

variable "dr_drill_validate_restore" {
  description = "Validate restore during DR drills"
  type        = bool
  default     = true
}

# ============================================================================
# Monitoring Configuration
# ============================================================================

variable "cloudwatch_log_retention_days" {
  description = "CloudWatch log retention period (days)"
  type        = number
  default     = 30

  validation {
    condition     = contains([1, 3, 5, 7, 14, 30, 60, 90, 120, 150, 180, 365, 400, 545, 731, 1827, 3653], var.cloudwatch_log_retention_days)
    error_message = "Log retention must be a valid CloudWatch value"
  }
}

variable "enable_performance_insights" {
  description = "Enable RDS Performance Insights"
  type        = bool
  default     = true
}

variable "enable_enhanced_monitoring" {
  description = "Enable RDS Enhanced Monitoring"
  type        = bool
  default     = true
}

variable "monitoring_metric_alarm_enabled" {
  description = "Enable CloudWatch alarms for monitoring"
  type        = bool
  default     = true
}

# ============================================================================
# Tagging Configuration
# ============================================================================

variable "common_tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
  default = {
    Project     = "lucide-crmt"
    Phase       = "22.23"
    Component   = "disaster-recovery"
    ManagedBy   = "Terraform"
  }
}

# ============================================================================
# VPC Configuration (optional)
# ============================================================================

variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "enable_vpc_endpoint_s3" {
  description = "Create VPC endpoint for S3"
  type        = bool
  default     = true
}

variable "enable_vpc_endpoint_kms" {
  description = "Create VPC endpoint for KMS"
  type        = bool
  default     = true
}

# ============================================================================
# Cost Optimization
# ============================================================================

variable "use_spot_instances" {
  description = "Use spot instances for non-critical workloads"
  type        = bool
  default     = false
}

variable "storage_optimization_enabled" {
  description = "Enable storage optimization (compression, deduplication)"
  type        = bool
  default     = true
}

# ============================================================================
# Compliance & Security
# ============================================================================

variable "enable_audit_logging" {
  description = "Enable AWS CloudTrail for audit logging"
  type        = bool
  default     = true
}

variable "require_mfa_for_sensitive_operations" {
  description = "Require MFA for sensitive operations"
  type        = bool
  default     = true
}

variable "minimum_tls_version" {
  description = "Minimum TLS version for encrypted communications"
  type        = string
  default     = "1.2"
}
