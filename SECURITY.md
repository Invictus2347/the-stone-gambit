# Security

The game is a static browser application. It needs no account, API key, server, or database. The chess opponent and film encoder run locally. Hosting providers may keep their own request logs.

Do not put credentials in client code or `VITE_*` variables: bundled values are public. Development servers bind to loopback by default. Production omits development control entrypoints and the local film-upload endpoint.

If **Security → Report a vulnerability** is available, use it to report privately. Otherwise, open an issue requesting a private reporting channel without disclosing the vulnerability. Never put exploit details or credentials in a public issue. Only the latest main-branch version is maintained.

Publication checks and dependency audits reduce risk; they are not a guarantee of security. If you add network services, authentication, or uploads, review the threat model and deployment configuration before publishing.
