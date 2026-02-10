import type { LimpsExtension, ExtensionTool, ExtensionResource } from './types.js';
import type { ServerConfig } from '../config.js';
import { createExtensionContext } from './context.js';
import { logRedactedError } from '../utils/safe-logging.js';

/**
 * Loaded extension with its context.
 */
export interface LoadedExtension {
  extension: LimpsExtension;
  context: ReturnType<typeof createExtensionContext>;
}

/**
 * Load all extensions specified in the config.
 *
 * @param config - Server configuration
 * @returns Array of loaded extensions
 */
export async function loadExtensions(config: ServerConfig): Promise<LoadedExtension[]> {
  const extensions: LoadedExtension[] = [];

  // Get extensions list from config
  const extensionNames = config.extensions || [];

  for (const extensionName of extensionNames) {
    try {
      // Dynamic import from node_modules
      // Extension packages should export a default LimpsExtension
      const extensionModule = await import(extensionName);
      const extension = extensionModule.default as LimpsExtension;

      if (!extension) {
        console.error(`Extension ${extensionName} does not export a default LimpsExtension`);
        continue;
      }

      // Validate extension structure
      if (!extension.name || !extension.version) {
        console.error(`Extension ${extensionName} is missing required fields (name, version)`);
        continue;
      }

      // Create extension context
      const context = createExtensionContext(extension.name, config);

      // Call onInit if provided
      if (extension.onInit) {
        await extension.onInit(context);
      }

      extensions.push({ extension, context });
      console.error(`Loaded extension: ${extension.name}@${extension.version}`);
    } catch (error) {
      // Handle missing packages gracefully
      if (error && typeof error === 'object' && 'code' in error) {
        if (error.code === 'ERR_MODULE_NOT_FOUND') {
          console.error(
            `Extension package not found: ${extensionName}. Install it with: npm install ${extensionName}`
          );
          continue;
        }
      }
      logRedactedError(`Failed to load extension ${extensionName}`, error);
    }
  }

  return extensions;
}

/**
 * Get all tools from loaded extensions.
 *
 * @param extensions - Loaded extensions
 * @returns Array of extension tools
 */
export function getExtensionTools(extensions: LoadedExtension[]): ExtensionTool[] {
  const tools: ExtensionTool[] = [];

  for (const { extension } of extensions) {
    if (extension.tools) {
      // Check for namespace collisions
      for (const tool of extension.tools) {
        const existingTool = tools.find((t) => t.name === tool.name);
        if (existingTool) {
          console.error(
            `Tool name collision: ${tool.name} already registered. Extension ${extension.name} tool will be skipped.`
          );
          continue;
        }
        tools.push(tool);
      }
    }
  }

  return tools;
}

/**
 * Get all resources from loaded extensions.
 *
 * @param extensions - Loaded extensions
 * @returns Array of extension resources
 */
export function getExtensionResources(extensions: LoadedExtension[]): ExtensionResource[] {
  const resources: ExtensionResource[] = [];

  for (const { extension } of extensions) {
    if (extension.resources) {
      // Check for URI collisions
      for (const resource of extension.resources) {
        const existingResource = resources.find((r) => r.uri === resource.uri);
        if (existingResource) {
          console.error(
            `Resource URI collision: ${resource.uri} already registered. Extension ${extension.name} resource will be skipped.`
          );
          continue;
        }
        resources.push(resource);
      }
    }
  }

  return resources;
}

/**
 * Shutdown all extensions.
 *
 * @param extensions - Loaded extensions
 */
export async function shutdownExtensions(extensions: LoadedExtension[]): Promise<void> {
  for (const { extension } of extensions) {
    if (extension.onShutdown) {
      try {
        await extension.onShutdown();
      } catch (error) {
        logRedactedError(`Error shutting down extension ${extension.name}`, error);
      }
    }
  }
}
