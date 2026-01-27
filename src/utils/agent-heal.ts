import { existsSync, readFileSync, writeFileSync } from 'fs';
import { FrontmatterHandler } from './frontmatter.js';

const DEFAULT_FRONTMATTER = {
  status: 'GAP',
  persona: 'coder',
  dependencies: [],
  blocks: [],
  files: [],
};

export function healAgentFrontmatter(path: string): { changed: boolean } {
  if (!existsSync(path)) {
    return { changed: false };
  }

  const handler = new FrontmatterHandler();
  const content = readFileSync(path, 'utf-8');
  const parsed = handler.parse(content);
  const frontmatter = { ...DEFAULT_FRONTMATTER, ...parsed.frontmatter };

  const updated = handler.stringify(frontmatter, parsed.content);
  if (updated === content) {
    return { changed: false };
  }

  writeFileSync(path, updated, 'utf-8');
  return { changed: true };
}
