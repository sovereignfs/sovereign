/** An image reference by digest, as `suite.lock` pins one: it begins with a letter or digit, so it can never be read as an option. */
export const IMAGE_BY_DIGEST = /^[a-z0-9][a-z0-9./_-]*(?::[A-Za-z0-9._-]+)?@sha256:[0-9a-f]{64}$/;
