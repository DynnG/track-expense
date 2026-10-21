export function validateBaseUrl(value: string, development: boolean) {
  const url = new URL(value);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || !['http:', 'https:'].includes(url.protocol)) throw new Error('Use an API origin without credentials, path, query parameters or fragments.');
  if (!development && url.protocol !== 'https:') throw new Error('Production requires an HTTPS API URL.');
  return url.origin;
}
