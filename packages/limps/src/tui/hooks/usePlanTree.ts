import { useState, useEffect } from 'react';

export interface PlanNode {
  id: string;
  name: string;
  status: string;
  agents: AgentNode[];
}

export interface AgentNode {
  id: string;
  title: string;
  status: 'GAP' | 'WIP' | 'PASS' | 'BLOCKED';
  num: number;
}

export function usePlanTree(pollIntervalMs = 3000): PlanNode[] {
  const [plans, setPlans] = useState<PlanNode[]>([]);

  useEffect(() => {
    setPlans([]);

    const interval = setInterval(() => {
      // TODO: integrate with DB indexer
      void Promise.resolve();
    }, pollIntervalMs);

    return (): void => {
      clearInterval(interval);
    };
  }, [pollIntervalMs]);

  return plans;
}
