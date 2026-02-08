/**
 * scripts/helpers/pr-comments.ts - Standardized tool for PR comment retrieval and analysis
 *
 * Usage:
 *   npx tsx scripts/helpers/pr-comments.ts list [pr_number]
 *   npx tsx scripts/helpers/pr-comments.ts analyze [pr_number]
 *   npx tsx scripts/helpers/pr-comments.ts reply [pr_number] <comment_id> <message>
 *   npx tsx scripts/helpers/pr-comments.ts resolve <thread_id>
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';

interface GHComment {
  databaseId: number;
  body: string;
  author: { login: string };
  createdAt: string;
  url: string;
}

interface GHThread {
  id: string;
  path: string;
  isResolved: boolean;
  isOutdated: boolean;
  comments: {
    nodes: GHComment[];
  };
}

interface GHPRView {
  number: number;
  headRepositoryOwner: { login: string };
  headRepository: { name: string };
}

const runGh = (args: string[]): string => {
  return execFileSync('gh', args, { encoding: 'utf-8' });
};

const getPRInfo = (prNumber?: string): GHPRView => {
  const args = ['pr', 'view'];
  if (prNumber) args.push(prNumber);
  args.push('--json', 'number,headRepositoryOwner,headRepository');
  return JSON.parse(runGh(args));
};

const fetchThreads = (owner: string, repo: string, prNumber: number): GHThread[] => {
  const query = `
    query($owner: String!, $repo: String!, $pr_number: Int!, $endCursor: String) {
      repository(owner: $owner, name: $repo) {
        pullRequest(number: $pr_number) {
          reviewThreads(first: 100, after: $endCursor) {
            nodes {
              id
              path
              isResolved
              isOutdated
              comments(first: 20) {
                nodes {
                  databaseId
                  body
                  author { login }
                  createdAt
                  url
                }
              }
            }
            pageInfo {
              hasNextPage
              endCursor
            }
          }
        }
      }
    }
  `;

  const result = runGh([
    'api',
    'graphql',
    '--paginate',
    '-f',
    `query=${query}`,
    '-F',
    `owner=${owner}`,
    '-F',
    `repo=${repo}`,
    '-F',
    `pr_number=${prNumber}`,
  ]);

  try {
    const parsed = JSON.parse(result);
    return parsed.data.repository.pullRequest.reviewThreads.nodes;
  } catch (e) {
    return result
      .split('\n')
      .filter((line) => line.trim().startsWith('{'))
      .flatMap((line) => JSON.parse(line).data.repository.pullRequest.reviewThreads.nodes);
  }
};

const listCommand = (threads: GHThread[]): void => {
  const unresolved = threads.filter((t) => !t.isResolved);
  if (unresolved.length === 0) {
    console.log('✅ No unresolved review threads found.');
    return;
  }

  unresolved.forEach((thread) => {
    console.log(`Thread: ${thread.id}`);
    console.log(`Path:   ${thread.path} ${thread.isOutdated ? '(OUTDATED)' : ''}`);
    thread.comments.nodes.forEach((comment) => {
      console.log(`  [${comment.author.login}]: ${comment.body} (ID: ${comment.databaseId})`);
    });
    console.log('---');
  });
};

const analyzeCommand = (threads: GHThread[]): void => {
  const unresolved = threads.filter((t) => !t.isResolved);
  if (unresolved.length === 0) {
    console.log('✅ No unresolved review threads found.');
    return;
  }

  const byFile: Record<string, number> = {};
  unresolved.forEach((t) => {
    byFile[t.path] = (byFile[t.path] || 0) + 1;
  });

  console.log('Unresolved threads by file:');
  Object.entries(byFile)
    .sort((a, b) => b[1] - a[1])
    .forEach(([path, count]) => {
      const status = fs.existsSync(path) ? '[EXISTS]' : '[DELETED]';
      console.log(`  ${count.toString().padStart(2)} threads in ${status.padEnd(9)} ${path}`);
    });
};

const replyCommand = (
  owner: string,
  repo: string,
  prNumber: number,
  commentId: string,
  body: string
): void => {
  runGh([
    'api',
    `repos/${owner}/${repo}/pulls/${prNumber}/comments/${commentId}/replies`,
    '-X',
    'POST',
    '-f',
    `body=${body}`,
    '--silent',
  ]);
  console.log(`✅ Replied to comment ${commentId}`);
};

const resolveCommand = (threadId: string): void => {
  const query = `mutation { resolveReviewThread(input: {threadId: "${threadId}"}) { thread { isResolved } } }`;
  runGh(['api', 'graphql', '-f', `query=${query}`, '--silent']);
  console.log(`✅ Resolved thread ${threadId}`);
};

const main = (): void => {
  const [command, prArg, extra1, ...extraRest] = process.argv.slice(2);

  if (!command || !['list', 'analyze', 'reply', 'resolve'].includes(command)) {
    console.error('Usage:');
    console.error('  npx tsx scripts/helpers/pr-comments.ts list [pr_number]');
    console.error('  npx tsx scripts/helpers/pr-comments.ts analyze [pr_number]');
    console.error(
      '  npx tsx scripts/helpers/pr-comments.ts reply [pr_number] <comment_id> <message>'
    );
    console.error('  npx tsx scripts/helpers/pr-comments.ts resolve <thread_id>');
    process.exit(1);
  }

  try {
    if (command === 'resolve') {
      if (!prArg) throw new Error('Thread ID required for resolve command');
      resolveCommand(prArg);
      return;
    }

    const prInfo = getPRInfo(prArg);

    if (command === 'reply') {
      if (!extra1 || extraRest.length === 0)
        throw new Error('Comment ID and message required for reply command');
      replyCommand(
        prInfo.headRepositoryOwner.login,
        prInfo.headRepository.name,
        prInfo.number,
        extra1,
        extraRest.join(' ')
      );
      return;
    }

    const threads = fetchThreads(
      prInfo.headRepositoryOwner.login,
      prInfo.headRepository.name,
      prInfo.number
    );

    if (command === 'list') listCommand(threads);
    if (command === 'analyze') analyzeCommand(threads);
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
};

main();
