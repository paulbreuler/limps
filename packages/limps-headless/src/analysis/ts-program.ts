import * as path from 'node:path';
import * as ts from 'typescript';

export interface TsCompilerContextInput {
  tsconfigPath?: string;
  cwd?: string;
}

export interface TsCompilerContext {
  compilerOptions: ts.CompilerOptions;
  basePath: string;
  host: ts.CompilerHost;
}

function loadTsConfig(tsconfigPath: string): {
  compilerOptions: ts.CompilerOptions;
  basePath: string;
} {
  const absolute = path.isAbsolute(tsconfigPath)
    ? tsconfigPath
    : path.resolve(process.cwd(), tsconfigPath);
  const configFile = ts.readConfigFile(absolute, ts.sys.readFile);

  if (configFile.error) {
    const message = ts.formatDiagnosticsWithColorAndContext(
      [configFile.error],
      {
        getCanonicalFileName: (name) => name,
        getCurrentDirectory: ts.sys.getCurrentDirectory,
        getNewLine: () => ts.sys.newLine,
      }
    );
    throw new Error(message);
  }

  const basePath = path.dirname(absolute);
  const parsed = ts.parseJsonConfigFileContent(
    configFile.config,
    ts.sys,
    basePath
  );

  if (parsed.errors.length > 0) {
    const message = ts.formatDiagnosticsWithColorAndContext(parsed.errors, {
      getCanonicalFileName: (name) => name,
      getCurrentDirectory: ts.sys.getCurrentDirectory,
      getNewLine: () => ts.sys.newLine,
    });
    throw new Error(message);
  }

  return {
    compilerOptions: parsed.options,
    basePath,
  };
}

function defaultCompilerOptions(): ts.CompilerOptions {
  return {
    allowJs: true,
    checkJs: false,
    jsx: ts.JsxEmit.ReactJSX,
    module: ts.ModuleKind.NodeNext,
    moduleResolution: ts.ModuleResolutionKind.NodeNext,
    esModuleInterop: true,
    resolveJsonModule: true,
  };
}

export function createTsCompilerContext(
  input: TsCompilerContextInput = {}
): TsCompilerContext {
  const cwd = input.cwd ?? process.cwd();
  const tsconfigPath = input.tsconfigPath;

  let compilerOptions = defaultCompilerOptions();
  let basePath = cwd;

  if (tsconfigPath) {
    const config = loadTsConfig(tsconfigPath);
    compilerOptions = { ...compilerOptions, ...config.compilerOptions };
    basePath = config.basePath;
  }

  const host = ts.createCompilerHost(compilerOptions, true);

  return {
    compilerOptions,
    basePath,
    host,
  };
}
