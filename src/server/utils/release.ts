import { valid } from 'semver';

type GithubRelease = {
  tag_name: string;
  body: string;
};

async function fetchLatestRelease() {
  try {
    const response = await $fetch<GithubRelease>(
      'https://api.github.com/repos/fast-iq/awg-easy/releases/latest',
      { method: 'get', timeout: 5000 }
    );
    if (!response) {
      throw new Error('Empty Response');
    }

    const tag = response.tag_name;
    // GitHub tags may or may not include the `v` prefix and are not
    // guaranteed to be valid semver. Strip the prefix for comparison.
    const version = tag.replace(/^v/, '');

    if (!valid(version)) {
      throw new Error(`Tag is not a valid semver: ${tag}`);
    }

    const changelog = response.body.split('\r\n\r\n')[0] ?? '';
    return {
      version,
      changelog,
    };
  } catch (e) {
    SERVER_DEBUG('Failed to fetch latest releases: ', e);
    throw createError({
      statusCode: 503,
      statusMessage: 'Release information unavailable',
    });
  }
}

/**
 * Fetch latest release from GitHub
 * @cache Response is cached for 1 hour
 */
export const cachedFetchLatestRelease = cacheFunction(fetchLatestRelease, {
  expiry: 60 * 60 * 1000,
});
