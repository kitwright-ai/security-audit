# messy-app

Deliberately messy fixture for the env-hardening scanner: scattered `process.env` reads, a
`NEXT_PUBLIC_` secret, a server variable in a client component, `||` fallbacks, a secret inlined
through next.config `env`, an incomplete `.env.example` and a `.env.local` that is not git-ignored.
Every value is fake.
