import { gt } from 'semver';

export default defineEventHandler(async () => {
  const insecure = WG_ENV.INSECURE;

  // Release info is optional: if GitHub is unreachable or the tag is not
  // valid semver, don't break the whole page.
  let latestRelease: { version: string; changelog: string } | null = null;
  let updateAvailable = false;

  try {
    latestRelease = await cachedFetchLatestRelease();
    updateAvailable = gt(latestRelease.version, RELEASE);
  } catch (e) {
    SERVER_DEBUG('Release check skipped:', e);
  }

  return {
    currentRelease: RELEASE,
    latestRelease,
    updateAvailable,
    insecure,
  };
});
