/**
 * Tests for component discovery (Agent 1 #1 - extended with backend detection tests).
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { discoverComponents } from '../src/audit/discover-components.js';
import { copyFixture } from './fixtures/loader.js';

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

  it('detects Radix backend from unified radix-ui imports in nested folders', async () => {
    const dir = mkdtemp();
    const root = path.join(dir, 'src', 'components', 'ui', 'Toast');
    fs.mkdirSync(root, { recursive: true });

    fs.writeFileSync(
      path.join(root, 'Toast.tsx'),
      `import { Toast } from 'radix-ui';
export function AppToast() {
  return (
    <Toast.Provider>
      <Toast.Root />
    </Toast.Provider>
  );
}
`,
      'utf-8'
    );

    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const components = await discoverComponents();
      const toast = components.find((c) => c.name === 'AppToast');
      expect(toast?.backend).toBe('radix');
      expect(toast?.importSources).toContain('radix-ui');
    } finally {
      process.chdir(cwd);
    }
  });

  it('infers Base UI backend from local wrapper imports', async () => {
    const dir = mkdtemp();
    const wrapperDir = path.join(dir, 'src', 'components', 'ui');
    const featureDir = path.join(dir, 'src', 'components');
    fs.mkdirSync(wrapperDir, { recursive: true });
    fs.mkdirSync(featureDir, { recursive: true });

    fs.writeFileSync(
      path.join(wrapperDir, 'BaseButton.tsx'),
      `import { Button } from '@base-ui/react/button';
export function BaseButton() {
  return <Button.Root />;
}
`,
      'utf-8'
    );

    fs.writeFileSync(
      path.join(featureDir, 'Feature.tsx'),
      `import { BaseButton } from './ui/BaseButton';
export function Feature() {
  return <BaseButton />;
}
`,
      'utf-8'
    );

    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const components = await discoverComponents();
      const feature = components.find((c) => c.name === 'Feature');
      expect(feature?.backend).toBe('base');
    } finally {
      process.chdir(cwd);
    }
  });

  it('infers Base UI backend from headless role evidence', async () => {
    const dir = mkdtemp();
    const root = path.join(dir, 'src', 'components');
    fs.mkdirSync(root, { recursive: true });

    fs.writeFileSync(
      path.join(root, 'Menu.tsx'),
      `export function Menu() {
  return <div role=\"menu\"><button role=\"menuitem\">Item</button></div>;
}
`,
      'utf-8'
    );

    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const components = await discoverComponents();
      const menu = components.find((c) => c.name === 'Menu');
      expect(menu?.backend).toBe('base');
      expect(menu?.evidence).toContain('role:menu');
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
      `import { Tooltip } from '@base-ui/react/tooltip';
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
      expect(tooltip?.importSources).toContain('@base-ui/react/tooltip');
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

// Test ID: fixture-radix
describe('fixture-radix', () => {
  it('discovers Radix backend from fixture (import + JSX evidence)', async () => {
    const dir = copyFixture('radix');
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const components = await discoverComponents();
      expect(components.length).toBeGreaterThanOrEqual(1);
      const dialog = components.find((c) => c.name === 'DialogFixture' || c.path.includes('Dialog'));
      expect(dialog).toBeDefined();
      expect(dialog?.backend).toBe('radix');
      expect(dialog?.mixedUsage).toBe(false);
      expect(dialog?.importSources).toContain('@radix-ui/react-dialog');
      expect(dialog?.evidence).toContain('asChild');
    } finally {
      process.chdir(cwd);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// Test ID: fixture-base
describe('fixture-base', () => {
  it('discovers Base UI backend from fixture (import + JSX evidence)', async () => {
    const dir = copyFixture('base');
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const components = await discoverComponents();
      expect(components.length).toBeGreaterThanOrEqual(1);
      const select = components.find((c) => c.name === 'SelectFixture' || c.path.includes('Select'));
      expect(select).toBeDefined();
      expect(select?.backend).toBe('base');
      expect(select?.mixedUsage).toBe(false);
      expect(select?.importSources).toContain('@base-ui-components/react');
      expect(select?.evidence).toContain('render');
    } finally {
      process.chdir(cwd);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// Test ID: fixture-mixed
describe('fixture-mixed', () => {
  it('discovers mixed backend from fixture (import + JSX evidence)', async () => {
    const dir = copyFixture('mixed');
    const cwd = process.cwd();
    process.chdir(dir);
    try {
      const components = await discoverComponents();
      expect(components.length).toBeGreaterThanOrEqual(1);
      const mixed = components.find(
        (c) => c.name === 'MixedWidgetFixture' || c.path.includes('MixedWidget')
      );
      expect(mixed).toBeDefined();
      expect(mixed?.backend).toBe('mixed');
      expect(mixed?.mixedUsage).toBe(true);
      expect(mixed?.importSources).toContain('@radix-ui/react-dialog');
      expect(mixed?.importSources).toContain('@base-ui-components/react');
    } finally {
      process.chdir(cwd);
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});
