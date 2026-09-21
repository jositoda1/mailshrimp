# MailShrimp

MailShrimp is a full-stack email marketing platform that I am rebuilding

with React, TypeScript, Node.js, and independently deployable backend

microservices.

## Project status

The project is currently in active local application development and validation. I develop and test changes locally before submitting them through GitHub CI, and I am intentionally postponing continuous deployment and Lightsail deployment work until the application is ready.

The first active backend service is `accounts-service`. Its Express foundation, health endpoint, executable server entry point, validated environment configuration, structured logging, HTTP request correlation, shared HTTP status package integration, authentication configuration, JWT token service, tests, linting, type checking, and production build are implemented and passing locally.

The clean repository is published to the new GitHub repository. I do not reuse the compromised repository or its history. New application work is developed on feature branches and is merged into `main` only after local quality gates and pull-request CI succeed.

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

│   └── http/          # Shared HTTP protocol primitives

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

The previous MailShrimp project used a `\_\_commons\_\_` directory for

shared functionality.

In the rebuilt codebase, I use `packages/` for code that is genuinely

reusable across applications or services. I do not move code into

`packages/` simply because two services currently contain similar code.

I introduce a shared package only when the responsibility is stable and

sharing does not create unnecessary coupling between independently

deployable microservices.

### HTTP protocol package

The first shared package is `@mailshrimp/http`, located under

`packages/http`. I chose a responsibility-specific package instead of

reintroducing a generic `\_\_commons\_\_` directory because shared packages

should have a clear, stable purpose and must not become dumping grounds

for unrelated business logic.

The package currently exports `HttpStatus` through its public package

entry point. Consumers import it as:

``` typescript

import { HttpStatus } from "@mailshrimp/http";

```

I do not import another package through relative paths such as

`../../../packages/http/src/...`, and consumers do not deep-import its

internal source files. This preserves the package boundary and leaves

the implementation free to evolve behind an explicit public API.

The current enum contains the HTTP statuses needed by the project or

expected in the near term:

``` typescript

export enum HttpStatus {

  OK_200 = 200,

  CREATED_201 = 201,

  NO_CONTENT_204 = 204,

  BAD_REQUEST_400 = 400,

  UNAUTHORIZED_401 = 401,

  FORBIDDEN_403 = 403,

  NOT_FOUND_404 = 404,

  CONFLICT_409 = 409,

  TOO_MANY_REQUESTS_429 = 429,

  INTERNAL_SERVER_ERROR_500 = 500,

  BAD_GATEWAY_502 = 502,

  SERVICE_UNAVAILABLE_503 = 503,

}

```

I include the numeric HTTP code in each enum member name so the protocol

meaning and numeric value are visible together at every call site. The

enum value is still the actual numeric HTTP status used by Express,

tests, and logs. If the application later needs textual HTTP reason

phrases, I will model those separately instead of overloading this enum.

The HTTP request logger intentionally keeps numeric `400` and `500`

thresholds when selecting log severity. Those values represent HTTP

status-class boundaries (`4xx` and `5xx`), not the specific

`BAD_REQUEST_400` or `INTERNAL_SERVER_ERROR_500` responses, so replacing

those boundaries with enum members would communicate the wrong intent.

`@mailshrimp/http` is a private npm workspace with its own strict

TypeScript, ESLint, Jest, test, type-check, and build configuration. Its

`exports` field defines the public package entry point explicitly so

internal files are not part of the supported consumer API.

### Workspace package resolution

I use the real npm workspace package name for imports between packages

and services. I reserve source aliases for imports within an application

or package; I do not use TypeScript aliases to reach into another

workspace's `src` directory.

I require workspace imports and aliases to resolve consistently across

TypeScript, ESLint, Jest, build, and runtime. Tests resolve internal

workspace packages through their public package names and do not depend

on pre-existing generated `dist` artifacts.

For `@mailshrimp/http`, TypeScript development/type resolution uses the

public `src/index.ts` entry point while the runtime import condition

points to compiled `dist/index.js`. This allows type checking from a

clean checkout before package build artifacts exist while preserving

compiled JavaScript as the production runtime contract.

The `accounts-service` Jest configuration maps `@mailshrimp/http` to

that package's public source entry point during tests. I map only the

public entry point, not implementation files. This was validated after

deleting `packages/http/dist`: repository type checking and tests still

passed without pre-existing generated output.

The repository currently provides `ts-jest` 29.4.9 as a root development

dependency so shared workspaces can use the common test transformer. The

`accounts-service` currently declares the same version as well, and npm

dedupes that installation at the root. I will only centralize additional

development tool dependencies when doing so is an explicit

repository-wide decision rather than an incidental cleanup.

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

-   Pino 10.3.1 for structured application and HTTP logging.

-   jose 6.2.12 for JWT signing and verification.

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

The current structure includes:

``` text
services/accounts-service/
├── __tests__/
│   ├── helpers/
│   │   └── test-logger.ts
│   ├── environment.test.ts
│   ├── health.test.ts
│   ├── http-logger.test.ts
│   ├── logger.test.ts
│   ├── request-context.test.ts
│   ├── token-config.test.ts
│   └── token-service.test.ts
├── src/
│   ├── auth/
│   │   ├── token-config.ts
│   │   └── token-service.ts
│   ├── config/
│   │   └── environment.ts
│   ├── logging/
│   │   └── logger.ts
│   ├── middleware/
│   │   ├── http-logger.ts
│   │   └── request-context.ts
│   ├── app.ts
│   └── server.ts
├── .env.example
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

I disable Express's `X-Powered-By` response header in `createApp()`.

Clients do not need to know which server framework implements the API,

so I avoid unnecessary technology disclosure. An automated health-route

regression test verifies that the header remains absent.

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

## Logging and observability

I treat logging as a core operational and security requirement rather

than something to add after deployment. The goal is to make application

errors, suspicious API activity, request failures, and service lifecycle

events diagnosable without exposing credentials or other sensitive data.

The `accounts-service` currently uses Pino 10.3.1. I use Pino because it

produces structured JSON efficiently and provides centralized redaction

support. Structured logs are intended to remain machine-readable so they

can later be collected, searched, retained, and connected to monitoring

and alerting.

The shared logger configuration lives in:

``` text

services/accounts-service/src/logging/logger.ts

```

Every default log entry identifies the service as `accounts-service`.

The executable server records startup with the `service_started` event

instead of using `console.log`.

### Log levels

The current HTTP logging policy uses:

-   `info` for successful requests and normal responses below HTTP 400;

-   `warn` for HTTP 4xx client-error responses;

-   `error` for HTTP 5xx server-error responses.

These levels provide useful operational filtering without treating every

client error as a server failure.

### Sensitive-data protection

I never intentionally log passwords, access tokens, refresh tokens,

cookies, `Authorization` values, client secrets, private keys, or other

credentials.

The Pino configuration also applies centralized redaction to common

sensitive field paths and replaces protected values with `[REDACTED]`.

This redaction is a defensive safety layer, not permission to log

arbitrary objects.

HTTP request logging does not automatically include request bodies,

response bodies, cookies, authorization headers, or query values. Those

locations may contain credentials, personal information, email

addresses, campaign data, or other sensitive information.

Automated tests verify that known secret values are absent from the

serialized Pino output and that the redaction marker is present. I test

the actual serialization behavior rather than assuming that the

configuration is safe.

### Request correlation

Every request that reaches the Express application receives an internal

UUID request identifier.

The identifier is exposed to the client through:

``` text

X-Request-ID

```

and is included as `requestId` in the corresponding HTTP log entry. This

allows a client-visible failure to be correlated with the server-side

event that processed it.

I currently generate the internal request ID myself and do not trust a

client-supplied `X-Request-ID`. This prevents an external caller from

controlling identifiers used by internal logs. A future trusted

cross-service correlation design can distinguish internal propagation

from arbitrary external input when service-to-service communication is

implemented.

### HTTP request logs

The HTTP middleware records a completed-request event containing

diagnostic metadata such as:

``` json

{

  "service": "accounts-service",

  "event": "http_request_completed",

  "requestId": "<generated UUID>",

  "method": "GET",

  "path": "/health",

  "statusCode": 200,

  "durationMs": 5.204

}

```

Request duration is measured with Node.js's monotonic high-resolution

clock so wall-clock adjustments do not distort elapsed-time

measurements.

The middleware waits for the response `finish` event before recording

the completed request. This makes the final HTTP status and elapsed time

available to the log entry.

### Logging tests

Logging is tested through real Pino output captured in memory rather

than by mocking `console.log`.

The reusable test helper is kept under `\_\_tests\_\_/helpers/` because log

capture is a testing concern and is not part of the production build.

This also keeps normal test output quiet while exercising the same Pino

configuration used by the service.

The current logging tests cover structured JSON and service metadata,

sensitive-value redaction, non-sensitive diagnostic context, request-ID

creation and uniqueness, rejection of client-controlled request IDs,

HTTP completion metadata, severity for 4xx and 5xx responses, and the

absence of sensitive authentication values from HTTP logs.

### Future centralized observability

Local structured logging is the application foundation, not the final

production observability system.

When the services are deployed, I plan to define log retention and

rotation and centralize logs so events from multiple microservices can

be searched together. I also plan to add monitoring and alerts for

meaningful operational and security conditions.

Security-specific application events will be added alongside the

authentication and API-protection features they describe. Examples

include failed authentication attempts, invalid or revoked tokens,

refresh-token reuse, rate-limit events, and rejected or invalid

webhooks.

Application logging complements infrastructure controls such as WAF,

rate limiting, firewall restrictions, metrics, and alerts. It does not

replace those controls.

## Testing

I keep automated tests in `\_\_tests\_\_` directories and use descriptive

`*.test.ts` filenames.

The current `accounts-service` suite contains five test suites and

twenty-two tests. The `@mailshrimp/http` package adds one suite with

three tests, for six suites and twenty-five passing tests

repository-wide.

`health.test.ts` uses Supertest against `createApp()` and verifies the

actual HTTP status and response body of `GET /health` without opening a

network port. It also verifies that Express's `X-Powered-By` header is

not exposed.

`environment.test.ts` verifies the HTTP port configuration independently

from server startup, including valid values, invalid values, defaults,

and TCP boundary values.

`logger.test.ts` verifies structured Pino output, service metadata,

sensitive-value redaction, and preservation of non-sensitive diagnostic

context.

`request-context.test.ts` verifies request-ID creation, uniqueness, the

response header, and the rule that an external client cannot choose the

internal request identifier.

`http-logger.test.ts` verifies request completion metadata, severity

levels for 4xx and 5xx responses, correlation with the response request

ID, duration logging, and the absence of sensitive authentication

headers from HTTP logs.

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

npm audit

```

The root scripts delegate to npm workspaces, allowing each service or

application to maintain its own implementation while still participating

in repository-wide checks.

The repository-wide type check, lint, tests, and production build all

pass locally. The latest complete run contains six passing suites and

twenty-five passing tests. `npm audit` also reports zero known

vulnerabilities in the currently installed dependency tree.

The current production build contains:

``` text

services/accounts-service/dist/app.js

services/accounts-service/dist/app.js.map

services/accounts-service/dist/auth/token-config.js

services/accounts-service/dist/auth/token-config.js.map

services/accounts-service/dist/auth/token-service.js

services/accounts-service/dist/auth/token-service.js.map

services/accounts-service/dist/config/environment.js

services/accounts-service/dist/config/environment.js.map

services/accounts-service/dist/logging/logger.js

services/accounts-service/dist/logging/logger.js.map

services/accounts-service/dist/middleware/http-logger.js

services/accounts-service/dist/middleware/http-logger.js.map

services/accounts-service/dist/middleware/request-context.js

services/accounts-service/dist/middleware/request-context.js.map

services/accounts-service/dist/server.js

services/accounts-service/dist/server.js.map

```

The shared HTTP package build produces JavaScript, declarations, source

maps, and declaration maps under `packages/http/dist/`. Both workspace

`dist/` directories are generated output and are not committed to Git.

### Deterministic workspace build order

I explicitly orchestrate the root production build so internal shared

packages are compiled before services that depend on their runtime

JavaScript:

``` json

"build": "npm run build:packages && npm run build:services",

"build:packages": "npm run build --workspace @mailshrimp/http",

"build:services": "npm run build --workspace @mailshrimp/accounts-service"

```

I chose explicit workspace names at this stage because the repository

currently has one shared package and one active service. This makes the

dependency order obvious and avoids relying on npm's incidental

workspace traversal order. I can evolve the orchestration deliberately

when additional packages and services are introduced.

The `&&` operator is intentional: `build:services` runs only if

`build:packages` succeeds. This prevents a service build from continuing

after a required shared-package build has failed.

I validated this behavior from a clean generated-output state. After

removing both `packages/http/dist` and `services/accounts-service/dist`,

I confirmed that neither directory existed, ran the root

`npm run build`, observed `@mailshrimp/http` compile before

`@mailshrimp/accounts-service`, and then confirmed that both `dist`

directories had been recreated successfully.

I do not use a glob-based workspace selector such as

`--workspace=./packages/*` because the current npm 11 environment

rejected that selector. Explicit workspace names therefore form the

current build contract.

## Local runtime validation

I have also validated the compiled accounts service as a real running

process rather than relying only on unit/integration tests.

The compiled `dist/server.js` successfully started on port `3111`, and a

request to:

``` text

http://127.0.0.1:3111/health

```

returned the expected accounts-service health response.

The real response also returned an `X-Request-ID` header. The running

service emitted a structured `service_started` JSON event and a

corresponding `http_request_completed` event containing the same request

ID returned to the client, HTTP method, path, status `200`, and measured

duration.

This confirms the complete local path through the compiled JavaScript,

Node.js runtime, TCP listener, Express application, request context,

structured HTTP logging, and health route. That manual curl validation

was performed before the later `X-Powered-By` hardening change; the

current header behavior is covered by an automated regression test and

can be rechecked manually after the next compiled runtime start.

## Security and repository hygiene

The previous project repository must not be reused as trusted history

because it was compromised. I therefore rebuilt the new project locally

and reviewed the source tree before initializing a new Git history.

Before the first commit I checked sensitive filenames and extensions,

reviewed the real project files outside generated directories, and

scanned project content for common credential and secret patterns. No

matching secrets were found in that review.

Before preparing the current staged changes, I repeated repository

hygiene checks. I checked tracked and untracked paths for common

sensitive filename patterns and scanned source content for common

private-key, AWS credential, password, API-key, and token patterns

without printing candidate secret values. The only content-pattern

matches were deliberate `password`, `access_token`, and `refresh_token`

fixtures in logging/redaction tests. No private-key or AWS access-key

pattern was found. I also ran `git diff --check` and

`git diff --cached --check`; both completed without whitespace errors.

The new local Git repository uses the `main` branch and began with the

clean root commit `56d06c1` (`chore: initialize MailShrimp project`). A

GitHub remote has not yet been configured.

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

## Authentication

Authentication is being implemented incrementally. The configuration and JWT token-service foundations are implemented; registration, login, password hashing, refresh endpoints, refresh-token persistence/rotation, logout, and authenticated business routes are still planned.

The intended end-to-end model uses short-lived access tokens, longer-lived rotating refresh tokens, Secure and HttpOnly refresh-token cookies where appropriate, centralized frontend authentication/API handling, automatic refresh after an eligible `401`, retry of the original request after successful refresh, single-flight refresh behavior, and server-side refresh-token revocation/reuse protection.

Password hashing is separate from JWT handling. `jose` signs and verifies authentication tokens; it does not hash passwords. I will select and document the password-hashing implementation when registration/login persistence is implemented, rather than carrying a dependency forward only because the previous project used it.

Cookie domain, path, expiry, Secure, and SameSite settings will be finalized from the actual frontend/API deployment domains rather than guessed prematurely.

Before considering authentication complete, I plan to cover valid and invalid login, password verification, valid access tokens, expired access with valid refresh, expired refresh, revoked refresh, refresh-token rotation and reuse, logout, and simultaneous `401` behavior with automated tests.

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

I use a feature-branch workflow for new application changes. I do not merge unfinished work directly into `main`.

``` text
main
  └── feature branch
        ├── implement and document the change
        ├── npm run typecheck
        ├── npm run lint
        ├── npm test
        ├── npm run build
        ├── npm audit
        ├── review Git status/diff and secret hygiene
        ├── commit and push the feature branch
        ├── open a pull request to main
        ├── require CI quality gates to pass
        └── merge to main
```

I develop and validate locally in VS Code first. Documentation is updated before the feature is submitted. The current CI workflow runs for pull requests targeting `main` and for pushes to `main`, so pushing a feature branch alone does not trigger the current CI workflow; opening the pull request does.

I do not deploy unfinished local changes directly to the production server. Bug fixes should include regression tests whenever a practical automated test can reproduce the defect. Continuous deployment and Lightsail deployment work are intentionally deferred until the application implementation and integration are ready.

## CI/CD

The clean local Git history is now published to the new GitHub

repository, and `main` tracks `origin/main`. I did not reuse the

previous compromised repository or its history.

Continuous integration is defined in `.github/workflows/ci.yml`. I run

the workflow for pull requests targeting `main` and for pushes to

`main`. This keeps proposed changes and the resulting main branch

subject to the same repository-wide validation.

The CI job runs on `ubuntu-latest` with Node.js 24 and npm caching

enabled. I use `npm ci` rather than `npm install` because CI should

install reproducibly from `package-lock.json` and fail if the package

manifest and lockfile are out of sync. The workflow then runs the same

quality gates used locally:

``` text

npm ci

npm run typecheck

npm run lint

npm test

npm run build

```

The build step uses the explicit package-before-service orchestration

described above, so a fresh GitHub Actions checkout must compile

`@mailshrimp/http` before `@mailshrimp/accounts-service`.

I grant the CI workflow only `contents: read`. The validation job does

not need repository write access, so I do not give it broader

permissions.

CI and CD are intentionally separate. The current workflow does not

deploy, does not contain deployment credentials, and does not require

application secrets.

I committed and pushed the first CI workflow to `main` and observed its

first real GitHub Actions execution complete successfully. The

`Quality gates` job passed on a clean GitHub-hosted Linux runner,

validating dependency installation, type checking, linting, tests, and

the production build outside the local Windows development environment.

I can inspect future workflow runs from the VS Code terminal with GitHub

CLI commands such as `gh run list`, `gh run watch`, and `gh run view`;

`gh run view --log-failed` is useful when a run fails.

GitHub reported informational runner/action notices during that

successful run, including the Node.js runtime transition for

`actions/checkout\@v4` and `actions/setup-node\@v4`, and the announced

future migration of the `ubuntu-latest` runner label. These notices did

not fail the quality gates. I will treat runner/action-version

maintenance separately from application deployment.

I will add continuous deployment only after inspecting how the existing

Lightsail service is currently started, supervised, and restarted. I do

not want the deployment workflow to assume a process manager or restart

mechanism that differs from production. Deployment will be allowed only

after required validation succeeds, and sensitive credentials must

remain outside source control using an appropriate secret mechanism.

## Authentication configuration foundation

I have implemented the first authentication configuration foundation in

`accounts-service` before introducing login, registration, token

signing, refresh-token rotation, or authenticated routes.

### Token lifetime policy

I keep the initial token policy in

`services/accounts-service/src/auth/token-config.ts`. Access tokens have

a 15-minute lifetime and refresh tokens have a seven-day lifetime. The

refresh-token cookie lifetime is derived from the refresh-token

lifetime, and the dedicated cookie name is `mailshrimp_refresh_token`.

I keep these durations in version-controlled application code because

they are currently application security/session policy rather than

secrets. The seven-day lifetime does not mean a refresh token will

remain reusable without controls for seven days. I will implement

refresh-token rotation, server-side state/revocation, reuse handling,

and final cookie attributes with the authentication flow. The intended

production browser cookie is `HttpOnly` and `Secure`.

### Authentication signing secrets

`services/accounts-service/src/config/environment.ts` now validates

`ACCESS_TOKEN_SECRET` and `REFRESH_TOKEN_SECRET`. I require both values,

require each to contain at least 32 characters, and reject configuration

where both token classes use the same value. Length is a configuration

safeguard; real values must still come from a cryptographically secure

random source.

I keep access-token and refresh-token signing credentials separate so

the two token classes can be managed or rotated independently.

Configuration errors never echo supplied secret values because startup

and deployment errors can be captured in logs. The executable server

validates authentication configuration before opening its HTTP listener,

so invalid authentication configuration fails fast.

### Local environment files and startup

The public contract is `services/accounts-service/.env.example`; real

local credentials belong in the ignored

`services/accounts-service/.env`. I verified with `git check-ignore`

that the real file is ignored before placing local secrets in it. I

generated the two local signing values independently with Node's

cryptographically secure `crypto.randomBytes()` API. Real secret values

must never be copied into documentation, source code, tests, logs,

commits, or example files.

The local command is

`npm run start:local --workspace @mailshrimp/accounts-service`. It uses

Node.js 24 native `--env-file=.env` support, so I do not add a `dotenv`

dependency merely to load local development configuration. The normal

`start` script remains environment-neutral for production, and tests

inject explicit values instead of loading developer secrets.

I manually validated local startup after building the service. It loaded

the ignored `.env`, validated authentication configuration, opened port

3111, and emitted the structured `service_started` event without logging

either authentication secret.

### Authentication configuration tests

Tests cover token lifetimes, derived cookie lifetime, cookie name,

required signing credentials, the minimum-length boundary, separation of

access and refresh secrets, and protection against secret disclosure in

configuration errors.

After this foundation was added, I ran `npm run typecheck`,

`npm run lint`, `npm test`, `npm run build`, and `npm audit`. All gates

passed. The accounts service passed 33 tests across six suites and the

shared HTTP package passed three tests in one suite, for 36 tests across

seven suites in the repository. The root build compiled the shared HTTP

package before the dependent accounts service, and `npm audit` reported

zero known vulnerabilities. The Jest VM Modules experimental warning

remains known and non-failing.

## JWT token service

I implemented `services/accounts-service/src/auth/token-service.ts` with `jose` 6.2.12. I chose `jose` because it provides the JWT signing and verification primitives needed by the Node.js 24 ESM/TypeScript service without requiring a separate CommonJS compatibility layer. The dependency is owned by `@mailshrimp/accounts-service`, because token cryptography is currently an accounts-service responsibility rather than a generic repository-wide concern.

The token service receives already-validated signing secrets through dependency injection instead of reading `process.env` itself. I keep environment access and validation in the configuration layer and cryptographic/token semantics in the authentication layer. This also allows tests to use deterministic test-only credentials without loading a developer's `.env`.

### Current JWT policy

I currently use `HS256` for the initial single-service signing boundary. Access and refresh tokens use separate HMAC secrets. Verification explicitly allowlists `HS256` rather than accepting an algorithm chosen freely by an incoming token.

Every issued token includes a `sub` subject identifying the account, a signed MailShrimp `tokenType` claim, an issued-at (`iat`) time, and an expiration (`exp`) time. Access tokens use the configured 15-minute lifetime and refresh tokens use the configured seven-day lifetime. The verifier requires a non-empty string subject and the expected token type after cryptographic verification.

The signed `tokenType` claim and separate signing credentials provide two independent controls against treating an access token as a refresh token or a refresh token as an access token. A JWT with a valid signature is not automatically a valid MailShrimp authentication token; the required application claims must also satisfy the expected semantics.

I treat HS256 as the current architecture decision, not an irreversible one. If access-token verification later crosses independently deployed trust boundaries, I can move to asymmetric signing so verifier services receive only public verification material and do not gain the ability to issue tokens. That decision will be made when the service-to-service authentication boundary is implemented.

Refresh-token rotation and revocation are not implemented by this JWT service alone. The refresh flow will require server-side session/token state and reuse protection; a token identifier such as `jti` can be introduced as part of that design when the persistence model is defined.

### JWT token-service tests

`token-service.test.ts` contains 11 tests. It verifies access-token and refresh-token creation/verification, exact configured token lifetimes, rejection when one token class is presented as the other, rejection of a token signed by an untrusted key, rejection of a tampered payload, rejection of a validly signed token with the wrong application token type, rejection of a token without an account subject, and rejection of an expired access token.

The tampering test intentionally replaces the JWT payload while retaining the original signature, proving that post-issuance payload modification is rejected. The expiration test creates an already-expired token with the trusted key so expiration validation is tested independently from signature failure.

After the token-service implementation and test corrections, I reran the complete repository quality gates. Type checking, linting, all tests, and the production build passed. The accounts service passed 44 tests across seven suites and `@mailshrimp/http` passed three tests in one suite, for 47 tests across eight suites repository-wide. `npm audit` reported zero known vulnerabilities.

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

At this point I have completed and locally validated the initial accounts-service and authentication-token foundations:

- npm workspace integration;
- strict TypeScript and NodeNext/ESM configuration;
- ESLint with type-aware TypeScript rules;
- Jest, ts-jest, and Supertest configuration;
- separate application and executable server entry points;
- `GET /health`;
- validated environment-based HTTP port configuration with default port `3111`;
- the private `@mailshrimp/http` workspace package and public `HttpStatus` API;
- clean-checkout TypeScript and Jest resolution for the shared package;
- prevention of Express `X-Powered-By` disclosure;
- Pino 10.3.1 structured JSON logging and centralized sensitive-field redaction;
- internally generated UUID request IDs and `X-Request-ID` response correlation;
- completed-request logging with method, path, status, duration, and severity separation;
- authentication token policy with 15-minute access tokens and seven-day refresh tokens;
- separate validated access-token and refresh-token signing secrets;
- ignored local `.env`, committed `.env.example`, and fail-fast authentication configuration;
- `jose` 6.2.12 JWT signing and verification;
- HS256 algorithm allowlisting with separate access/refresh signing keys;
- signed `tokenType`, `sub`, `iat`, and `exp` token semantics;
- 11 JWT token-service tests covering valid tokens, lifetimes, token-class separation, untrusted keys, tampering, invalid claims, and expiration;
- seven passing `accounts-service` suites with 44 passing tests;
- one passing `@mailshrimp/http` suite with three passing tests;
- 47 passing tests across eight suites repository-wide;
- successful repository-wide type checking and linting;
- successful deterministic package-before-service production build;
- `npm audit` reporting zero known dependency vulnerabilities;
- clean Git history published to the new GitHub repository;
- GitHub Actions CI with read-only repository permissions, Node.js 24, reproducible `npm ci`, and repository-wide typecheck, lint, test, and build gates;
- successful CI validation on `main`; and
- feature-branch development policy requiring local gates and pull-request CI before merge to `main`.

The current feature branch is `feat/auth-tokens`. Its local quality gates are passing. The next Git step is to review and stage the documented feature, commit it, push the feature branch, open a pull request to `main`, wait for CI to pass, and only then merge it.

The next application work will continue incrementally with tests and documentation updated alongside each meaningful behavior or architectural decision. Registration/login persistence, password hashing, refresh-token rotation/revocation, authenticated routes, the remaining backend services, frontend implementation, and full frontend/API integration remain future work. Continuous deployment and Lightsail deployment remain intentionally deferred until the application is ready.
