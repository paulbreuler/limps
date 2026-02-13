import { existsSync, readdirSync, readFileSync, writeFileSync } from 'fs';
import { basename, join } from 'path';
import { FrontmatterHandler } from '../utils/frontmatter.js';
import { parseDependencyRef } from '../utils/dependency-ref.js';

export interface ConvertDependencyPathsOptions {
  plansPath: string;
  planId?: string;
  checkOnly?: boolean;
}

export interface ConvertDependencyPathsResult {
  plansProcessed: number;
  filesScanned: number;
  filesUpdated: number;
  dependenciesConverted: number;
  warnings: string[];
}

interface AgentFileEntry {
  fileName: string;
  filePath: string;
  agentNumber: string;
}

const frontmatterHandler = new FrontmatterHandler();

function listPlanDirs(plansPath: string, planId?: string): string[] {
  if (!existsSync(plansPath)) {
    return [];
  }

  const planDirs = readdirSync(plansPath, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => !name.startsWith('.'));

  if (!planId) {
    return planDirs;
  }

  const padded = planId.padStart(4, '0');
  return planDirs.filter(
    (name) => name === planId || name.startsWith(`${padded}-`) || name.startsWith(`${planId}-`)
  );
}

function listAgentFiles(planDirPath: string): AgentFileEntry[] {
  const agentsDir = join(planDirPath, 'agents');
  if (!existsSync(agentsDir)) {
    return [];
  }

  return readdirSync(agentsDir)
    .filter((name) => name.endsWith('.agent.md'))
    .map((name) => {
      const agentNumber = name.match(/^(\d{1,3})/)?.[1];
      if (!agentNumber) {
        return null;
      }
      return {
        fileName: name,
        filePath: join(agentsDir, name),
        agentNumber: agentNumber.padStart(3, '0'),
      };
    })
    .filter((entry): entry is AgentFileEntry => Boolean(entry));
}

function normalizeDependencyArray(value: unknown): unknown[] {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null || value === '') {
    return [];
  }
  return [value];
}

function dedupe(values: string[]): string[] {
  return [...new Set(values)];
}

function convertDependencyValuesToPaths(
  values: unknown,
  byNumber: Map<string, AgentFileEntry>,
  currentPlanId?: string
): { next: string[]; converted: number; warnings: string[] } {
  const warnings: string[] = [];
  let converted = 0;
  const out: string[] = [];

  for (const value of normalizeDependencyArray(values)) {
    const dep = parseDependencyRef(value);

    if (!dep) {
      if (typeof value === 'string' && value.trim()) {
        out.push(value.trim());
      }
      continue;
    }

    if (dep.planId && currentPlanId && dep.planId !== currentPlanId) {
      out.push(`${dep.planId}#${dep.agentNumber}`);
      continue;
    }

    const target = byNumber.get(dep.agentNumber);
    if (!target) {
      warnings.push(`Could not resolve dependency ${dep.agentNumber} to an agent file`);
      out.push(dep.agentNumber);
      continue;
    }

    const pathValue = `./${target.fileName}`;
    const originalText = typeof value === 'string' ? value.trim() : String(value);
    if (originalText !== pathValue) {
      converted++;
    }
    out.push(pathValue);
  }

  return {
    next: dedupe(out),
    converted,
    warnings,
  };
}

export function convertDependenciesToPaths(
  options: ConvertDependencyPathsOptions
): ConvertDependencyPathsResult {
  const result: ConvertDependencyPathsResult = {
    plansProcessed: 0,
    filesScanned: 0,
    filesUpdated: 0,
    dependenciesConverted: 0,
    warnings: [],
  };

  const planDirs = listPlanDirs(options.plansPath, options.planId);
  for (const planDir of planDirs) {
    const fullPlanPath = join(options.plansPath, planDir);
    const planId = planDir.match(/^(\d{4})/)?.[1];
    const agents = listAgentFiles(fullPlanPath);
    if (agents.length === 0) {
      continue;
    }

    result.plansProcessed++;
    const byNumber = new Map<string, AgentFileEntry>();
    for (const agent of agents) {
      byNumber.set(agent.agentNumber, agent);
    }

    for (const agent of agents) {
      result.filesScanned++;
      const content = readFileSync(agent.filePath, 'utf8');
      const parsed = frontmatterHandler.parse(content);
      const frontmatter = parsed.frontmatter;
      const hasDependsOn = Object.prototype.hasOwnProperty.call(frontmatter, 'depends_on');
      const hasDependencies = Object.prototype.hasOwnProperty.call(frontmatter, 'dependencies');

      if (!hasDependsOn && !hasDependencies) {
        continue;
      }

      let convertedForFile = 0;
      const warningsForFile: string[] = [];

      if (hasDependsOn) {
        const converted = convertDependencyValuesToPaths(frontmatter.depends_on, byNumber, planId);
        frontmatter.depends_on = converted.next;
        convertedForFile += converted.converted;
        warningsForFile.push(...converted.warnings);
      }

      if (hasDependencies) {
        const converted = convertDependencyValuesToPaths(frontmatter.dependencies, byNumber, planId);
        frontmatter.dependencies = converted.next;
        convertedForFile += converted.converted;
        warningsForFile.push(...converted.warnings);
      }

      for (const warning of warningsForFile) {
        result.warnings.push(`${basename(agent.filePath)}: ${warning}`);
      }

      if (convertedForFile === 0) {
        continue;
      }

      result.dependenciesConverted += convertedForFile;
      result.filesUpdated++;

      if (!options.checkOnly) {
        const nextContent = frontmatterHandler.stringify(frontmatter, parsed.content);
        writeFileSync(agent.filePath, nextContent, 'utf8');
      }
    }
  }

  return result;
}
