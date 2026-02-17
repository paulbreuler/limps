import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ObsidianSurfaceAuditReport {
  planDirectories: number;
  markdownFiles: number;
  canvasFiles: number;
  baseFiles: number;
  emptyCanvasFiles: string[];
  emptyBaseFiles: string[];
  warnings: string[];
}

export function auditObsidianSurfaces(plansPath: string): ObsidianSurfaceAuditReport {
  const report: ObsidianSurfaceAuditReport = {
    planDirectories: 0,
    markdownFiles: 0,
    canvasFiles: 0,
    baseFiles: 0,
    emptyCanvasFiles: [],
    emptyBaseFiles: [],
    warnings: [],
  };

  let planEntries: string[];
  try {
    planEntries = readdirSync(plansPath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name);
  } catch {
    report.warnings.push(`Plans path does not exist or is not readable: ${plansPath}`);
    return report;
  }

  report.planDirectories = planEntries.length;

  for (const planDirName of planEntries) {
    const planDir = join(plansPath, planDirName);
    let files: string[];
    try {
      files = readdirSync(planDir, { withFileTypes: true })
        .filter((entry) => entry.isFile())
        .map((entry) => entry.name);
    } catch {
      report.warnings.push(`Unable to read plan directory: ${planDir}`);
      continue;
    }

    for (const fileName of files) {
      const lower = fileName.toLowerCase();
      const fullPath = join(planDir, fileName);

      if (lower.endsWith('.md')) {
        report.markdownFiles += 1;
        continue;
      }

      if (lower.endsWith('.canvas')) {
        report.canvasFiles += 1;
        if (isFileEffectivelyEmpty(fullPath)) {
          report.emptyCanvasFiles.push(fullPath);
        }
        continue;
      }

      if (lower.endsWith('.base')) {
        report.baseFiles += 1;
        if (isFileEffectivelyEmpty(fullPath)) {
          report.emptyBaseFiles.push(fullPath);
        }
      }
    }
  }

  return report;
}

function isFileEffectivelyEmpty(path: string): boolean {
  try {
    const content = readFileSync(path, 'utf8').trim();
    if (!content) return true;
    if (content === '{}' || content === '[]') return true;
    return false;
  } catch {
    return true;
  }
}
