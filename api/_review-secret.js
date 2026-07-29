const BROKER_GUIDANCE =
  'REVIEW_SECRET is required through the approved Bitwarden Secrets Manager broker: ' +
  'Invoke-WithBitwardenSecret.ps1 -CommandId <approved-command-id>; ' +
  'the docket-sync command authorizes sync-cloud.js only';

function requireReviewSecret(environment = process.env) {
  const value = environment.REVIEW_SECRET;
  if (typeof value === 'string' && value.trim()) return value.trim();
  throw new Error(BROKER_GUIDANCE);
}

module.exports = {
  BROKER_GUIDANCE,
  requireReviewSecret,
};
