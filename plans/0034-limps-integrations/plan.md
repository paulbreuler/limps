---
title: limps External Integrations
status: draft
workType: feature
tags: [limps/plan, limps/worktype/feature]
created: 2026-01-26
updated: 2026-01-27
---

# limps External Integrations

## Overview

Connect limps to the tools developers actually use. Bi-directional sync with GitHub/Linear, notifications to Slack/Discord. limps shouldn't be an island.

## Integration Matrix

| Integration | Direction | Priority | Use Case |
|-------------|-----------|----------|----------|
| GitHub Issues | Bi-directional | HIGH | Plan ↔ Issue sync |
| GitHub PRs | Read | HIGH | Link PRs to agents |
| GitLab Issues | Bi-directional | MEDIUM | GitLab users |
| Linear | Bi-directional | HIGH | Modern issue tracking |
| Jira | Bi-directional | MEDIUM | Enterprise users |
| Slack | Write | MEDIUM | Notifications |
| Discord | Write | MEDIUM | Community/OSS |
| VS Code | N/A | LOW | Extension (separate project) |

---

## GitHub Integration

### Features

1. **Plan → Issue Sync**
   - Create GitHub issue from plan
   - Update issue when plan changes
   - Close issue when plan complete

2. **Agent → Issue Sync**  
   - Create issue per agent (optional)
   - Sync status: GAP→Open, WIP→In Progress, PASS→Closed
   - Link to labels (persona, priority)

3. **PR Linking**
   - Detect PRs that reference agents
   - Auto-update agent status when PR merged
   - Show PR status in agent metadata

4. **Issue → Plan Import**
   - Import GitHub issue as new plan
   - Import milestone as plan with agent per issue

### Schema Mapping

```yaml
# Agent frontmatter
---
status: WIP
github:
  issue: 123
  repo: paulbreuler/limps
  labels: [enhancement, priority-high]
  pr: 456  # Linked PR
---
```

### Configuration

```json
{
  "integrations": {
    "github": {
      "enabled": true,
      "token": "${GITHUB_TOKEN}",  // Env var reference
      "defaultRepo": "paulbreuler/limps",
      "sync": {
        "plans": true,
        "agents": false,  // Per-agent issues optional
        "bidirectional": true
      },
      "labels": {
        "persona.coder": "type: code",
        "persona.reviewer": "type: review",
        "status.blocked": "status: blocked"
      }
    }
  }
}
```

### MCP Tools

```typescript
tool: "github_sync"
params: {
  action: "push" | "pull" | "link";
  planId?: string;
  agentId?: string;
  issueNumber?: number;
  repo?: string;
}

tool: "github_create_issue"
params: {
  planId: string;
  agentId?: string;
  repo?: string;
  labels?: string[];
}
```

---

## Linear Integration

### Features

1. **Plan → Project Sync**
   - Map limps plan to Linear project
   - Agents become Linear issues
   - Status sync both ways

2. **Cycle Integration**
   - Map Linear cycles to plan phases
   - Track velocity via Linear

3. **Label Mapping**
   - Persona → Label
   - Priority → Priority field

### Schema Mapping

```yaml
# Plan frontmatter  
---
title: Feature X
linear:
  projectId: abc123
  teamId: TEAM
---

# Agent frontmatter
---
status: WIP
linear:
  issueId: TEAM-456
  url: https://linear.app/team/issue/TEAM-456
---
```

### Configuration

```json
{
  "integrations": {
    "linear": {
      "enabled": true,
      "apiKey": "${LINEAR_API_KEY}",
      "teamId": "TEAM",
      "sync": {
        "plans": true,
        "agents": true,
        "bidirectional": true
      },
      "statusMap": {
        "GAP": "backlog",
        "WIP": "in_progress", 
        "PASS": "done",
        "BLOCKED": "blocked"
      }
    }
  }
}
```

---

## Slack Integration

### Features

1. **Notifications**
   - Agent status changes
   - Plan completed
   - Health alerts (stale content)

2. **Commands** (future)
   - `/limps status 0027` - Plan status
   - `/limps next` - Next task

### Configuration

```json
{
  "integrations": {
    "slack": {
      "enabled": true,
      "webhookUrl": "${SLACK_WEBHOOK}",
      "channel": "#dev-updates",
      "notifications": {
        "statusChange": true,
        "planComplete": true,
        "healthAlerts": true,
        "minSeverity": "warning"
      }
    }
  }
}
```

### Notification Format

```
🎉 *Agent Completed*
Plan: 0027-limps-roadmap
Agent: #003 - Implement scoring weights
Status: WIP → PASS
By: Claude (via Cursor)
```

---

## Discord Integration

Similar to Slack but for Discord webhooks:

```json
{
  "integrations": {
    "discord": {
      "enabled": true,
      "webhookUrl": "${DISCORD_WEBHOOK}",
      "notifications": {
        "statusChange": true,
        "planComplete": true
      }
    }
  }
}
```

---

## Jira Integration

### Features

1. **Issue Sync**
   - Map agents to Jira issues
   - Status sync via transitions

2. **Epic Mapping**
   - Plans map to Jira Epics
   - Agents map to Stories/Tasks

### Configuration

```json
{
  "integrations": {
    "jira": {
      "enabled": true,
      "host": "company.atlassian.net",
      "email": "${JIRA_EMAIL}",
      "token": "${JIRA_TOKEN}",
      "project": "PROJ",
      "issueType": "Task",
      "statusMap": {
        "GAP": "To Do",
        "WIP": "In Progress",
        "PASS": "Done",
        "BLOCKED": "Blocked"
      }
    }
  }
}
```

---

## Webhook System (Generic)

For custom integrations:

```json
{
  "integrations": {
    "webhooks": [
      {
        "name": "custom-tracker",
        "url": "https://api.example.com/webhook",
        "events": ["agent.status_changed", "plan.completed"],
        "headers": {
          "Authorization": "Bearer ${CUSTOM_TOKEN}"
        }
      }
    ]
  }
}
```

### Event Payload

```json
{
  "event": "agent.status_changed",
  "timestamp": "2026-01-26T12:00:00Z",
  "data": {
    "planId": "0027-limps-roadmap",
    "agentId": "003",
    "previousStatus": "WIP",
    "newStatus": "PASS",
    "actor": "mcp-client"
  }
}
```

---

## Implementation Plan

### Phase 1: GitHub Core
- [ ] GitHub API client
- [ ] Issue creation from plan/agent
- [ ] Status sync (limps → GitHub)
- [ ] `github_sync` tool

### Phase 2: GitHub Advanced
- [ ] Bi-directional sync (GitHub → limps)
- [ ] PR linking
- [ ] Label mapping
- [ ] Milestone support

### Phase 3: Notifications
- [ ] Slack webhook integration
- [ ] Discord webhook integration
- [ ] Event system for notifications
- [ ] Configurable notification rules

### Phase 4: Linear
- [ ] Linear API client
- [ ] Project/issue mapping
- [ ] Bi-directional sync
- [ ] Priority/label mapping

### Phase 5: Jira
- [ ] Jira API client
- [ ] Epic/Story mapping
- [ ] Transition handling
- [ ] Custom field support

### Phase 6: Generic Webhooks
- [ ] Webhook dispatcher
- [ ] Event payload schema
- [ ] Retry logic
- [ ] Event filtering

---

## Security Considerations

- **Tokens in env vars** - Never in config files
- **Scoped permissions** - Request minimal OAuth scopes
- **Webhook validation** - Verify signatures when possible
- **Rate limiting** - Respect API limits
- **Audit logging** - Track what synced when

---

## CLI Commands

```bash
# GitHub
limps github sync --plan 0027
limps github link --agent 003 --issue 123
limps github import --repo owner/repo --issue 456

# Linear
limps linear sync --plan 0027
limps linear import --project abc123

# Test notifications
limps notify test --slack
limps notify test --discord

# Check integration status
limps integrations status
```

---

## Success Criteria

- [ ] Create GitHub issue from plan works
- [ ] Status changes sync both directions
- [ ] Slack notifications fire on status change
- [ ] Linear bi-directional sync works
- [ ] Credentials stay secure (env vars only)

---

## Status

Status: Planning
Work Type: feature
Created: 2026-01-26
