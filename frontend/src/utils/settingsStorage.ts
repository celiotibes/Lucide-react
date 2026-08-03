interface StorageSettings {
  [key: string]: unknown;
}

class SettingsStorage {
  private prefix: string;

  constructor(prefix: string = 'lucide_') {
    this.prefix = prefix;
  }

  private getKey(name: string): string {
    return `${this.prefix}${name}`;
  }

  get<T>(name: string, defaultValue: T): T {
    try {
      const key = this.getKey(name);
      const stored = localStorage.getItem(key);
      if (stored === null) {
        return defaultValue;
      }
      return JSON.parse(stored) as T;
    } catch (error) {
      console.error(`Failed to retrieve setting ${name}:`, error);
      return defaultValue;
    }
  }

  set<T>(name: string, value: T): boolean {
    try {
      const key = this.getKey(name);
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error(`Failed to save setting ${name}:`, error);
      return false;
    }
  }

  remove(name: string): boolean {
    try {
      const key = this.getKey(name);
      localStorage.removeItem(key);
      return true;
    } catch (error) {
      console.error(`Failed to remove setting ${name}:`, error);
      return false;
    }
  }

  clear(): boolean {
    try {
      const keys = Object.keys(localStorage).filter((key) =>
        key.startsWith(this.prefix)
      );
      keys.forEach((key) => localStorage.removeItem(key));
      return true;
    } catch (error) {
      console.error('Failed to clear settings:', error);
      return false;
    }
  }

  getAll(): StorageSettings {
    const result: StorageSettings = {};
    try {
      const keys = Object.keys(localStorage).filter((key) =>
        key.startsWith(this.prefix)
      );
      keys.forEach((key) => {
        const name = key.replace(this.prefix, '');
        result[name] = JSON.parse(localStorage.getItem(key) || 'null');
      });
    } catch (error) {
      console.error('Failed to get all settings:', error);
    }
    return result;
  }

  watch<T>(
    name: string,
    callback: (value: T, oldValue: T) => void,
    defaultValue: T
  ): () => void {
    const handleStorageChange = (event: StorageEvent) => {
      const key = this.getKey(name);
      if (event.key === key) {
        try {
          const newValue = event.newValue ? (JSON.parse(event.newValue) as T) : defaultValue;
          const oldValue = event.oldValue ? (JSON.parse(event.oldValue) as T) : defaultValue;
          callback(newValue, oldValue);
        } catch (error) {
          console.error(`Failed to parse storage change for ${name}:`, error);
        }
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }
}

export const settingsStorage = new SettingsStorage('lucide_');

export default SettingsStorage;
