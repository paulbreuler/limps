import { Text } from 'ink';

interface ErrorProps {
  children: React.ReactNode;
}

export function Error({ children }: ErrorProps): React.ReactNode {
  return <Text color="red">{children}</Text>;
}
