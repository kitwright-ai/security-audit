# clean-app

Fixture that already follows the env-hardening pattern: one validated `src/env.ts`, imported from
`next.config.ts` so it runs at startup, no direct `process.env` reads elsewhere and a complete
`.env.example`. The scanner must report zero problems here.
