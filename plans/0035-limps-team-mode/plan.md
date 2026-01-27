---
title: limps Team Mode
status: draft
workType: feature
tags: [limps/plan, limps/worktype/feature]
created: 2026-01-26
updated: 2026-01-27
---

# limps Team Mode

## Overview

Move limps from single-dev local tool to team collaboration platform. Add authentication, multi-user coordination, and audit trails. Solo devs → teams is the growth path.

## ⚠️ Security Warning

**RESEARCH AUTH THOROUGHLY** before deploying limps publicly. This plan outlines the features but implementation requires careful security review.

---

## Feature Set

### 1. Deployed Mode

Run limps as a persistent service:

```bash
# Local mode (current)
limps serve                    # stdio transport for MCP

# Deployed mode (new)
limps serve --deployed         # HTTP server with auth
limps serve --deployed --port 3000
```

**Transport options:**
- stdio (current) - For local MCP clients
- HTTP/SSE - For deployed mode
- WebSocket - For real-time features

### 2. Authentication

Multiple auth strategies:

#### API Keys (Simple)

```json
{
  "auth": {
    "strategy": "api-key",
    "keys": [
      {
        "id": "key_abc123",
        "name": "Cursor Client",
        "hash": "sha256:...",  // Never store plaintext
        "permissions": ["read", "write"],
        "createdAt": "2026-01-26"
      }
    ]
  }
}
```

Usage:
```
Authorization: Bearer limps_key_abc123
```

#### JWT (Better)

```json
{
  "auth": {
    "strategy": "jwt",
    "secret": "${JWT_SECRET}",
    "issuer": "limps",
    "expiresIn": "7d"
  }
}
```

#### OAuth/OIDC (Enterprise)

```json
{
  "auth": {
    "strategy": "oauth",
    "provider": "github",  // or google, okta, etc.
    "clientId": "${OAUTH_CLIENT_ID}",
    "clientSecret": "${OAUTH_CLIENT_SECRET}",
    "allowedOrgs": ["my-company"]
  }
}
```

### 3. User Identity

Track who does what:

```typescript
interface User {
  id: string;
  name: string;
  email?: string;
  avatar?: string;
  roles: Role[];
  createdAt: Date;
  lastActive: Date;
}

interface Session {
  userId: string;
  clientType: "cursor" | "claude" | "api" | "cli";
  clientName?: string;
  connectedAt: Date;
  lastActivity: Date;
}
```

### 4. Role-Based Access Control (RBAC)

```typescript
type Permission = 
  | "plans:read" | "plans:write" | "plans:delete"
  | "agents:read" | "agents:write" | "agents:claim"
  | "config:read" | "config:write"
  | "users:manage";

interface Role {
  name: string;
  permissions: Permission[];
}

const BUILT_IN_ROLES = {
  admin: ["*"],  // All permissions
  developer: ["plans:*", "agents:*", "config:read"],
  viewer: ["plans:read", "agents:read"],
  bot: ["agents:read", "agents:claim"]  // AI agents
};
```

### 5. Multi-User Task Claiming

Prevent race conditions when multiple users/agents claim tasks:

```typescript
interface TaskClaim {
  taskId: string;
  claimedBy: string;      // User ID
  claimedAt: Date;
  clientType: string;
  expiresAt?: Date;       // Auto-release if expired
  heartbeatAt: Date;
}

// Enhanced claim_task tool
tool: "claim_task"
params: {
  taskId: string;
  force?: boolean;        // Override existing claim (admin only)
}
returns: {
  claimed: boolean;
  claimedBy?: string;     // Who has it if not you
  reason?: string;
}
```

**Conflict resolution:**
- First claim wins
- Claims expire after configurable timeout (default: 4 hours)
- Heartbeat extends claim
- Admin can force-release

### 6. Audit Log

Track all mutations:

```typescript
interface AuditEntry {
  id: string;
  timestamp: Date;
  userId: string;
  action: string;         // "agent.status_changed"
  target: string;         // "plans/0027/agents/003.agent.md"
  changes: {
    field: string;
    oldValue: any;
    newValue: any;
  }[];
  clientType: string;
  clientIp?: string;
  sessionId: string;
}
```

**Stored in:**
- SQLite table (default)
- Or external: Elasticsearch, CloudWatch, etc.

### 7. Real-Time Sync

Multiple clients see changes instantly:

```typescript
// SSE endpoint
GET /events
Authorization: Bearer <token>

// Events
data: {"type": "agent.updated", "path": "...", "by": "user123"}
data: {"type": "task.claimed", "taskId": "...", "by": "user456"}
data: {"type": "user.connected", "userId": "..."}
```

---

## Configuration

```json
{
  "deployed": {
    "enabled": true,
    "port": 3000,
    "host": "0.0.0.0",
    "cors": {
      "origins": ["https://myapp.com"]
    }
  },
  "auth": {
    "strategy": "jwt",
    "secret": "${JWT_SECRET}",
    "sessionTimeout": "24h"
  },
  "rbac": {
    "enabled": true,
    "defaultRole": "developer"
  },
  "audit": {
    "enabled": true,
    "storage": "sqlite",
    "retention": "90d"
  },
  "claiming": {
    "timeout": "4h",
    "heartbeatInterval": "5m",
    "maxClaimsPerUser": 3
  }
}
```

---

## New MCP Tools

### `whoami`

```typescript
tool: "whoami"
returns: {
  userId: string;
  name: string;
  roles: string[];
  permissions: string[];
  activeClaims: string[];
}
```

### `list_users`

```typescript
tool: "list_users"  // Admin only
returns: {
  users: User[];
  activeSessions: number;
}
```

### `list_sessions`

```typescript
tool: "list_sessions"  // Admin only
returns: {
  sessions: Session[];
}
```

### `get_audit_log`

```typescript
tool: "get_audit_log"
params: {
  planId?: string;
  userId?: string;
  action?: string;
  since?: string;
  limit?: number;
}
returns: {
  entries: AuditEntry[];
}
```

---

## CLI Commands

```bash
# User management
limps users list
limps users create --name "Alice" --role developer
limps users invite --email alice@example.com
limps users roles set alice admin

# API key management  
limps keys create --name "CI Bot" --permissions read
limps keys list
limps keys revoke key_abc123

# Session management
limps sessions list
limps sessions kick <session-id>

# Audit
limps audit --plan 0027 --last 7d
limps audit --user alice --action "status_changed"

# Server
limps serve --deployed --port 3000
```

---

## Implementation Plan

### Phase 1: HTTP Transport
- [ ] HTTP server mode
- [ ] SSE transport for MCP
- [ ] Basic routing
- [ ] Health check endpoint

### Phase 2: API Key Auth
- [ ] Key generation/storage
- [ ] Request validation
- [ ] Key management CLI

### Phase 3: User Identity
- [ ] User model
- [ ] Session tracking
- [ ] `whoami` tool

### Phase 4: RBAC
- [ ] Permission system
- [ ] Role definitions
- [ ] Permission checks on tools

### Phase 5: Multi-User Claiming
- [ ] Claim locking
- [ ] Heartbeat system
- [ ] Conflict resolution

### Phase 6: Audit Log
- [ ] Audit table schema
- [ ] Mutation logging
- [ ] Query interface

### Phase 7: Advanced Auth
- [ ] JWT support
- [ ] OAuth integration
- [ ] SSO support

### Phase 8: Real-Time
- [ ] SSE event stream
- [ ] Change notifications
- [ ] Presence indicators

---

## Security Checklist

- [ ] Secrets in env vars only
- [ ] API keys hashed (never plaintext)
- [ ] Rate limiting
- [ ] Input validation
- [ ] CORS configured
- [ ] HTTPS required in production
- [ ] Session timeout
- [ ] Audit logging enabled
- [ ] Penetration testing done

---

## Success Criteria

- [ ] Multiple users can work simultaneously
- [ ] No two users can claim same task
- [ ] All changes logged with user attribution
- [ ] Unauthorized requests rejected
- [ ] Real-time updates work across clients
- [ ] Works with existing MCP clients (Cursor, Claude)

---

## Status

Status: Planning
Work Type: feature
Created: 2026-01-26
