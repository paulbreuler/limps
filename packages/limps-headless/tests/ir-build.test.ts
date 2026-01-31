import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { buildComponentIr } from '../src/analysis/ir/build-ir.js';

const fixturePath = path.join(process.cwd(), 'tests', 'fixtures', 'base-import.tsx');

describe('buildComponentIr', () => {
  it('captures import specs from fixtures', () => {
    const sourceText = fs.readFileSync(fixturePath, 'utf-8');
    const ir = buildComponentIr({ filePath: fixturePath, sourceText });

    expect(ir.imports.length).toBeGreaterThan(0);
    expect(ir.imports[0].source).toBe('@base-ui/react/tabs');
    expect(ir.id).toContain('base-import.tsx');
  });
});
