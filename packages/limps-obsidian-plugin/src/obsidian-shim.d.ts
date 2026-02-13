declare module 'obsidian' {
  export interface Command {
    id: string;
    name: string;
    callback: () => void | Promise<void>;
  }

  export interface ViewState {
    type: string;
    active?: boolean;
    state?: Record<string, unknown>;
  }

  export class Notice {
    constructor(message: string, timeout?: number);
  }

  export class WorkspaceLeaf {
    view: ItemView;
    setViewState(state: ViewState): Promise<void>;
  }

  export class Workspace {
    getRightLeaf(split: boolean): WorkspaceLeaf;
    getLeavesOfType(type: string): WorkspaceLeaf[];
    revealLeaf(leaf: WorkspaceLeaf): Promise<void>;
    on(name: string, callback: (...args: unknown[]) => unknown): unknown;
  }

  export interface DataAdapter {
    basePath?: string;
  }

  export class Vault {
    adapter: DataAdapter;
    on(name: string, callback: (...args: unknown[]) => unknown): unknown;
  }

  export class App {
    workspace: Workspace;
    vault: Vault;
    metadataCache?: {
      resolvedLinks?: Record<string, Record<string, number>>;
      unresolvedLinks?: Record<string, Record<string, number>>;
      on?: (name: string, callback: (...args: unknown[]) => unknown) => unknown;
    };
  }

  export abstract class ItemView {
    app: App;
    leaf: WorkspaceLeaf;
    containerEl: HTMLElement;
    constructor(leaf: WorkspaceLeaf);
    getViewType(): string;
    getDisplayText(): string;
    onOpen(): Promise<void>;
    onClose(): Promise<void>;
  }

  export class Plugin {
    app: App;
    addCommand(command: Command): void;
    registerView(type: string, viewCreator: (leaf: WorkspaceLeaf) => ItemView): void;
    addSettingTab(settingTab: PluginSettingTab): void;
    addRibbonIcon(icon: string, title: string, callback: (evt: MouseEvent) => void): HTMLElement;
    addStatusBarItem(): HTMLElement;
    registerInterval(id: number): void;
    registerEvent(eventRef: unknown): void;
    loadData(): Promise<unknown>;
    saveData(data: unknown): Promise<void>;
  }

  export class PluginSettingTab {
    app: App;
    containerEl: HTMLElement;
    constructor(app: App, plugin: Plugin);
    display(): void;
  }

  export class TextComponent {
    setPlaceholder(value: string): this;
    setValue(value: string): this;
    onChange(callback: (value: string) => void): this;
  }

  export class ToggleComponent {
    setValue(value: boolean): this;
    onChange(callback: (value: boolean) => void): this;
  }

  export class SliderComponent {
    setLimits(min: number, max: number, step: number): this;
    setValue(value: number): this;
    setDynamicTooltip(): this;
    onChange(callback: (value: number) => void): this;
  }

  export class Setting {
    constructor(containerEl: HTMLElement);
    setName(name: string): this;
    setDesc(description: string): this;
    addText(callback: (component: TextComponent) => void): this;
    addToggle(callback: (component: ToggleComponent) => void): this;
    addSlider(callback: (component: SliderComponent) => void): this;
  }
}
