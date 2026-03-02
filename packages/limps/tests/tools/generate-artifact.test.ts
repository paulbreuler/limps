import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdirSync, rmSync, existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('generate_artifact MCP tool', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = join(tmpdir(), `gen-artifact-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it('should import handler without errors', async () => {
    const { generateArtifactHandler } = await import('../../src/tools/generate-artifact.js');
    expect(generateArtifactHandler).toBeDefined();
    expect(typeof generateArtifactHandler).toBe('function');
  });

  it('should generate a persona artifact', async () => {
    const { generateArtifactHandler } = await import('../../src/tools/generate-artifact.js');
    const personasDir = join(tempDir, 'personas');

    const result = await generateArtifactHandler(
      { type: 'persona', title: 'Developer Dan', description: 'A senior developer' },
      {
        config: { plansPath: join(tempDir, 'plans'), personasPath: personasDir } as never,
        db: null as never,
      }
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.ok).toBe(true);
    expect(parsed.type).toBe('persona');
    expect(parsed.title).toBe('Developer Dan');
    expect(existsSync(parsed.path)).toBe(true);

    const content = readFileSync(parsed.path, 'utf-8');
    expect(content).toContain('Developer Dan');
    expect(content).toContain('persona');
  });

  it('should generate a journey artifact', async () => {
    const { generateArtifactHandler } = await import('../../src/tools/generate-artifact.js');
    const journeysDir = join(tempDir, 'journeys');

    const result = await generateArtifactHandler(
      {
        type: 'journey',
        title: 'Onboarding Flow',
        personaPath: '/personas/dan.md',
        description: 'New user signs up',
      },
      {
        config: { plansPath: join(tempDir, 'plans'), journeysPath: journeysDir } as never,
        db: null as never,
      }
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.ok).toBe(true);
    expect(parsed.type).toBe('journey');
    expect(existsSync(parsed.path)).toBe(true);
  });

  it('should generate an agent artifact', async () => {
    const { generateArtifactHandler } = await import('../../src/tools/generate-artifact.js');
    const plansPath = join(tempDir, 'plans');
    const planDir = join(plansPath, '0001-my-plan');
    mkdirSync(planDir, { recursive: true });

    const result = await generateArtifactHandler(
      { type: 'agent', title: 'Setup database', planId: '0001-my-plan' },
      { config: { plansPath } as never, db: null as never }
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.ok).toBe(true);
    expect(parsed.type).toBe('agent');
    expect(existsSync(parsed.path)).toBe(true);

    const content = readFileSync(parsed.path, 'utf-8');
    expect(content).toContain('Setup database');
    expect(content).toContain('status: GAP');
  });

  it('should require planId for agent type', async () => {
    const { generateArtifactHandler } = await import('../../src/tools/generate-artifact.js');

    const result = await generateArtifactHandler(
      { type: 'agent', title: 'No plan' },
      { config: { plansPath: join(tempDir, 'plans') } as never, db: null as never }
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain('planId required');
  });

  it('should generate a spec artifact', async () => {
    const { generateArtifactHandler } = await import('../../src/tools/generate-artifact.js');
    const plansPath = join(tempDir, 'plans');
    const planDir = join(plansPath, '0001-my-plan');
    mkdirSync(planDir, { recursive: true });

    const result = await generateArtifactHandler(
      { type: 'spec', title: 'Auth System Spec', planId: '0001-my-plan' },
      { config: { plansPath, specsPath: join(tempDir, 'specs') } as never, db: null as never }
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.ok).toBe(true);
    expect(parsed.type).toBe('spec');
    expect(existsSync(parsed.path)).toBe(true);

    const content = readFileSync(parsed.path, 'utf-8');
    expect(content).toContain('Auth System Spec');
    expect(content).toContain('spec');
  });

  it('should return error for unsupported artifact type', async () => {
    const { generateArtifactHandler } = await import('../../src/tools/generate-artifact.js');

    const result = await generateArtifactHandler(
      { type: 'unknown' as never, title: 'Bad type' },
      { config: { plansPath: join(tempDir, 'plans') } as never, db: null as never }
    );

    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.error).toContain('Unsupported');
  });
});
