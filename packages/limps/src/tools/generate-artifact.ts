import { z } from 'zod';
import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { Persona } from '../documents/persona.js';
import { Journey } from '../documents/journey.js';
import { Spec } from '../documents/spec.js';
import { AgentTask } from '../documents/agent-task.js';
import { resolvePrimer } from '../documents/primer-resolver.js';
import type { ToolContext, ToolResult } from '../types.js';

export const GenerateArtifactInputSchema = z.object({
  type: z.enum(['persona', 'journey', 'spec', 'agent']).describe('Artifact type to generate'),
  title: z.string().min(1).describe('Title for the artifact'),
  planId: z.string().optional().describe('Plan directory name (required for agent and spec types)'),
  description: z.string().optional().describe('Description for persona or journey'),
  personaPath: z.string().optional().describe('Path to persona file (for journey type)'),
  primer: z.string().optional().describe('Override primer path (for agent type)'),
});

export async function generateArtifactHandler(
  args: z.infer<typeof GenerateArtifactInputSchema>,
  context: ToolContext
): Promise<ToolResult> {
  const { config } = context;
  const plansPath = config.workspacePath ?? config.plansPath;

  let doc: { toMarkdown(): string; id: string };
  let outputPath: string;

  switch (args.type) {
    case 'persona': {
      const persona = new Persona(args.title, args.description ?? '');
      doc = persona;
      const personasPath = config.personasPath ?? join(dirname(plansPath), 'personas');
      const slug = args.title.toLowerCase().replace(/\s+/g, '-');
      outputPath = join(personasPath, `${slug}.md`);
      break;
    }
    case 'journey': {
      const journey = new Journey({
        title: args.title,
        personaPath: args.personaPath,
        description: args.description,
      });
      doc = journey;
      const journeysPath = config.journeysPath ?? join(dirname(plansPath), 'journeys');
      const slug = args.title.toLowerCase().replace(/\s+/g, '-');
      outputPath = join(journeysPath, `${slug}.md`);
      break;
    }
    case 'spec': {
      if (!args.planId) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'planId required for spec type' }),
            },
          ],
        };
      }
      const spec = new Spec({ title: args.title, planId: args.planId });
      doc = spec;
      const specsPath = config.specsPath ?? join(dirname(plansPath), 'specs');
      const slug = args.title.toLowerCase().replace(/\s+/g, '-');
      outputPath = join(specsPath, `${slug}.md`);
      break;
    }
    case 'agent': {
      if (!args.planId) {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({ error: 'planId required for agent type' }),
            },
          ],
        };
      }
      const planDir = join(plansPath, args.planId);
      const primerResult = resolvePrimer(planDir, config, args.primer);
      const task = new AgentTask({
        title: args.title,
        planId: args.planId,
        primerPath: primerResult?.path,
        primerContent: primerResult?.content,
      });
      doc = task;
      const agentsDir = join(planDir, 'agents');
      const slug = args.title.toLowerCase().replace(/\s+/g, '-');
      outputPath = join(agentsDir, `000-${slug}.md`);
      break;
    }
    default:
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify({
              error: `Unsupported artifact type: ${args.type as string}`,
            }),
          },
        ],
      };
  }

  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, doc.toMarkdown(), 'utf-8');

  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(
          {
            ok: true,
            id: doc.id,
            type: args.type,
            title: args.title,
            path: outputPath,
            next_steps: [
              `Review the generated file at ${outputPath}`,
              args.type === 'agent' ? 'Run validate_invest to check INVEST compliance' : null,
            ].filter(Boolean),
          },
          null,
          2
        ),
      },
    ],
  };
}
