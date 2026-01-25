import { Text } from 'ink';

interface SuccessProps {
  children: React.ReactNode;
}

export function Success({ children }: SuccessProps): React.ReactNode {
  return <Text color="green">{children}</Text>;
}
