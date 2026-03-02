import { useState, useEffect } from 'react';
import type { AcpSessionManager } from '../../acp/session-manager.js';
import type { AcpSessionEvent } from '../../acp/types.js';

export function useAcpEvents(manager: AcpSessionManager, maxEvents = 50): AcpSessionEvent[] {
  const [events, setEvents] = useState<AcpSessionEvent[]>([]);

  useEffect(() => {
    const handler = (event: AcpSessionEvent): void => {
      setEvents((prev) => [event, ...prev].slice(0, maxEvents));
    };
    manager.on('acp:event', handler);
    return (): void => {
      manager.off('acp:event', handler);
    };
  }, [manager, maxEvents]);

  return events;
}
