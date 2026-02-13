import { createContext, useContext } from 'react';
import type { App } from 'obsidian';

export const AppContext = createContext<App | undefined>(undefined);

export function useObsidianApp(): App {
  const app = useContext(AppContext);
  if (!app) {
    throw new Error('Obsidian App context not available');
  }
  return app;
}
