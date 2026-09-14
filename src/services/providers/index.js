const linkedinProvider = require('./linkedin.provider');

const providers = {
  linkedin: linkedinProvider,
};

function getProvider(platform) {
  const provider = providers[platform];
  if (!provider) {
    throw new Error(`Unsupported social platform provider: ${platform}`);
  }
  return provider;
}

module.exports = {
  providers,
  getProvider,
  linkedinProvider,
};
