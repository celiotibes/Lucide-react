/**
 * Setup Wizard Steps Configuration
 * Defines all steps in the setup wizard with fields and validation
 */

import { SetupStep } from './types.js';

export const SETUP_STEPS: SetupStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to Lucide React',
    description: 'Let\'s set up your application in a few minutes',
    order: 1,
    fields: [
      {
        name: 'app_name',
        type: 'text',
        label: 'Application Name',
        placeholder: 'Lucide React',
        required: true,
      },
      {
        name: 'app_port',
        type: 'number',
        label: 'Application Port',
        placeholder: '3000',
        required: true,
        validation: (value) => {
          if (value < 1024 || value > 65535) {
            return 'Port must be between 1024 and 65535';
          }
          return null;
        },
      },
    ],
  },

  {
    id: 'ai-provider',
    title: 'AI Provider Configuration',
    description: 'Choose your AI provider for document classification and processing',
    order: 2,
    fields: [
      {
        name: 'ai_provider',
        type: 'select',
        label: 'AI Provider',
        required: true,
        options: [
          { value: 'anthropic', label: 'Anthropic Claude (Recommended)' },
          { value: 'openai', label: 'OpenAI GPT' },
          { value: 'gemini', label: 'Google Gemini (NEW)' },
          { value: 'local', label: 'Local LLM (Self-hosted)' },
        ],
      },
      {
        name: 'anthropic_api_key',
        type: 'password',
        label: 'Anthropic API Key',
        placeholder: 'sk-ant-...',
        required: true,
        conditional: (values) => values.ai_provider === 'anthropic',
      },
      {
        name: 'anthropic_model',
        type: 'select',
        label: 'Claude Model',
        required: true,
        conditional: (values) => values.ai_provider === 'anthropic',
        options: [
          { value: 'claude-3-5-sonnet-20241022', label: 'Claude 3.5 Sonnet (Recommended)' },
          { value: 'claude-3-opus-20240229', label: 'Claude 3 Opus (Most capable)' },
          { value: 'claude-3-haiku-20240307', label: 'Claude 3 Haiku (Fastest)' },
        ],
      },
      {
        name: 'openai_api_key',
        type: 'password',
        label: 'OpenAI API Key',
        placeholder: 'sk-...',
        required: true,
        conditional: (values) => values.ai_provider === 'openai',
      },
      {
        name: 'openai_model',
        type: 'select',
        label: 'GPT Model',
        required: true,
        conditional: (values) => values.ai_provider === 'openai',
        options: [
          { value: 'gpt-4-turbo', label: 'GPT-4 Turbo' },
          { value: 'gpt-4', label: 'GPT-4' },
          { value: 'gpt-3.5-turbo', label: 'GPT-3.5 Turbo' },
        ],
      },
      {
        name: 'gemini_api_key',
        type: 'password',
        label: 'Google Gemini API Key',
        placeholder: 'AIza...',
        required: true,
        conditional: (values) => values.ai_provider === 'gemini',
      },
      {
        name: 'gemini_model',
        type: 'select',
        label: 'Gemini Model',
        required: true,
        conditional: (values) => values.ai_provider === 'gemini',
        options: [
          { value: 'gemini-2.0-flash', label: 'Gemini 2.0 Flash (NOVO, rápido)' },
          { value: 'gemini-1.5-pro', label: 'Gemini 1.5 Pro (Preciso)' },
          { value: 'gemini-1.5-flash', label: 'Gemini 1.5 Flash (Gratuito)' },
        ],
      },
      {
        name: 'local_llm_endpoint',
        type: 'text',
        label: 'Local LLM Endpoint',
        placeholder: 'http://localhost:8000',
        required: true,
        conditional: (values) => values.ai_provider === 'local',
      },
      {
        name: 'local_llm_model',
        type: 'text',
        label: 'Model Name',
        placeholder: 'mistral-7b',
        required: true,
        conditional: (values) => values.ai_provider === 'local',
      },
    ],
  },

  {
    id: 'backup-settings',
    title: 'Backup & Data Persistence',
    description: 'Configure automatic backups to prevent data loss',
    order: 3,
    fields: [
      {
        name: 'backup_enabled',
        type: 'checkbox',
        label: 'Enable Automatic Backups',
        required: false,
      },
      {
        name: 'backup_frequency',
        type: 'select',
        label: 'Backup Frequency',
        required: true,
        conditional: (values) => values.backup_enabled === true,
        options: [
          { value: 'hourly', label: 'Every Hour' },
          { value: 'daily', label: 'Daily (Recommended)' },
          { value: 'weekly', label: 'Weekly' },
          { value: 'monthly', label: 'Monthly' },
        ],
      },
      {
        name: 'backup_retention_days',
        type: 'number',
        label: 'Retain Backups For (days)',
        placeholder: '30',
        required: true,
        conditional: (values) => values.backup_enabled === true,
        validation: (value) => {
          if (value < 7) {
            return 'Retention must be at least 7 days';
          }
          if (value > 365) {
            return 'Retention cannot exceed 365 days';
          }
          return null;
        },
      },
    ],
  },

  {
    id: 'backup-destinations',
    title: 'Backup Destinations',
    description: 'Choose where to store your backups',
    order: 4,
    fields: [
      {
        name: 'backup_local',
        type: 'checkbox',
        label: 'Local Storage (Required)',
        required: false,
      },
      {
        name: 'backup_s3',
        type: 'checkbox',
        label: 'AWS S3 (Cloud)',
        required: false,
      },
      {
        name: 's3_bucket',
        type: 'text',
        label: 'S3 Bucket Name',
        placeholder: 'my-lucide-backups',
        required: true,
        conditional: (values) => values.backup_s3 === true,
      },
      {
        name: 's3_region',
        type: 'select',
        label: 'S3 Region',
        required: true,
        conditional: (values) => values.backup_s3 === true,
        options: [
          { value: 'us-east-1', label: 'US East (N. Virginia)' },
          { value: 'us-west-2', label: 'US West (Oregon)' },
          { value: 'eu-west-1', label: 'EU (Ireland)' },
          { value: 'sa-east-1', label: 'South America (São Paulo)' },
        ],
      },
      {
        name: 's3_access_key',
        type: 'password',
        label: 'AWS Access Key ID',
        placeholder: 'AKIA...',
        required: true,
        conditional: (values) => values.backup_s3 === true,
      },
      {
        name: 's3_secret_key',
        type: 'password',
        label: 'AWS Secret Access Key',
        required: true,
        conditional: (values) => values.backup_s3 === true,
      },
      {
        name: 'backup_google_drive',
        type: 'checkbox',
        label: 'Google Drive',
        required: false,
      },
      {
        name: 'google_drive_folder_id',
        type: 'text',
        label: 'Google Drive Folder ID',
        placeholder: '1a2b3c4d5e6f...',
        required: true,
        conditional: (values) => values.backup_google_drive === true,
      },
    ],
  },

  {
    id: 'platform',
    title: 'Platform Configuration',
    description: 'Select your deployment platform',
    order: 5,
    fields: [
      {
        name: 'platform',
        type: 'select',
        label: 'Deployment Platform',
        required: true,
        options: [
          { value: 'macos', label: 'macOS (DMG)' },
          { value: 'windows', label: 'Windows (Installer)' },
          { value: 'docker', label: 'Docker Compose' },
          { value: 'linux', label: 'Linux (VPS)' },
          { value: 'web', label: 'Web Browser Only' },
        ],
      },
      {
        name: 'windows_scheduled_backup_time',
        type: 'text',
        label: 'Daily Backup Time (HH:MM)',
        placeholder: '02:00',
        required: true,
        conditional: (values) => values.platform === 'windows',
        validation: (value) => {
          if (!value.match(/^\d{2}:\d{2}$/)) {
            return 'Time must be in HH:MM format';
          }
          return null;
        },
      },
    ],
  },

  {
    id: 'privacy-consent',
    title: 'Privacy & Consent',
    description: 'Review our privacy policy and analytics settings',
    order: 6,
    fields: [
      {
        name: 'gdpr_consent',
        type: 'checkbox',
        label: 'I agree to the Privacy Policy and Terms of Service',
        required: true,
      },
      {
        name: 'analytics_enabled',
        type: 'checkbox',
        label: 'Help improve Lucide React by sharing anonymous usage data',
        required: false,
      },
    ],
  },

  {
    id: 'review-config',
    title: 'Review Configuration',
    description: 'Review your settings before completing setup',
    order: 7,
    fields: [],
  },
];

export function getStepById(id: string): SetupStep | undefined {
  return SETUP_STEPS.find((step) => step.id === id);
}

export function getStepByOrder(order: number): SetupStep | undefined {
  return SETUP_STEPS.find((step) => step.order === order);
}

export function getNextStep(currentStepId: string): SetupStep | null {
  const currentStep = getStepById(currentStepId);
  if (!currentStep) return null;

  const nextStep = SETUP_STEPS.find((step) => step.order === currentStep.order + 1);
  return nextStep || null;
}

export function getPreviousStep(currentStepId: string): SetupStep | null {
  const currentStep = getStepById(currentStepId);
  if (!currentStep) return null;

  const prevStep = SETUP_STEPS.find((step) => step.order === currentStep.order - 1);
  return prevStep || null;
}

export function getTotalSteps(): number {
  return SETUP_STEPS.length;
}
