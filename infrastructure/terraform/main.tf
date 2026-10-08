# ============================================================================
# Terraform Configuration - Phase 22.23: Disaster Recovery Automation
# Multi-region deployment with automated failover and backup infrastructure
# ============================================================================

terraform {
  required_version = ">= 1.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 3.0"
    }
  }

  # Backend for state management
  backend "s3" {
    bucket         = "lucide-crmt-terraform-state"
    key            = "disaster-recovery/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-locks"
  }
}

# ============================================================================
# Provider Configuration
# ============================================================================

provider "aws" {
  region = var.aws_primary_region

  default_tags {
    tags = {
      Environment = var.environment
      Project     = "lucide-crmt"
      Phase       = "22.23"
      Component   = "disaster-recovery"
      ManagedBy   = "Terraform"
      CreatedAt   = timestamp()
    }
  }
}

provider "aws" {
  alias  = "secondary"
  region = var.aws_secondary_region

  default_tags {
    tags = {
      Environment = var.environment
      Project     = "lucide-crmt"
      Phase       = "22.23"
      Role        = "secondary"
    }
  }
}

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_primary_region
}

provider "azurerm" {
  features {
    key_vault {
      recover_soft_deleted_key_vaults = true
    }
  }

  subscription_id = var.azure_subscription_id
}

# ============================================================================
# Local Variables
# ============================================================================

locals {
  common_tags = {
    Environment = var.environment
    Project     = "lucide-crmt"
    Phase       = "22.23"
    Component   = "disaster-recovery"
  }

  backup_retention_days = {
    hourly  = 7
    daily   = 30
    monthly = 90
  }
}

# ============================================================================
# AWS Primary Region Resources
# ============================================================================

# S3 Bucket for Primary Region Backups
resource "aws_s3_bucket" "backup_primary" {
  bucket = "lucide-crmt-backups-${var.aws_primary_region}-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_versioning" "backup_primary" {
  bucket = aws_s3_bucket.backup_primary.id

  versioning_configuration {
    status     = "Enabled"
    mfa_delete = "Disabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "backup_primary" {
  bucket = aws_s3_bucket.backup_primary.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm     = "aws:kms"
      kms_master_key_id = aws_kms_key.backup.arn
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_public_access_block" "backup_primary" {
  bucket = aws_s3_bucket.backup_primary.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_lifecycle_configuration" "backup_primary" {
  bucket = aws_s3_bucket.backup_primary.id

  rule {
    id     = "hourly-retention"
    status = "Enabled"

    filter {
      prefix = "backups/hourly/"
    }

    expiration {
      days = local.backup_retention_days.hourly
    }
  }

  rule {
    id     = "daily-retention"
    status = "Enabled"

    filter {
      prefix = "backups/daily/"
    }

    expiration {
      days = local.backup_retention_days.daily
    }
  }

  rule {
    id     = "monthly-retention"
    status = "Enabled"

    filter {
      prefix = "backups/monthly/"
    }

    expiration {
      days = local.backup_retention_days.monthly
    }
  }

  rule {
    id     = "transition-to-glacier"
    status = "Enabled"

    filter {}

    transitions {
      days          = 30
      storage_class = "GLACIER"
    }
  }
}

# AWS Secondary Region Backup Bucket (Replication)
resource "aws_s3_bucket" "backup_secondary" {
  provider = aws.secondary
  bucket   = "lucide-crmt-backups-${var.aws_secondary_region}-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_versioning" "backup_secondary" {
  provider = aws.secondary
  bucket   = aws_s3_bucket.backup_secondary.id

  versioning_configuration {
    status = "Enabled"
  }
}

# S3 Replication Configuration
resource "aws_s3_bucket_replication_configuration" "backup_replication" {
  depends_on = [aws_s3_bucket_versioning.backup_primary]

  bucket = aws_s3_bucket.backup_primary.id
  role   = aws_iam_role.s3_replication.arn

  rule {
    id     = "replicate-backups"
    status = "Enabled"

    priority = 1

    filter {
      prefix = "backups/"
    }

    destination {
      bucket       = aws_s3_bucket.backup_secondary.arn
      storage_class = "STANDARD_IA"

      replication_time {
        status = "Enabled"
        time {
          minutes = 15
        }
      }

      metrics {
        status = "Enabled"
        event_threshold {
          minutes = 15
        }
      }
    }
  }
}

# ============================================================================
# KMS Encryption Keys
# ============================================================================

resource "aws_kms_key" "backup" {
  description             = "KMS key for backup encryption"
  deletion_window_in_days = 10
  enable_key_rotation     = true

  tags = local.common_tags
}

resource "aws_kms_alias" "backup" {
  name          = "alias/lucide-crmt-backup"
  target_key_id = aws_kms_key.backup.key_id
}

# ============================================================================
# RDS for Production Database
# ============================================================================

resource "aws_db_subnet_group" "primary" {
  name       = "lucide-crmt-db-subnet"
  subnet_ids = var.db_subnet_ids

  tags = local.common_tags
}

resource "aws_rds_cluster" "primary" {
  cluster_identifier              = "lucide-crmt-primary"
  engine                          = "aurora-postgresql"
  engine_version                  = "15.2"
  database_name                   = "lucide"
  master_username                 = "admin"
  master_password                 = random_password.db_password.result

  db_subnet_group_name            = aws_db_subnet_group.primary.name
  backup_retention_period         = 30
  preferred_backup_window         = "02:00-03:00"
  preferred_maintenance_window    = "sun:03:00-sun:04:00"

  enabled_cloudwatch_logs_exports = ["postgresql"]

  storage_encrypted               = true
  kms_key_id                      = aws_kms_key.backup.arn

  enabled_http_endpoint           = true

  skip_final_snapshot             = false
  final_snapshot_identifier       = "lucide-crmt-final-snapshot-${formatdate("YYYY-MM-DD-hhmm", timestamp())}"

  tags = local.common_tags
}

resource "aws_rds_cluster_instance" "primary" {
  cluster_identifier = aws_rds_cluster.primary.id
  instance_class     = var.db_instance_class
  engine             = aws_rds_cluster.primary.engine
  engine_version     = aws_rds_cluster.primary.engine_version

  performance_insights_enabled    = true
  performance_insights_kms_key_id = aws_kms_key.backup.arn

  monitoring_interval = 60
  monitoring_role_arn = aws_iam_role.rds_monitoring.arn

  tags = local.common_tags
}

# RDS Read Replica in Secondary Region
resource "aws_rds_cluster_instance" "secondary" {
  provider           = aws.secondary
  cluster_identifier = aws_rds_cluster.secondary.id
  instance_class     = var.db_instance_class
  engine             = aws_rds_cluster.secondary.engine
  engine_version     = aws_rds_cluster.secondary.engine_version

  tags = local.common_tags
}

resource "aws_rds_cluster" "secondary" {
  provider                       = aws.secondary
  cluster_identifier             = "lucide-crmt-secondary"
  engine                         = "aurora-postgresql"
  engine_version                 = aws_rds_cluster.primary.engine_version

  replication_source_identifier  = "arn:aws:rds:${var.aws_primary_region}:${data.aws_caller_identity.current.account_id}:cluster:${aws_rds_cluster.primary.cluster_identifier}"

  skip_final_snapshot            = true

  tags = merge(
    local.common_tags,
    { Role = "secondary" }
  )
}

# ============================================================================
# Automated Backup Management
# ============================================================================

resource "aws_backup_vault" "disaster_recovery" {
  name        = "lucide-crmt-dr-vault"
  kms_key_arn = aws_kms_key.backup.arn

  tags = local.common_tags
}

resource "aws_backup_plan" "disaster_recovery" {
  name = "lucide-crmt-dr-plan"

  rule {
    rule_name         = "hourly_backups"
    target_backup_vault_name = aws_backup_vault.disaster_recovery.name
    schedule          = "cron(0 * * * ? *)"  # Every hour

    lifecycle {
      delete_after = 7
    }
  }

  rule {
    rule_name         = "daily_backups"
    target_backup_vault_name = aws_backup_vault.disaster_recovery.name
    schedule          = "cron(0 2 * * ? *)"  # 2 AM daily

    lifecycle {
      delete_after = 30
    }
  }

  rule {
    rule_name         = "weekly_backups"
    target_backup_vault_name = aws_backup_vault.disaster_recovery.name
    schedule          = "cron(0 3 ? * SUN *)"  # 3 AM Sundays

    lifecycle {
      delete_after = 90
    }
  }

  tags = local.common_tags
}

# ============================================================================
# Secrets Management
# ============================================================================

resource "random_password" "db_password" {
  length  = 32
  special = true
}

resource "aws_secretsmanager_secret" "db_password" {
  name                    = "lucide-crmt/db-password"
  description             = "RDS database master password"
  recovery_window_in_days = 7

  tags = local.common_tags
}

resource "aws_secretsmanager_secret_version" "db_password" {
  secret_id     = aws_secretsmanager_secret.db_password.id
  secret_string = random_password.db_password.result
}

# ============================================================================
# Monitoring & Alerting
# ============================================================================

resource "aws_cloudwatch_log_group" "backup" {
  name              = "/aws/lambda/lucide-crmt-backup"
  retention_in_days = 30
  kms_key_id        = aws_kms_key.backup.arn

  tags = local.common_tags
}

resource "aws_sns_topic" "disaster_recovery_alerts" {
  name              = "lucide-crmt-dr-alerts"
  kms_master_key_id = "alias/aws/sns"

  tags = local.common_tags
}

resource "aws_sns_topic_subscription" "disaster_recovery_alerts_email" {
  topic_arn = aws_sns_topic.disaster_recovery_alerts.arn
  protocol  = "email"
  endpoint  = var.alert_email
}

resource "aws_cloudwatch_metric_alarm" "backup_failure" {
  alarm_name          = "lucide-crmt-backup-failure"
  comparison_operator = "GreaterThanOrEqualToThreshold"
  evaluation_periods  = "1"
  metric_name         = "NumberOfBackupJobsFailed"
  namespace           = "AWS/Backup"
  period              = "86400"
  statistic           = "Sum"
  threshold           = "1"
  alarm_description   = "Alert when backup jobs fail"
  alarm_actions       = [aws_sns_topic.disaster_recovery_alerts.arn]

  tags = local.common_tags
}

# ============================================================================
# IAM Roles and Policies
# ============================================================================

data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "s3_replication" {
  statement {
    effect = "Allow"

    actions = [
      "s3:GetReplicationConfiguration",
      "s3:ListBucket",
    ]

    resources = [aws_s3_bucket.backup_primary.arn]
  }

  statement {
    effect = "Allow"

    actions = [
      "s3:GetObjectVersionForReplication",
      "s3:GetObjectVersionAcl",
    ]

    resources = ["${aws_s3_bucket.backup_primary.arn}/*"]
  }

  statement {
    effect = "Allow"

    actions = [
      "s3:ReplicateObject",
      "s3:ReplicateDelete",
    ]

    resources = ["${aws_s3_bucket.backup_secondary.arn}/*"]
  }

  statement {
    effect = "Allow"

    actions = [
      "kms:Decrypt",
      "kms:DescribeKey",
    ]

    resources = [aws_kms_key.backup.arn]
  }

  statement {
    effect = "Allow"

    actions = [
      "kms:Encrypt",
      "kms:GenerateDataKey",
    ]

    resources = [aws_kms_key.backup.arn]
  }
}

resource "aws_iam_role" "s3_replication" {
  name               = "lucide-crmt-s3-replication"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })

  tags = local.common_tags
}

resource "aws_iam_role_policy" "s3_replication" {
  name   = "lucide-crmt-s3-replication"
  role   = aws_iam_role.s3_replication.id
  policy = data.aws_iam_policy_document.s3_replication.json
}

resource "aws_iam_role" "rds_monitoring" {
  name = "lucide-crmt-rds-monitoring"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Service = "monitoring.rds.amazonaws.com"
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "rds_monitoring" {
  role       = aws_iam_role.rds_monitoring.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonRDSEnhancedMonitoringRole"
}

# ============================================================================
# Outputs
# ============================================================================

output "backup_vault_arn" {
  description = "ARN of the backup vault"
  value       = aws_backup_vault.disaster_recovery.arn
}

output "backup_bucket_primary" {
  description = "Primary backup S3 bucket"
  value       = aws_s3_bucket.backup_primary.id
}

output "backup_bucket_secondary" {
  description = "Secondary backup S3 bucket"
  value       = aws_s3_bucket.backup_secondary.id
}

output "rds_primary_endpoint" {
  description = "Primary RDS cluster endpoint"
  value       = aws_rds_cluster.primary.endpoint
  sensitive   = true
}

output "rds_secondary_endpoint" {
  description = "Secondary RDS cluster endpoint (read-only)"
  value       = aws_rds_cluster.secondary.reader_endpoint
  sensitive   = true
}

output "kms_key_id" {
  description = "KMS key ID for backup encryption"
  value       = aws_kms_key.backup.id
}

output "sns_topic_arn" {
  description = "SNS topic ARN for disaster recovery alerts"
  value       = aws_sns_topic.disaster_recovery_alerts.arn
}
