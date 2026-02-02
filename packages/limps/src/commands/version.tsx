import { Text } from 'ink';
import { z } from 'zod';
import { useEffect, useState } from 'react';
import { getPackageVersion, getPackageName } from '../utils/version.js';
import { renderUpdateBox } from '../utils/update-box.js';
import { isJsonMode, outputJson, wrapError, wrapSuccess } from '../cli/json-output.js';

export const description = 'Show version information';

export const options = z.object({
  check: z.boolean().optional().default(false).describe('Check for updates from npm registry'),
  json: z.boolean().optional().describe('Output as JSON'),
});

interface Props {
  options: z.infer<typeof options>;
}

export default function VersionCommand({ options }: Props): React.ReactNode {
  const currentVersion = getPackageVersion();
  const packageName = getPackageName();
  const jsonMode = isJsonMode(options);
  const [updateInfo, setUpdateInfo] = useState<{
    latest?: string;
    current: string;
    error?: string;
  } | null>(null);
  const [isChecking, setIsChecking] = useState(false);

  useEffect((): (() => void) | undefined => {
    if (!jsonMode) {
      return;
    }
    const timer = setTimeout(() => {
      const run = async (): Promise<void> => {
        try {
          if (!options.check) {
            outputJson(
              wrapSuccess({
                packageName,
                currentVersion,
              })
            );
          }
          const response = await fetch(`https://registry.npmjs.org/${packageName}/latest`);
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
          }
          const data = (await response.json()) as { version?: string };
          const latestVersion = data.version;
          outputJson(
            wrapSuccess({
              packageName,
              currentVersion,
              latestVersion,
              updateAvailable: Boolean(latestVersion && latestVersion !== currentVersion),
            })
          );
        } catch (error) {
          outputJson(
            wrapError(error instanceof Error ? error.message : 'Unknown error', {
              code: 'VERSION_CHECK_ERROR',
            }),
            1
          );
        }
      };
      void run();
    }, 0);
    return () => clearTimeout(timer);
  }, [currentVersion, jsonMode, options.check, packageName]);

  if (jsonMode) {
    return null;
  }

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
      const updateBox = renderUpdateBox(updateInfo.current, updateInfo.latest, packageName);
      return <Text>{updateBox}</Text>;
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
