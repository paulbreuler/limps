import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { homedir } from 'os';
import { join } from 'path';
import { getOSConfigPath, getOSDataPath } from '../../src/utils/os-paths.js';

// Get actual home directory for testing
const HOME = homedir();

describe('os-paths.ts', () => {
  describe('getOSConfigPath', () => {
    it('returns path ending with config.json', () => {
      const configPath = getOSConfigPath();
      expect(configPath).toMatch(/config\.json$/);
    });

    it('returns absolute path starting with home directory', () => {
      const configPath = getOSConfigPath();
      expect(configPath.startsWith(HOME) || configPath.includes('AppData')).toBe(true);
    });

    it('includes limps in path', () => {
      const configPath = getOSConfigPath();
      expect(configPath).toContain('limps');
    });
  });

  describe('getOSDataPath', () => {
    it('returns path ending with data', () => {
      const dataPath = getOSDataPath();
      expect(dataPath).toMatch(/data$/);
    });

    it('returns absolute path starting with home directory', () => {
      const dataPath = getOSDataPath();
      expect(dataPath.startsWith(HOME) || dataPath.includes('AppData')).toBe(true);
    });

    it('includes limps in path', () => {
      const dataPath = getOSDataPath();
      expect(dataPath).toContain('limps');
    });
  });

  describe('platform-specific paths', () => {
    // Test current platform behavior
    const platform = process.platform;

    if (platform === 'darwin') {
      it('macOS: config path is in Library/Application Support', () => {
        const configPath = getOSConfigPath();
        expect(configPath).toBe(
          join(HOME, 'Library', 'Application Support', 'limps', 'config.json')
        );
      });

      it('macOS: data path is in Library/Application Support', () => {
        const dataPath = getOSDataPath();
        expect(dataPath).toBe(join(HOME, 'Library', 'Application Support', 'limps', 'data'));
      });
    }

    if (platform === 'linux') {
      describe('without XDG environment variables', () => {
        const originalXdgConfig = process.env.XDG_CONFIG_HOME;
        const originalXdgData = process.env.XDG_DATA_HOME;

        beforeEach(() => {
          delete process.env.XDG_CONFIG_HOME;
          delete process.env.XDG_DATA_HOME;
        });

        afterEach(() => {
          if (originalXdgConfig) process.env.XDG_CONFIG_HOME = originalXdgConfig;
          if (originalXdgData) process.env.XDG_DATA_HOME = originalXdgData;
        });

        it('Linux: config path defaults to ~/.config', () => {
          const configPath = getOSConfigPath();
          expect(configPath).toBe(join(HOME, '.config', 'limps', 'config.json'));
        });

        it('Linux: data path defaults to ~/.local/share', () => {
          const dataPath = getOSDataPath();
          expect(dataPath).toBe(join(HOME, '.local', 'share', 'limps', 'data'));
        });
      });

      describe('with XDG environment variables', () => {
        const testXdgConfig = '/custom/config';
        const testXdgData = '/custom/data';

        beforeEach(() => {
          process.env.XDG_CONFIG_HOME = testXdgConfig;
          process.env.XDG_DATA_HOME = testXdgData;
        });

        afterEach(() => {
          delete process.env.XDG_CONFIG_HOME;
          delete process.env.XDG_DATA_HOME;
        });

        it('Linux: config path uses XDG_CONFIG_HOME', () => {
          const configPath = getOSConfigPath();
          expect(configPath).toBe(join(testXdgConfig, 'limps', 'config.json'));
        });

        it('Linux: data path uses XDG_DATA_HOME', () => {
          const dataPath = getOSDataPath();
          expect(dataPath).toBe(join(testXdgData, 'limps', 'data'));
        });
      });
    }

    if (platform === 'win32') {
      it('Windows: config path is in %APPDATA%', () => {
        const configPath = getOSConfigPath();
        const appData = process.env.APPDATA || join(HOME, 'AppData', 'Roaming');
        expect(configPath).toBe(join(appData, 'limps', 'config.json'));
      });

      it('Windows: data path is in %APPDATA%', () => {
        const dataPath = getOSDataPath();
        const appData = process.env.APPDATA || join(HOME, 'AppData', 'Roaming');
        expect(dataPath).toBe(join(appData, 'limps', 'data'));
      });
    }
  });
});
