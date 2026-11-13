// No security headers, and a server secret inlined into the client bundle.
module.exports = {
  env: {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
  },
};
