module.exports = ({ config }) => {
  if (process.env.EAS_BUILD === 'true') {
    const value = process.env.EXPO_PUBLIC_API_URL;
    if (!value) throw new Error('Set EXPO_PUBLIC_API_URL in the EAS build environment first.');
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('EXPO_PUBLIC_API_URL must be a public API origin only.');
    if (url.protocol !== 'https:') throw new Error('APK and store builds require an HTTPS API origin.');
  }
  return { ...config };
};
