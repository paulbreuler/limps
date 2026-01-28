import { Text } from 'ink';
import { z } from 'zod';
import { useEffect, useState } from 'react';
import { getPackageVersion, getPackageName } from '../utils/version.js';

export const description = 'Show version information';

export const options = z.object({
  check: z.boolean().optional().default(false).describe('Check for updates from npm registry'),
});

interface Props {
  options: z.infer<typeof options>;
}

export default function VersionCommand({ options }: Props): React.ReactNode {
  const currentVersion = getPackageVersion();
  const packageName = getPackageName();
  const [updateInfo, setUpdateInfo] = useState<{
    latest?: string;
    current: string;
    error?: string;
  } | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  useEffect(() => {
    if (options.check) {
      setIsChecking(true);
      // For manual checks, fetch directly from npm registry
      fetch(`https://registry.npmjs.org/${packageName}/latest`)
        .then((response) => {
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          return response.json();
        })
        .then((data: unknown) => {
          const pkgData = data as { version: string };
          const latestVersion = pkgData.version;
          if (latestVersion !== currentVersion) {
            setUpdateInfo({
              latest: latestVersion,
              current: currentVersion,
            });
          } else {
            setUpdateInfo({
              current: currentVersion,
            });
          }
          setIsChecking(false);
        })
        .catch((error: unknown) => {
          setUpdateInfo({
            current: currentVersion,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
          setIsChecking(false);
        });
    }
  }, [options.check, currentVersion, packageName]);

  if (options.check) {
    if (isChecking) {
      return (
        <Text>
          <Text color="cyan">Checking for updates...</Text>
        </Text>
      );
    }

    if (updateInfo?.error) {
      return (
        <Text>
          <Text color="yellow">Version:</Text> {updateInfo.current}
          {'\n'}
          <Text color="red">Error checking for updates:</Text> {updateInfo.error}
        </Text>
      );
    }

    if (updateInfo?.latest && updateInfo.latest !== updateInfo.current) {
      return (
        <Text>
          <Text color="yellow">Current version:</Text> {updateInfo.current}
          {'\n'}
          <Text color="green">Latest version:</Text> {updateInfo.latest}
          {'\n\n'}
          <Text color="cyan">Update available!</Text>
          {'\n'}
          Run: <Text color="green">npm update -g {packageName}</Text>
        </Text>
      );
    }

    return (
      <Text>
        <Text color="yellow">Version:</Text> {updateInfo?.current || currentVersion}
        {'\n'}
        <Text color="green">You are up to date!</Text>
      </Text>
    );
  }

  return (
    <Text>
      <Text color="cyan" bold>
        {packageName}
      </Text>{' '}
      <Text color="yellow">{currentVersion}</Text>
    </Text>
  );
}
