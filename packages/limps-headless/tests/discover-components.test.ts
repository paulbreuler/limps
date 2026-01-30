/**
 * Tests for component discovery (Agent 1 #1 - extended with backend detection tests).
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { discoverComponents } from '../src/audit/discover-components.js';

function mkdtemp(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'limps-headless-discovery-'));
}

describe('discoverComponents', () => {
  it('discovers components under default rootDir', async () => {
    const dir = mkdtemp();
    const root = path.join(dir, 'src', 'components');
    fs.mkdirSync(root, { recursive: true });
    fs.mkdirSync(path.join(root, 'sub'), { recursive: true });

    fs.writeFileSync(
      path.join(root, 'Button.tsx'),
      "export function Button() { return <button />; }\n",
      'utf-8'
    );
    fs.writeFileSync(
      path.join(root, 'Button.test.tsx'),
      "export function ButtonTest() { return <button />; }\n",
      'utf-8'
    );
    fs.writeFileSync(
      path.join(root, 'sub', 'Modal.tsx'),
      "export const Modal = () => <div />;\n",
      'utf-8'
    );

    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const components = await discoverComponents();
      expect(components.map((c) => c.name).sort()).toEqual(['Button', 'Modal']);
      expect(components.find((c) => c.name === 'Button')?.path).toBe(
        'src/components/Button.tsx'
      );
    } finally {
      process.chdir(cwd);
    }
  });
});

// Test ID: discovery-radix
describe('discovery-radix', () => {
  it('detects Radix UI backend from imports', async () => {
    const dir = mkdtemp();
    const root = path.join(dir, 'src', 'components');
    fs.mkdirSync(root, { recursive: true });

    fs.writeFileSync(
      path.join(root, 'Dialog.tsx'),
      `import * as Dialog from '@radix-ui/react-dialog';
export function MyDialog() {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <button>Open</button>
      </Dialog.Trigger>
      <Dialog.Content>Hello</Dialog.Content>
    </Dialog.Root>
  );
}
`,
      'utf-8'
    );

    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const components = await discoverComponents();
      const dialog = components.find((c) => c.name === 'MyDialog');
      expect(dialog).toBeDefined();
      expect(dialog?.backend).toBe('radix');
      expect(dialog?.mixedUsage).toBe(false);
      expect(dialog?.importSources).toContain('@radix-ui/react-dialog');
      expect(dialog?.evidence).toContain('asChild');
    } finally {
      process.chdir(cwd);
    }
  });

  it('detects asChild evidence pattern', async () => {
    const dir = mkdtemp();
    const root = path.join(dir, 'src', 'components');
    fs.mkdirSync(root, { recursive: true });

    fs.writeFileSync(
      path.join(root, 'Button.tsx'),
      `import { Slot } from '@radix-ui/react-slot';
export function Button({ asChild, ...props }) {
  const Comp = asChild ? Slot : 'button';
  return <Comp {...props} />;
}
`,
      'utf-8'
    );

    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const components = await discoverComponents();
      const button = components.find((c) => c.name === 'Button');
      expect(button?.backend).toBe('radix');
    } finally {
      process.chdir(cwd);
    }
  });
});

// Test ID: discovery-base
describe('discovery-base', () => {
  it('detects Base UI backend from imports', async () => {
    const dir = mkdtemp();
    const root = path.join(dir, 'src', 'components');
    fs.mkdirSync(root, { recursive: true });

    fs.writeFileSync(
      path.join(root, 'Select.tsx'),
      `import { Select } from '@base-ui-components/react';
export function MySelect() {
  return (
    <Select.Root>
      <Select.Trigger render={<button />} />
      <Select.Popup>
        <Select.Option value="1">One</Select.Option>
      </Select.Popup>
    </Select.Root>
  );
}
`,
      'utf-8'
    );

    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const components = await discoverComponents();
      const select = components.find((c) => c.name === 'MySelect');
      expect(select).toBeDefined();
      expect(select?.backend).toBe('base');
      expect(select?.mixedUsage).toBe(false);
      expect(select?.importSources).toContain('@base-ui-components/react');
      expect(select?.evidence).toContain('render');
    } finally {
      process.chdir(cwd);
    }
  });

  it('detects render prop evidence pattern', async () => {
    const dir = mkdtemp();
    const root = path.join(dir, 'src', 'components');
    fs.mkdirSync(root, { recursive: true });

    fs.writeFileSync(
      path.join(root, 'Tooltip.tsx'),
      `import { Tooltip } from '@base-ui-components/react';
export function MyTooltip({ children }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger render={children} />
      <Tooltip.Popup>Info</Tooltip.Popup>
    </Tooltip.Root>
  );
}
`,
      'utf-8'
    );

    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const components = await discoverComponents();
      const tooltip = components.find((c) => c.name === 'MyTooltip');
      expect(tooltip?.backend).toBe('base');
      expect(tooltip?.evidence).toContain('render');
    } finally {
      process.chdir(cwd);
    }
  });
});

// Test ID: discovery-mixed
describe('discovery-mixed', () => {
  it('detects mixed Radix and Base UI usage', async () => {
    const dir = mkdtemp();
    const root = path.join(dir, 'src', 'components');
    fs.mkdirSync(root, { recursive: true });

    fs.writeFileSync(
      path.join(root, 'MixedComponent.tsx'),
      `import * as Dialog from '@radix-ui/react-dialog';
import { Tooltip } from '@base-ui-components/react';

export function MixedComponent() {
  return (
    <Dialog.Root>
      <Dialog.Trigger asChild>
        <Tooltip.Root>
          <Tooltip.Trigger render={<button>Open</button>} />
        </Tooltip.Root>
      </Dialog.Trigger>
    </Dialog.Root>
  );
}
`,
      'utf-8'
    );

    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const components = await discoverComponents();
      const mixed = components.find((c) => c.name === 'MixedComponent');
      expect(mixed).toBeDefined();
      expect(mixed?.backend).toBe('mixed');
      expect(mixed?.mixedUsage).toBe(true);
      expect(mixed?.importSources).toContain('@radix-ui/react-dialog');
      expect(mixed?.importSources).toContain('@base-ui-components/react');
    } finally {
      process.chdir(cwd);
    }
  });

  it('detects unknown backend when no headless imports', async () => {
    const dir = mkdtemp();
    const root = path.join(dir, 'src', 'components');
    fs.mkdirSync(root, { recursive: true });

    fs.writeFileSync(
      path.join(root, 'CustomButton.tsx'),
      `import React from 'react';
export function CustomButton({ onClick, children }) {
  return <button onClick={onClick}>{children}</button>;
}
`,
      'utf-8'
    );

    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const components = await discoverComponents();
      const custom = components.find((c) => c.name === 'CustomButton');
      expect(custom?.backend).toBe('unknown');
      expect(custom?.mixedUsage).toBe(false);
    } finally {
      process.chdir(cwd);
    }
  });
});
