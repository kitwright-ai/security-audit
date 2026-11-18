/** @type {import('next').NextConfig} */
module.exports = {
  env: {
    STRIPE_SECRET_KEY: process.env.STRIPE_SECRET_KEY,
    APP_NAME: "Messy",
  },
};
