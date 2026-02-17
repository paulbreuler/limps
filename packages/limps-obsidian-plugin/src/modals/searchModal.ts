import { Notice, SuggestModal } from 'obsidian';
import type LimpsPlugin from '../main.js';
import type { LimpsToolWrapper } from '../mcp/tool-wrapper.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SearchResultItem {
  path: string;
  title?: string;
  snippet?: string;
  score?: number;
}

// ---------------------------------------------------------------------------
// SearchModal
// ---------------------------------------------------------------------------

export class SearchModal extends SuggestModal<SearchResultItem> {
  private readonly plugin: LimpsPlugin;
  private readonly wrapper: LimpsToolWrapper;
  private cachedResults: SearchResultItem[] = [];
  private lastQuery = '';
  private searchInFlight = false;
  private searchTimeoutId: ReturnType<typeof setTimeout> | null = null;

  constructor(plugin: LimpsPlugin, wrapper: LimpsToolWrapper) {
    super(plugin.app);
    this.plugin = plugin;
    this.wrapper = wrapper;
    this.setPlaceholder('Search LIMPS documents...');
  }

  getSuggestions(query: string): SearchResultItem[] {
    const trimmed = query.trim();

    if (!trimmed) {
      this.cachedResults = [];
      this.lastQuery = '';
      return [];
    }

    // Trigger async search with debounce
    if (trimmed !== this.lastQuery) {
      this.lastQuery = trimmed;
      this.scheduleSearch(trimmed);
    }

    return this.cachedResults;
  }

  renderSuggestion(item: SearchResultItem, el: HTMLElement): void {
    const container = document.createElement('div');
    container.className = 'limps-search-result';

    const title = document.createElement('div');
    title.className = 'limps-search-title';
    title.textContent = item.title || item.path;
    container.appendChild(title);

    const path = document.createElement('div');
    path.className = 'limps-search-path';
    path.style.fontSize = '0.85em';
    path.style.opacity = '0.7';
    path.textContent = item.path;
    container.appendChild(path);

    if (item.snippet) {
      const snippet = document.createElement('div');
      snippet.className = 'limps-search-snippet';
      snippet.style.fontSize = '0.8em';
      snippet.style.opacity = '0.6';
      snippet.style.marginTop = '2px';
      snippet.textContent = item.snippet.slice(0, 120);
      container.appendChild(snippet);
    }

    el.appendChild(container);
  }

  async onChooseSuggestion(item: SearchResultItem): Promise<void> {
    await this.plugin.openFileAtLine(item.path);
  }

  onClose(): void {
    if (this.searchTimeoutId !== null) {
      clearTimeout(this.searchTimeoutId);
      this.searchTimeoutId = null;
    }
    this.cachedResults = [];
  }

  private scheduleSearch(query: string): void {
    if (this.searchTimeoutId !== null) {
      clearTimeout(this.searchTimeoutId);
    }

    this.searchTimeoutId = setTimeout(() => {
      this.searchTimeoutId = null;
      void this.performSearch(query);
    }, 200);
  }

  private async performSearch(query: string): Promise<void> {
    if (this.searchInFlight) return;
    this.searchInFlight = true;

    try {
      const result = await this.wrapper.searchDocs(query, 20);

      // Only update if query hasn't changed while searching
      if (query !== this.lastQuery) return;

      if (!result.success) {
        new Notice(`Search failed: ${result.error ?? 'unknown error'}`, 5000);
        return;
      }

      this.cachedResults = parseSearchResults(result.data);

      // Re-trigger the suggestion rendering by accessing the inputEl
      const inputEl = (this as unknown as { inputEl?: HTMLInputElement }).inputEl;
      if (inputEl) {
        inputEl.dispatchEvent(new Event('input'));
      }
    } finally {
      this.searchInFlight = false;
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseSearchResults(data: unknown): SearchResultItem[] {
  if (!data || typeof data !== 'object') return [];

  // Handle array directly
  if (Array.isArray(data)) {
    return data
      .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
      .map(parseResultItem);
  }

  // Handle { results: [...] } shape
  const record = data as Record<string, unknown>;
  if (Array.isArray(record.results)) {
    return record.results
      .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
      .map(parseResultItem);
  }

  // Handle { documents: [...] } shape
  if (Array.isArray(record.documents)) {
    return record.documents
      .filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object')
      .map(parseResultItem);
  }

  return [];
}

function parseResultItem(item: Record<string, unknown>): SearchResultItem {
  return {
    path: typeof item.path === 'string' ? item.path : typeof item.file === 'string' ? item.file : String(item.path ?? ''),
    title: typeof item.title === 'string' ? item.title : undefined,
    snippet: typeof item.snippet === 'string' ? item.snippet : typeof item.excerpt === 'string' ? item.excerpt : undefined,
    score: typeof item.score === 'number' ? item.score : undefined,
  };
}
