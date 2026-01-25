import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  getRegistryPath,
  loadRegistry,
  saveRegistry,
  registerProject,
  unregisterProject,
  setCurrentProject,
  getCurrentProjectPath,
  getProjectPath,
  listProjects,
  type ProjectRegistry,
} from '../../src/cli/registry.js';
import * as osPaths from '../../src/utils/os-paths.js';

describe('registry', () => {
  let testDir: string;

  beforeEach(() => {
    testDir = join(tmpdir(), `test-registry-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    mkdirSync(testDir, { recursive: true });

    // Mock getOSBasePath to use test directory
    vi.spyOn(osPaths, 'getOSBasePath').mockImplementation((appName?: string) => {
      return join(testDir, appName || 'limps');
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (existsSync(testDir)) {
      rmSync(testDir, { recursive: true, force: true });
    }
  });

  describe('getRegistryPath', () => {
    it('returns path under limps config directory', () => {
      const path = getRegistryPath();
      expect(path).toContain('limps');
      expect(path).toContain('registry.json');
    });
  });

  describe('loadRegistry', () => {
    it('returns empty registry when file does not exist', () => {
      const registry = loadRegistry();

      expect(registry).toEqual({
        version: 1,
        current: null,
        projects: {},
      });
    });

    it('loads existing registry from file', () => {
      const registryPath = getRegistryPath();
      mkdirSync(join(testDir, 'limps'), { recursive: true });

      const existingRegistry: ProjectRegistry = {
        version: 1,
        current: 'my-project',
        projects: {
          'my-project': {
            configPath: '/path/to/config.json',
            registeredAt: '2024-01-24T12:00:00Z',
          },
        },
      };

      writeFileSync(registryPath, JSON.stringify(existingRegistry, null, 2));

      const registry = loadRegistry();

      expect(registry).toEqual(existingRegistry);
    });

    it('returns empty registry when file is corrupt', () => {
      const registryPath = getRegistryPath();
      mkdirSync(join(testDir, 'limps'), { recursive: true });

      writeFileSync(registryPath, 'not valid json');

      const registry = loadRegistry();

      expect(registry).toEqual({
        version: 1,
        current: null,
        projects: {},
      });
    });

    it('returns empty registry when structure is invalid', () => {
      const registryPath = getRegistryPath();
      mkdirSync(join(testDir, 'limps'), { recursive: true });

      writeFileSync(registryPath, JSON.stringify({ foo: 'bar' }));

      const registry = loadRegistry();

      expect(registry).toEqual({
        version: 1,
        current: null,
        projects: {},
      });
    });
  });

  describe('saveRegistry', () => {
    it('creates directory if it does not exist', () => {
      const registry: ProjectRegistry = {
        version: 1,
        current: null,
        projects: {},
      };

      saveRegistry(registry);

      expect(existsSync(getRegistryPath())).toBe(true);
    });

    it('saves registry to file', () => {
      const registry: ProjectRegistry = {
        version: 1,
        current: 'test-project',
        projects: {
          'test-project': {
            configPath: '/test/config.json',
            registeredAt: '2024-01-24T12:00:00Z',
          },
        },
      };

      saveRegistry(registry);

      const content = readFileSync(getRegistryPath(), 'utf-8');
      const saved = JSON.parse(content);

      expect(saved).toEqual(registry);
    });
  });

  describe('registerProject', () => {
    it('adds a new project to registry', () => {
      registerProject('new-project', '/path/to/config.json');

      const registry = loadRegistry();

      expect(registry.projects['new-project']).toBeDefined();
      expect(registry.projects['new-project'].configPath).toBe('/path/to/config.json');
      expect(registry.projects['new-project'].registeredAt).toBeDefined();
    });

    it('overwrites existing project with same name', () => {
      registerProject('project', '/old/path.json');
      registerProject('project', '/new/path.json');

      const registry = loadRegistry();

      expect(registry.projects['project'].configPath).toBe('/new/path.json');
    });
  });

  describe('unregisterProject', () => {
    it('removes project from registry', () => {
      registerProject('to-remove', '/path/config.json');
      unregisterProject('to-remove');

      const registry = loadRegistry();

      expect(registry.projects['to-remove']).toBeUndefined();
    });

    it('throws error when project not found', () => {
      expect(() => unregisterProject('nonexistent')).toThrow('Project not found: nonexistent');
    });

    it('clears current if removing the current project', () => {
      registerProject('current-project', '/path/config.json');
      setCurrentProject('current-project');

      unregisterProject('current-project');

      const registry = loadRegistry();
      expect(registry.current).toBeNull();
    });
  });

  describe('setCurrentProject', () => {
    it('sets the current project', () => {
      registerProject('project-a', '/path/a.json');
      setCurrentProject('project-a');

      const registry = loadRegistry();

      expect(registry.current).toBe('project-a');
    });

    it('throws error when project not found', () => {
      expect(() => setCurrentProject('nonexistent')).toThrow('Project not found: nonexistent');
    });

    it('allows setting current to null', () => {
      registerProject('project', '/path/config.json');
      setCurrentProject('project');
      setCurrentProject(null);

      const registry = loadRegistry();

      expect(registry.current).toBeNull();
    });
  });

  describe('getCurrentProjectPath', () => {
    it('returns null when no current project', () => {
      const path = getCurrentProjectPath();

      expect(path).toBeNull();
    });

    it('returns config path for current project', () => {
      registerProject('my-project', '/path/to/config.json');
      setCurrentProject('my-project');

      const path = getCurrentProjectPath();

      expect(path).toBe('/path/to/config.json');
    });

    it('returns null when current project was removed', () => {
      registerProject('temp-project', '/path/config.json');
      setCurrentProject('temp-project');

      // Manually corrupt registry by setting current to non-existent project
      const registry = loadRegistry();
      registry.current = 'deleted-project';
      saveRegistry(registry);

      const path = getCurrentProjectPath();

      expect(path).toBeNull();
    });
  });

  describe('getProjectPath', () => {
    it('returns config path for named project', () => {
      registerProject('named-project', '/specific/path/config.json');

      const path = getProjectPath('named-project');

      expect(path).toBe('/specific/path/config.json');
    });

    it('returns null for unknown project', () => {
      const path = getProjectPath('unknown');

      expect(path).toBeNull();
    });
  });

  describe('listProjects', () => {
    it('returns empty array when no projects', () => {
      const projects = listProjects();

      expect(projects).toEqual([]);
    });

    it('returns all projects with metadata', () => {
      registerProject('alpha', '/path/alpha.json');
      registerProject('beta', '/path/beta.json');
      setCurrentProject('alpha');

      const projects = listProjects();

      expect(projects).toHaveLength(2);

      const alpha = projects.find((p) => p.name === 'alpha');
      expect(alpha).toBeDefined();
      expect(alpha!.current).toBe(true);
      expect(alpha!.configPath).toBe('/path/alpha.json');

      const beta = projects.find((p) => p.name === 'beta');
      expect(beta).toBeDefined();
      expect(beta!.current).toBe(false);
    });

    it('sorts projects alphabetically', () => {
      registerProject('zebra', '/path/z.json');
      registerProject('alpha', '/path/a.json');
      registerProject('middle', '/path/m.json');

      const projects = listProjects();

      expect(projects.map((p) => p.name)).toEqual(['alpha', 'middle', 'zebra']);
    });
  });
});
