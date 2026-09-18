# MailShrimp

MailShrimp is a full-stack email marketing platform that I am rebuilding
with React, TypeScript, Node.js, and independently deployable backend
microservices.

## Project status

The project is currently in the local development and validation phase.
I am rebuilding it incrementally before creating the new Git repository,
configuring CI/CD, or deploying the new code to the server.

The first active backend service is `accounts-service`. Its basic
Express application, health endpoint, executable server entry point,
environment-based port configuration, tests, linting, type checking, and
production build are implemented and passing locally.

## Architecture

I use a monorepo to make local development, dependency management,
testing, and CI easier. The backend remains a microservice architecture:
each service has its own source code, configuration, tests, build,
runtime entry point, and deployment lifecycle.

``` text
mailshrimp/
├── apps/              # Frontend applications
├── docs/              # Project and architecture documentation
├── infrastructure/    # Infrastructure and deployment definitions
├── packages/          # Stable reusable packages shared when justified
├── services/          # Independently deployable backend microservices
├── package.json
├── package-lock.json
└── README.md
```

The planned backend services include:

-   `accounts-service` --- account management and authentication.
-   `contacts-service` --- contacts and contact-list management.
-   `messages-service` --- email/message creation, sending, and related
    processing.

I use `packages/` for genuinely stable reusable code instead of copying
shared implementations between services. I avoid putting
service-specific business logic there because excessive sharing would
couple otherwise independent microservices.

## Shared code

The previous MailShrimp project used a `__commons__` directory for
shared functionality.

In the rebuilt codebase, I use `packages/` for code that is genuinely
reusable across applications or services. I do not move code into
`packages/` simply because two services currently contain similar code.
I introduce a shared package only when the responsibility is stable and
sharing does not create unnecessary coupling between independently
deployable microservices.

## Package management

I use npm workspaces from the repository root:

``` json
"workspaces": [
  "apps/*",
  "services/*",
  "packages/*"
]
```

I use npm as the single package manager and keep the root
`package-lock.json` under version control so local development and CI
can install reproducible dependency versions.

Current runtime requirements are:

-   Node.js 24 or newer.
-   npm 11 or newer.

## Current technology stack

The currently configured backend toolchain includes:

-   TypeScript 5.
-   Node.js 24.
-   Express 5.
-   Jest 30.
-   ts-jest.
-   Supertest.
-   ESLint 10.
-   typescript-eslint.

The frontend is planned around React, Vite, TypeScript, functional
components, and hooks.

## TypeScript configuration

I use strict TypeScript settings because I want type errors and unsafe
assumptions to be detected during development rather than at runtime.

The `accounts-service` currently uses NodeNext module semantics and
additional strict checks such as unchecked indexed-access protection,
exact optional property types, unused-code checks, implicit-return
checks, and fallthrough protection.

I use two TypeScript configurations for different purposes:

-   `tsconfig.json` covers application source and tests for development
    and type checking.
-   `tsconfig.build.json` builds only production source under `src/`
    into `dist/`.

This separation prevents test files from being emitted into the
production build.

## ES modules and NodeNext

The `accounts-service` uses ES modules and declares `"type": "module"`
in its `package.json`.

With NodeNext semantics, I write relative TypeScript imports using the
`.js` extension that will exist after compilation. For example:

``` typescript
import { createApp } from "./app.js";
```

Jest maps those compiled-style relative imports back to the TypeScript
source during tests. This lets the source code follow the runtime ESM
import model without changing imports just for the test runner.

## Accounts service

The current structure is:

``` text
services/accounts-service/
├── __tests__/
│   ├── environment.test.ts
│   └── health.test.ts
├── src/
│   ├── config/
│   │   └── environment.ts
│   ├── app.ts
│   └── server.ts
├── eslint.config.mjs
├── jest.config.cjs
├── package.json
├── tsconfig.build.json
└── tsconfig.json
```

### Express application design

I keep Express application construction in `src/app.ts` and executable
server startup in `src/server.ts`.

`createApp()` creates and configures the Express application without
opening a TCP port. This allows Supertest to exercise the real Express
routes directly and keeps automated tests independent from network-port
availability.

Only `server.ts` opens the HTTP listener. This separation keeps
application behavior, environment configuration, and process startup
independently testable and maintainable.

### Health endpoint

The accounts service currently implements:

``` text
GET /health
```

A successful response returns HTTP `200` with:

``` json
{
  "status": "ok",
  "service": "accounts-service"
}
```

I keep this endpoint small and dependency-free so it can confirm that
the application is running and accepting requests without depending on
unrelated business functionality.

The endpoint has been tested both through Supertest and through a real
local HTTP request to the compiled service.

## Server startup and port configuration

The production entry point is `src/server.ts`, compiled to
`dist/server.js`.

I start the compiled service with:

``` bash
npm start --workspace @mailshrimp/accounts-service
```

The accounts service currently uses TCP port `3111` as its default
because that is the port assigned to it in the existing MailShrimp
deployment architecture.

I allow deployments to override the port with the `PORT` environment
variable so changing environments does not require a source-code
modification.

Port resolution and validation live in `src/config/environment.ts`
rather than inside `server.ts`. I made this separation so configuration
behavior can be tested without starting an HTTP server.

When `PORT` is absent, the service uses `3111`. When it is present, I
require an integer from `1` through `65535`. Invalid values cause
startup configuration to fail explicitly instead of allowing the service
to start with an ambiguous or unusable configuration.

The configuration function accepts an optional value for testing while
reading `process.env.PORT` by default in normal execution. This avoids
mutating global process environment state across unit tests.

The tests cover:

-   the default port `3111`;
-   a valid custom port;
-   the valid boundary ports `1` and `65535`;
-   an empty value;
-   non-numeric input;
-   zero and negative ports;
-   ports above `65535`;
-   non-integer numeric values.

## Testing

I keep automated tests in `__tests__` directories and use descriptive
`*.test.ts` filenames.

The current accounts-service suite contains two test suites and eleven
tests. All are passing locally.

`health.test.ts` uses Supertest against `createApp()` and verifies the
actual HTTP status and response body of `GET /health` without opening a
network port.

`environment.test.ts` verifies the HTTP port configuration independently
from server startup, including valid values, invalid values, defaults,
and TCP boundary values.

### Jest and ESM

I use ts-jest to execute TypeScript tests while preserving the ES-module
model used by the service.

Because NodeNext source imports reference their eventual `.js` runtime
filenames, the Jest configuration uses `moduleNameMapper` to map
relative `.js` imports back to TypeScript modules during tests.

The current Jest command runs through Node with:

``` text
--experimental-vm-modules
```

Node currently prints an `ExperimentalWarning` for VM Modules when the
tests start. This warning is expected with the current test-runner
configuration and does not represent a failing test. The flag is used by
the test process only; it is not required by the compiled production
server. I will revisit this configuration when the Node/Jest toolchain
can support the same ESM testing model without it.

## ESLint

I use ESLint with typescript-eslint and type-aware rules for TypeScript
source and tests.

Important rules currently enforce that:

-   exported/function behavior has explicit return types where
    configured;
-   promises are not silently left unhandled;
-   promises are not accidentally misused in callbacks or conditions;
-   explicit `any` does not remove TypeScript guarantees without being
    noticed.

Generated output, coverage data, dependencies, and similar artifacts are
excluded from source-quality checks.

## Local quality checks

From the repository root I run:

``` bash
npm run typecheck
npm run lint
npm test
npm run build
```

The root scripts delegate to npm workspaces, allowing each service or
application to maintain its own implementation while still participating
in repository-wide checks.

For the current `accounts-service`, all four commands pass locally.

The current production build contains:

``` text
services/accounts-service/dist/app.js
services/accounts-service/dist/app.js.map
services/accounts-service/dist/config/environment.js
services/accounts-service/dist/config/environment.js.map
services/accounts-service/dist/server.js
services/accounts-service/dist/server.js.map
```

The `dist/` directory is generated output and is not committed to Git.

## Local runtime validation

I have also validated the compiled accounts service as a real running
process rather than relying only on unit/integration tests.

The compiled `dist/server.js` successfully started on port `3111`, and a
request to:

``` text
http://127.0.0.1:3111/health
```

returned the expected accounts-service health response.

This confirms the complete local path through the compiled JavaScript,
Node.js runtime, TCP listener, Express application, and health route.

## Security and repository hygiene

The previous project repository must not be reused as trusted history
because it was compromised. I am therefore building the new project
locally first and will create a clean Git repository only after
reviewing the project tree for secrets and unwanted artifacts.

I never commit secrets such as:

-   `.env` files containing credentials;
-   private keys;
-   certificates containing private material;
-   AWS credentials or tokens;
-   GitHub tokens;
-   passwords;
-   production authentication secrets.

Example environment files such as `.env.example` may be committed only
when they contain names and safe placeholder values rather than real
credentials.

The root `.gitignore` excludes dependencies, generated builds, coverage,
logs, local environment files, private-key formats, caches, and other
local artifacts.

## Authentication plan

Authentication has not yet been implemented in the new accounts service.

The planned model uses:

-   short-lived access tokens;
-   longer-lived rotating refresh tokens;
-   refresh tokens stored using Secure and HttpOnly cookies where
    appropriate;
-   centralized frontend authentication/API handling;
-   automatic refresh after an eligible `401` response;
-   retry of the original request after successful refresh;
-   single-flight refresh behavior so simultaneous `401` responses do
    not create multiple competing refresh operations;
-   refresh-token revocation and rotation/reuse protections.

Before considering authentication complete, I plan to cover valid and
invalid login, valid access tokens, expired access with valid refresh,
expired refresh, revoked refresh, token rotation, logout, refresh-token
reuse, and simultaneous `401` behavior with automated tests.

Cookie domain, path, expiry, Secure, and SameSite settings will be
finalized from the actual frontend/API deployment domains rather than
guessed prematurely.

## Email event statistics plan

MailShrimp is intended to track provider-supported email lifecycle
events such as:

-   sent;
-   delivered;
-   opened;
-   clicked;
-   bounced;
-   failed;
-   unsubscribed.

I plan to process provider/webhook events idempotently and with privacy
considerations. Open tracking is inherently imperfect because
mail-client privacy features, image blocking, caching, and automated
scanners can affect observed events, so open statistics must not be
presented as exact human-read measurements.

## Development workflow

I follow this order for changes:

``` text
Local implementation in VS Code
        ↓
Type checking, linting, automated tests, and build
        ↓
Documentation update
        ↓
Secret/artifact review
        ↓
Git and GitHub
        ↓
CI/CD validation
        ↓
Server deployment
```

I do not deploy unfinished local changes directly to the production
server. Bug fixes should include regression tests whenever a practical
automated test can reproduce the defect.

## CI/CD plan

GitHub Actions has not been configured yet.

The planned CI pipeline will use reproducible dependency installation
and require type checking, linting, tests, and builds to succeed before
deployment is allowed.

The new Git history will be created only after the local source tree has
been reviewed for secrets and generated or compromised artifacts.

## Infrastructure documentation

The existing AWS, CloudFront, Lightsail, Apache, Certbot, firewall, IAM,
Lambda, and EventBridge Scheduler configuration will be documented
separately under the project documentation/infrastructure area after the
local application foundation is established.

Infrastructure secrets, verification headers, private keys, credentials,
and similar sensitive values will never be written into this repository.

## Documentation

Documentation is a living part of MailShrimp rather than a final cleanup
task.

I update this README and supporting documentation whenever architectural
decisions, compatibility requirements, development tooling, security
controls, services, commands, environment variables, tests, or
deployment processes change.

I preserve still-valid documentation cumulatively as the project
evolves. When an earlier decision changes, I update the affected
documentation so the repository does not contain contradictory guidance.

I document non-obvious implementation decisions in source-code and test
comments when that context helps future maintenance. The README provides
the broader project-level explanation, while comments stay close to the
code that depends on the decision.

Comments focus on architectural decisions, security constraints,
business behavior, compatibility requirements, and other non-obvious
implementation details rather than merely repeating obvious code.

Documentation is reviewed before relevant changes are submitted to
GitHub, CI/CD, or deployment.

## Current progress

At this point I have completed and locally validated the initial
accounts-service foundation:

-   npm workspace integration;
-   strict TypeScript and NodeNext/ESM configuration;
-   ESLint with type-aware TypeScript rules;
-   Jest, ts-jest, and Supertest configuration;
-   separate application and executable server entry points;
-   `GET /health`;
-   environment-based and validated HTTP port configuration;
-   default production-compatible port `3111`;
-   two passing test suites with eleven passing tests;
-   successful repository-wide type checking;
-   successful repository-wide linting;
-   successful repository-wide tests;
-   successful production build;
-   successful execution of the compiled service;
-   successful real HTTP health request on port `3111`.

The next implementation work will continue incrementally, with tests and
documentation updated alongside each meaningful behavior or
architectural decision.
