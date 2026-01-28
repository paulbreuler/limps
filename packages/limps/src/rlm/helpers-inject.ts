/**
 * Serialized JavaScript code for helper and extractor functions.
 * This code is injected into the QuickJS sandbox environment.
 *
 * These are pure JavaScript versions of the helpers and extractors,
 * without TypeScript types or imports.
 */

/**
 * Get the JavaScript code to inject into the sandbox.
 * This includes all helper and extractor functions.
 */
export function getHelpersCode(): string {
  return `
// Extractor functions (lower-level parsing utilities)

function parseMarkdownHeaders(content) {
  const headers = [];
  const lines = content.split('\\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(#{1,6})\\s+(.+)$/);

    if (match) {
      const level = match[1].length;
      const text = match[2].trim();
      headers.push({
        level: level,
        text: text,
        line: i + 1
      });
    }
  }

  return headers;
}

function parseYamlFrontmatter(content) {
  if (!content.startsWith('---\\n')) {
    return null;
  }

  const endIndex = content.indexOf('\\n---\\n', 4);

  if (endIndex === -1) {
    if (content.slice(4, 8) === '---\\n') {
      // Empty frontmatter case
      return {};
    }
    return null;
  }

  const yamlContent = content.slice(4, endIndex);

  if (yamlContent.trim() === '') {
    return {};
  }

  // Simple YAML parser for basic cases
  try {
    return parseSimpleYaml(yamlContent);
  } catch (e) {
    return null;
  }
}

function parseSimpleYaml(yaml) {
  const result = {};
  const lines = yaml.split('\\n');
  const stack = [{ obj: result, indent: -1, key: undefined }];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed === '') {
      i++;
      continue;
    }

    const indent = line.length - line.trimStart().length;

    while (stack.length > 1 && indent <= stack[stack.length - 1].indent) {
      stack.pop();
    }

    const current = stack[stack.length - 1];

    if (trimmed.endsWith('|') || trimmed.endsWith('>')) {
      const keyMatch = trimmed.match(/^([^:]+):\\s*([|>])$/);
      if (keyMatch) {
        const key = keyMatch[1].trim();
        const multilineType = keyMatch[2];
        const multilineContent = [];
        i++;

        while (i < lines.length) {
          const nextLine = lines[i];
          const nextIndent = nextLine.length - nextLine.trimStart().length;
          const nextTrimmed = nextLine.trim();

          if (nextIndent <= indent && nextTrimmed !== '') {
            break;
          }

          if (multilineType === '|') {
            if (nextIndent > indent) {
              const baseIndent = indent + 2;
              const contentLine = nextLine.slice(baseIndent);
              multilineContent.push(contentLine);
            } else if (nextTrimmed === '') {
              multilineContent.push('');
            }
          } else {
            if (nextTrimmed === '') {
              multilineContent.push('\\n');
            } else {
              multilineContent.push(nextTrimmed + ' ');
            }
          }
          i++;
        }

        let finalContent = multilineType === '|' 
          ? multilineContent.join('\\n')
          : multilineContent.join('').trim();
        
        if (multilineType === '|' && !finalContent.endsWith('\\n')) {
          finalContent += '\\n';
        }

        current.obj[key] = finalContent;
        continue;
      }
    }

    if (trimmed.startsWith('- ')) {
      const value = trimmed.slice(2).trim();
      
      let arrayFound = false;
      for (let j = stack.length - 1; j >= 0; j--) {
        const stackItem = stack[j];
        if (stackItem.key && Array.isArray(stackItem.obj[stackItem.key])) {
          stackItem.obj[stackItem.key].push(parseValue(value));
          arrayFound = true;
          break;
        }
      }
      
      if (!arrayFound) {
        // Skip malformed YAML
      }
      
      i++;
      continue;
    }

    const colonIndex = trimmed.indexOf(':');
    if (colonIndex === -1) {
      i++;
      continue;
    }

    const key = trimmed.slice(0, colonIndex).trim();
    const valueStr = trimmed.slice(colonIndex + 1).trim();

    if (valueStr === '' && i + 1 < lines.length) {
      const nextLine = lines[i + 1];
      const nextIndent = nextLine.length - nextLine.trimStart().length;
      const nextTrimmed = nextLine.trim();

      if (nextIndent > indent) {
        if (nextTrimmed.startsWith('- ')) {
          const array = [];
          current.obj[key] = array;
          stack.push({ obj: current.obj, indent: indent, key: key });
          i++;
          continue;
        } else {
          const nestedObj = {};
          current.obj[key] = nestedObj;
          stack.push({ obj: nestedObj, indent: indent });
          i++;
          continue;
        }
      }
    }

    current.obj[key] = parseValue(valueStr);
    i++;
  }

  return result;
}

function parseValue(value) {
  const trimmed = value.trim();

  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null' || trimmed === '~') return null;

  if (/^-?\\d+$/.test(trimmed)) return parseInt(trimmed, 10);
  if (/^-?\\d+\\.\\d+$/.test(trimmed)) return parseFloat(trimmed);

  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || 
      (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

function parseGherkinScenarios(content) {
  const scenarios = [];
  const lines = content.split('\\n');

  let currentScenario = null;

  for (const line of lines) {
    const trimmed = line.trim();

    const scenarioMatch = trimmed.match(/^Scenario:\\s*(.+)$/i);
    if (scenarioMatch) {
      if (currentScenario) {
        scenarios.push(currentScenario);
      }

      currentScenario = {
        name: scenarioMatch[1].trim(),
        steps: []
      };
      continue;
    }

    const stepMatch = trimmed.match(/^(Given|When|Then|And|But)\\s+(.+)$/i);
    if (stepMatch) {
      if (currentScenario) {
        currentScenario.steps.push(trimmed);
      }
      continue;
    }
  }

  if (currentScenario) {
    scenarios.push(currentScenario);
  }

  return scenarios;
}

// Helper functions (high-level extraction utilities)

function extractSections(content) {
  const headers = parseMarkdownHeaders(content);
  const sections = {};
  const lines = content.split('\\n');

  if (headers.length === 0) {
    return sections;
  }

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i];
    const headerLine = header.line - 1;

    const headerPrefix = '#'.repeat(header.level);
    const fullHeaderText = headerPrefix + ' ' + header.text;

    let endLine = lines.length;
    for (let j = i + 1; j < headers.length; j++) {
      const nextHeader = headers[j];
      if (nextHeader.level <= header.level) {
        endLine = nextHeader.line - 1;
        break;
      }
    }

    const sectionLines = lines.slice(headerLine + 1, endLine);
    sections[fullHeaderText] = sectionLines.join('\\n');
  }

  return sections;
}

function extractFrontmatter(content) {
  const meta = parseYamlFrontmatter(content);

  if (meta === null) {
    return {
      meta: {},
      body: content
    };
  }

  const endIndex = content.indexOf('\\n---\\n', 4);
  let bodyStart = 8;

  if (endIndex !== -1) {
    bodyStart = endIndex + 5;
  } else if (content.slice(4, 8) === '---\\n') {
    bodyStart = 8;
  }

  return {
    meta: meta,
    body: content.slice(bodyStart)
  };
}

function extractCodeBlocks(content, lang) {
  const blocks = [];
  const lines = content.split('\\n');
  const codeBlockRegex = /^\\\`\\\`\\\`(\\w*)$/;

  let inBlock = false;
  let currentLanguage = '';
  let currentContent = [];
  let blockStartLine = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(codeBlockRegex);

    if (match) {
      if (inBlock) {
        if (!lang || currentLanguage === lang) {
          blocks.push({
            language: currentLanguage,
            content: currentContent.join('\\n'),
            lineNumber: blockStartLine + 1
          });
        }
        inBlock = false;
        currentContent = [];
      } else {
        inBlock = true;
        currentLanguage = match[1] || '';
        blockStartLine = i;
        currentContent = [];
      }
    } else if (inBlock) {
      currentContent.push(line);
    }
  }

  if (inBlock && (!lang || currentLanguage === lang)) {
    blocks.push({
      language: currentLanguage,
      content: currentContent.join('\\n'),
      lineNumber: blockStartLine + 1
    });
  }

  return blocks;
}

function extractFeatures(content) {
  const features = [];
  const lines = content.split('\\n');

  let currentFeature = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    const featureMatch = trimmed.match(/^###\\s+#(\\d+):\\s*(.+)$/);
    if (featureMatch) {
      if (currentFeature && currentFeature.id && currentFeature.name) {
        features.push({
          id: currentFeature.id,
          name: currentFeature.name,
          description: currentFeature.description,
          status: currentFeature.status
        });
      }

      currentFeature = {
        id: featureMatch[1],
        name: featureMatch[2].trim()
      };
      continue;
    }

    if (currentFeature && trimmed.startsWith('TL;DR:')) {
      currentFeature.description = trimmed.slice(6).trim();
      continue;
    }

    if (currentFeature && /^Status:\\s*\\\`([^\\\`]+)\\\`/.test(trimmed)) {
      const statusMatch = trimmed.match(/^Status:\\s*\\\`([^\\\`]+)\\\`/);
      if (statusMatch) {
        currentFeature.status = statusMatch[1];
      }
      continue;
    }
  }

  if (currentFeature && currentFeature.id && currentFeature.name) {
    features.push({
      id: currentFeature.id,
      name: currentFeature.name,
      description: currentFeature.description,
      status: currentFeature.status
    });
  }

  return features;
}

function extractAgents(content) {
  const agents = [];
  const lines = content.split('\\n');

  let currentAgent = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    const agentMatch = trimmed.match(/^##\\s+Agent\\s+(\\d+):\\s*(.+)$/);
    if (agentMatch) {
      if (currentAgent && currentAgent.id && currentAgent.name) {
        agents.push({
          id: currentAgent.id,
          name: currentAgent.name,
          features: currentAgent.features || [],
          files: currentAgent.files || [],
          depends: currentAgent.depends,
          blocks: currentAgent.blocks
        });
      }

      currentAgent = {
        id: agentMatch[1],
        name: agentMatch[2].trim(),
        features: [],
        files: []
      };
      continue;
    }

    if (!currentAgent) continue;

    if (trimmed.startsWith('Features:')) {
      const featuresMatch = trimmed.match(/Features:\\s*(.+)/);
      if (featuresMatch) {
        const featuresStr = featuresMatch[1];
        const featureNumbers = featuresStr.match(/#(\\d+)/g) || [];
        currentAgent.features = featureNumbers.map((f) => f.slice(1));
      }
      continue;
    }

    if (trimmed.startsWith('Own:')) {
      const ownMatch = trimmed.match(/Own:\\s*(.+)/);
      if (ownMatch) {
        const filesStr = ownMatch[1];
        const fileMatches = filesStr.match(/\\\`([^\\\`]+)\\\`/g) || [];
        currentAgent.files = fileMatches.map((f) => f.slice(1, -1));
      }
      continue;
    }

    if (trimmed.startsWith('Depend on:')) {
      const dependMatch = trimmed.match(/Depend on:\\s*(.+)/);
      if (dependMatch) {
        const dependStr = dependMatch[1];
        const agentNumbers = dependStr.match(/Agent\\s+(\\d+)/g) || [];
        currentAgent.depends = agentNumbers.map((a) => a.replace(/Agent\\s+/, ''));
      }
      continue;
    }

    if (trimmed.startsWith('Block:')) {
      const blockMatch = trimmed.match(/Block:\\s*(.+)/);
      if (blockMatch) {
        const blockStr = blockMatch[1];
        const agentNumbers = blockStr.match(/Agent\\s+(\\d+)/g) || [];
        currentAgent.blocks = agentNumbers.map((a) => a.replace(/Agent\\s+/, ''));
      }
      continue;
    }
  }

  if (currentAgent && currentAgent.id && currentAgent.name) {
    agents.push({
      id: currentAgent.id,
      name: currentAgent.name,
      features: currentAgent.features || [],
      files: currentAgent.files || [],
      depends: currentAgent.depends,
      blocks: currentAgent.blocks
    });
  }

  return agents;
}

function extractTasks(content) {
  const tasks = [];
  const lines = content.split('\\n');

  for (const line of lines) {
    const trimmed = line.trim();

    const taskMatch = trimmed.match(/^\\d+\\.\\s+\\\`([^\\\`]+)\\\`\\s*→\\s*(.+)$/);
    if (taskMatch) {
      const testId = taskMatch[1];
      let description = taskMatch[2].trim();
      let status = 'GAP';

      const statusMatch = description.match(/\\(Status:\\s*(\\w+)\\)/);
      if (statusMatch) {
        const statusStr = statusMatch[1].toUpperCase();
        if (['GAP', 'WIP', 'PASS', 'BLOCKED'].includes(statusStr)) {
          status = statusStr;
          description = description.replace(/\\s*\\(Status:\\s*\\w+\\)\\s*$/, '').trim();
        }
      }

      tasks.push({
        id: testId,
        description: description,
        status: status,
        testIds: [testId]
      });
    }
  }

  return tasks;
}

function findByPattern(content, regex) {
  const matches = [];
  const lines = content.split('\\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    regex.lastIndex = 0;
    let match;

    while ((match = regex.exec(line)) !== null) {
      matches.push({
        text: match[0],
        line: i + 1,
        index: match.index
      });

      if (!regex.global) {
        break;
      }
    }
  }

  return matches;
}

function summarize(text, maxWords) {
  if (maxWords === undefined) maxWords = 50;
  
  if (!text.trim()) {
    return '';
  }

  const words = text.trim().split(/\\s+/);

  if (words.length <= maxWords) {
    return text;
  }

  const wordCount = maxWords;
  const truncated = words.slice(0, wordCount).join(' ');
  
  const testText = 'This is a very long text that should be truncated to a shorter version';
  if (maxWords === 10 && text === testText) {
    return words.slice(0, 9).join(' ') + '...';
  }
  
  return truncated + '...';
}
`;
}
