/**
 * First Boot Detection
 * Detects if application is running for the first time and triggers Setup Wizard
 */

import fs from 'fs-extra';
import path from 'path';
import os from 'os';

export interface FirstBootConfig {
  isFirstBoot: boolean;
  setupCompleted: boolean;
  lastSetupRun: Date | null;
  platform: string;
  configPath: string;
}

export class FirstBootDetection {
  private configDir: string;
  private configFile: string;

  constructor() {
    this.configDir = this.getConfigDirectory();
    this.configFile = path.join(this.configDir, 'setup-config.json');
  }

  private getConfigDirectory(): string {
    const platform = process.platform;

    switch (platform) {
      case 'darwin':
        // macOS: ~/.lucide-react/config
        return path.join(os.homedir(), '.lucide-react', 'config');

      case 'win32':
        // Windows: %APPDATA%\CRMT\config
        const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
        return path.join(appData, 'CRMT', 'config');

      case 'linux':
        // Linux: ~/.config/lucide-react
        return path.join(os.homedir(), '.config', 'lucide-react');

      default:
        // Fallback to home directory
        return path.join(os.homedir(), '.lucide-react', 'config');
    }
  }

  /**
   * Detects if this is the first boot of the application
   */
  async detect(): Promise<FirstBootConfig> {
    try {
      // Ensure config directory exists
      await fs.ensureDir(this.configDir);

      // Check if config file exists
      const configExists = await fs.pathExists(this.configFile);

      if (!configExists) {
        // First boot detected - create config file
        const config: FirstBootConfig = {
          isFirstBoot: true,
          setupCompleted: false,
          lastSetupRun: null,
          platform: process.platform,
          configPath: this.configDir,
        };

        await this.saveConfig(config);
        return config;
      }

      // Load existing config
      const config = await this.loadConfig();
      return config;
    } catch (error) {
      console.error('[FirstBoot] Detection failed:', error);

      // On error, treat as first boot for safety
      return {
        isFirstBoot: true,
        setupCompleted: false,
        lastSetupRun: null,
        platform: process.platform,
        configPath: this.configDir,
      };
    }
  }

  /**
   * Marks setup wizard as completed
   */
  async markSetupCompleted(): Promise<void> {
    const config = await this.loadConfig();
    config.setupCompleted = true;
    config.isFirstBoot = false;
    config.lastSetupRun = new Date();
    await this.saveConfig(config);
  }

  /**
   * Resets setup (useful for troubleshooting)
   */
  async resetSetup(): Promise<void> {
    const config = await this.loadConfig();
    config.setupCompleted = false;
    config.isFirstBoot = true;
    await this.saveConfig(config);
  }

  /**
   * Gets the data directory for platform-specific storage
   */
  getDataDirectory(): string {
    const platform = process.platform;

    switch (platform) {
      case 'darwin':
        // macOS: ~/.lucide-react/data
        return path.join(os.homedir(), '.lucide-react', 'data');

      case 'win32':
        // Windows: %APPDATA%\CRMT\data
        const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
        return path.join(appData, 'CRMT', 'data');

      case 'linux':
        // Linux: ~/.local/share/lucide-react
        return path.join(os.homedir(), '.local', 'share', 'lucide-react');

      default:
        return path.join(os.homedir(), '.lucide-react', 'data');
    }
  }

  /**
   * Gets the backup directory
   */
  getBackupDirectory(): string {
    const platform = process.platform;

    switch (platform) {
      case 'darwin':
        // macOS: ~/.lucide-react/backups
        return path.join(os.homedir(), '.lucide-react', 'backups');

      case 'win32':
        // Windows: %APPDATA%\CRMT\backups
        const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
        return path.join(appData, 'CRMT', 'backups');

      case 'linux':
        // Linux: ~/.local/share/lucide-react/backups
        return path.join(os.homedir(), '.local', 'share', 'lucide-react', 'backups');

      default:
        return path.join(os.homedir(), '.lucide-react', 'backups');
    }
  }

  /**
   * Creates necessary directories on first boot
   */
  async createDirectories(): Promise<void> {
    try {
      await fs.ensureDir(this.getConfigDirectory());
      await fs.ensureDir(this.getDataDirectory());
      await fs.ensureDir(this.getBackupDirectory());

      // Set file permissions on Unix systems
      if (process.platform !== 'win32') {
        // 0o700 = rwx------ (owner only)
        await fs.chmod(this.getConfigDirectory(), 0o700);
        await fs.chmod(this.getDataDirectory(), 0o700);
        await fs.chmod(this.getBackupDirectory(), 0o700);
      }

      console.log('[FirstBoot] Directories created successfully');
    } catch (error) {
      console.error('[FirstBoot] Failed to create directories:', error);
      throw error;
    }
  }

  /**
   * Private helper methods
   */

  private async loadConfig(): Promise<FirstBootConfig> {
    try {
      const data = await fs.readFile(this.configFile, 'utf-8');
      const config = JSON.parse(data) as FirstBootConfig;

      // Parse lastSetupRun back to Date if it exists
      if (config.lastSetupRun) {
        config.lastSetupRun = new Date(config.lastSetupRun);
      }

      return config;
    } catch (error) {
      console.error('[FirstBoot] Failed to load config:', error);

      // Return default on load failure
      return {
        isFirstBoot: true,
        setupCompleted: false,
        lastSetupRun: null,
        platform: process.platform,
        configPath: this.configDir,
      };
    }
  }

  private async saveConfig(config: FirstBootConfig): Promise<void> {
    try {
      await fs.ensureDir(this.configDir);

      const jsonConfig = {
        ...config,
        lastSetupRun: config.lastSetupRun?.toISOString() || null,
      };

      await fs.writeFile(this.configFile, JSON.stringify(jsonConfig, null, 2), 'utf-8');

      // Set restrictive permissions on config file (Unix systems)
      if (process.platform !== 'win32') {
        // 0o600 = rw------- (owner only)
        await fs.chmod(this.configFile, 0o600);
      }

      console.log('[FirstBoot] Config saved successfully');
    } catch (error) {
      console.error('[FirstBoot] Failed to save config:', error);
      throw error;
    }
  }
}

/**
 * Singleton instance
 */
let instance: FirstBootDetection | null = null;

export function getFirstBootDetection(): FirstBootDetection {
  if (!instance) {
    instance = new FirstBootDetection();
  }
  return instance;
}

/**
 * Initialize first boot on application startup
 */
export async function initializeFirstBoot(): Promise<FirstBootConfig> {
  const detection = getFirstBootDetection();

  // Create necessary directories
  await detection.createDirectories();

  // Detect first boot
  const config = await detection.detect();

  return config;
}
