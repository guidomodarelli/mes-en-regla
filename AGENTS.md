# AGENTS

## 1. Security & Environment

### Security baseline

- Never hardcode secrets, OAuth credentials, refresh tokens, API keys, or user tokens in source code, tests, fixtures, screenshots, or documentation.
- Keep sensitive credentials only in environment variables and server-side secret storage.
- Treat Google access tokens and refresh tokens as server-only data. They must never be exposed to the browser, serialized in page props, or logged.
- Validate and sanitize all external input before it crosses into `application` or `domain`.
- Avoid leaking internal errors, stack traces, provider payloads, file identifiers, or token data in UI messages.

**rule file**: `.agentic-rules/nodejs/nodejs-security-patterns-rules_v1.md`

### OAuth and Google API security

- Configure OAuth scopes in both the Google Cloud consent screen and the application code.
- Use least privilege by default:
  - `openid`
  - `email`
  - `profile`
  - `https://www.googleapis.com/auth/drive.file`
- Do not request `https://www.googleapis.com/auth/drive` unless there is an explicit product requirement for full My Drive access.
- Request offline access only from the server-side OAuth flow and persist refresh tokens securely.
- Use the Google callback path for Pages Router: `/api/auth/callback/google`.

## 2. Core Architecture

### Mandatory architecture

- Prioritize hexagonal architecture from the first commit and in every change.
- Use `~/hexagonal-architecture` as the implementation reference when there is any doubt about structure, boundaries, ports, adapters, DTO placement, or testing strategy.
- Organize the codebase by vertical slice, not by technical layer at the repository root.
- Do not create or reintroduce a generic `src/server` layer. Server-only code must belong to a feature module or to a dedicated shared module under `src/modules`.
- Keep all technical identifiers in English: folders, files, modules, symbols, DTOs, ports, adapters, tests, and comments.

### Dependency rule

- Dependencies must always point inward.
- Allowed directions:
  - `pages` or `pages/api` entrypoints -> `application`
  - `pages` or `pages/api` entrypoints -> `infrastructure` only for framework wiring, adapter selection, and dependency composition
  - `application` -> `domain`
  - `infrastructure` -> `application`
  - `infrastructure` -> `domain`
- Forbidden directions:
  - `domain` -> `application` or `infrastructure`
  - `application` -> `infrastructure` or generic `lib`
  - UI or pages importing external DTOs directly
  - Any layer importing from a generic `src/server` folder

### Target structure

```text
src/
  pages/
    api/
  modules/
    <feature>/
      domain/
        entities/
        value-objects/
        repositories/
      application/
        commands/
        queries/
        results/
        use-cases/
      infrastructure/
        api/
          dto/
          mapper.ts
        google-drive/
        next-auth/
        oauth/
        auth/
        repositories/
    shared/
      domain/
      application/
      infrastructure/
  components/
  lib/
  styles/
```

### Layer responsibilities

- `src/pages/*`
  - Route entrypoints and framework composition roots only.
  - Compose dependencies for SSR, API handlers, and page-level interactions.
  - They may import `application` and module-scoped `infrastructure` only to wire framework adapters to use cases.
  - Keep client-side session lookup, async workflows, and complex form orchestration in the page or in a module-scoped container, not inside presentational components.
  - Never host domain rules.
- `src/components/*`
  - Presentational components by default.
  - Receive state, derived messages, results, and callbacks through props when an interaction depends on auth session state, HTTP requests, or multi-step UI workflows.
  - Do not call module infrastructure adapters directly from presentational components.
  - Do not import client adapters from `lib` either. Files named like `*api*`, `*client*`, or `*adapter*` under `src/lib` must be treated as adapter code and kept out of presentational components.
- `domain`
  - Pure business rules, entities, value objects, and ports.
  - No framework, HTTP, Google SDK, or persistence details.
- `application`
  - Use cases and internal contracts (`commands`, `queries`, `results`).
  - Orchestrates domain behavior through ports.
  - Validate and normalize inputs through domain value objects or application contracts, not through generic helpers in `lib`.
- `infrastructure`
  - Adapters for Google APIs, authentication, HTTP clients, storage, and third-party SDKs.
  - Owns external DTOs and their mappers.
  - Shared server-only helpers must still live under a module infrastructure folder, never under `src/server`.
- `lib`
  - Reserved for framework-safe helpers, UI utilities, and client-only adapters that are not business rules.
  - `application` and `domain` must never import from `lib`.
  - If a file under `lib` wraps endpoint calls or transport concerns, name it clearly (`*api*`, `*client*`, `*adapter*`) so lint can classify it as adapter code.
  - If a helper starts encoding use-case rules, provider details, or DTO mapping, move it into the owning module.

## 3. Bootstrap Standards

### Framework baseline

- The project must be built with Next.js using Pages Router.
- Use the official CLI to initialize the repository.
- Preferred bootstrap command:

```bash
npx create-next-app@latest . --ts --eslint --tailwind --src-dir --import-alias "@/*" --disable-git
```

- When prompted by the CLI, choose `No` for App Router.
- If the current directory is not compatible with direct initialization, scaffold into a temporary directory with the official CLI and then move the generated files into this repository without touching the existing `.git`.

### UI baseline

- Use `shadcn/ui` following the official installation flow.
- Prefer `shadcn/ui` components whenever a user request can be satisfied with an existing component or variant from the library.
- When touching existing UI, replace custom components with the closest `shadcn/ui` component or composition if the current behavior can be preserved.
- When adding new UI or features that need interface building blocks, use `shadcn/ui` components by default.
- If no existing `shadcn/ui` component or variant can satisfy the requested UX without forcing a poor implementation, stop and ask the user how they want to proceed before building a custom alternative.
- Initialize it with the official CLI:

```bash
npx shadcn@latest init -t next
```

- Every `shadcn/ui` component must be added through the CLI only:

```bash
npx shadcn@latest add button
```

- Never hand-copy `shadcn/ui` components from documentation or other repositories.
- Keep generated `shadcn/ui` components close to their defaults and customize behavior through composition first.

### Receipt upload baseline

- Every new or updated **receipt upload flow** must use the Untitled UI `file-upload-base` component (or the project wrapper built on top of it) as the upload interaction baseline.
- Receipt uploads must support drag and drop plus click-to-select.
- When the upload implementation exposes progress, the UI must render it with the file uploader progress UI instead of custom ad-hoc indicators.

### Toast notifications baseline

- Use `Sonner` integrated with `shadcn/ui` as the standard notification system for user-facing events.
- Mount a global toaster once in `src/pages/_app.tsx` and trigger notifications from page/container handlers.
- Select toast type by event intent:
  - `default`: neutral messages that acknowledge a relevant user action.
  - `success`: completed operations with expected result.
  - `info`: contextual updates that are not success/error states.
  - `warning`: validation issues or conditions requiring user attention.
  - `error`: failed operations and recoverable faults.
  - `promise`: async flows (`async/await`) to show loading, success, and failure lifecycle.
- Prefer `toast.promise` for write operations to keep async feedback consistent.
- Keep toast copy concise, clear, and safe: never expose secrets, raw provider payloads, tokens, or stack traces.
- Toasts complement existing UI feedback and must not break accessibility semantics (`aria-live`, alert roles, and form errors).

### Styling baseline

- `SCSS` is the styling solution for product code.
- Install Sass officially for Next.js support.
- Use:
  - `*.module.scss` for component-scoped styles
  - `src/styles/*` for global styles, tokens, mixins, and layout primitives
- Avoid inline styles except for rare runtime-only values.
- Tailwind remains available only because it is part of the official `shadcn/ui` setup. Product styling should default to `SCSS`.

## 4. SSR-First Data Flow

### Default data strategy

- Prioritize SSR for external data retrieval.
- In Pages Router, `getServerSideProps` is the preferred inbound adapter for page data loading.
- A page should have a single primary data entrypoint whenever possible.
- Do not scatter external fetches across presentational components when the page can resolve them server-side.

### Middleend rule

- Centralize mapping and adaptation of external data in a middleend layer inside the hexagonal flow.
- External contracts belong to infrastructure:
  - `src/modules/<feature>/infrastructure/api/dto/*`
  - `src/modules/<feature>/infrastructure/api/mapper.ts`
- Internal contracts for the UI belong to application:
  - `commands/`
  - `queries/`
  - `results/`
- Use this conversion flow:

```text
External API/SDK -> infrastructure DTO -> infrastructure mapper -> domain entity/value object -> use case -> application result -> page props/UI model
```

- Never pass Google API DTOs directly to page components.
- Never import bootstrap builders, OAuth config, Drive clients, or API error mappers from a generic `src/server` path.

### Client-side fetching

- Client-side fetching is allowed only when SSR is not a fit, such as user-triggered refreshes, incremental interactions, or post-render mutations.
- If client-side fetching is necessary, keep it behind use cases and adapters instead of calling third-party SDKs from components.
- When a page needs client-side fetching plus auth/session state, prefer a container/presenter split:
  - page or container owns session, fetch, mutation state, and validation flow
  - presentational component renders props and emits callbacks only

## 5. Google OAuth and Drive Integration

### Authentication setup

- Prepare Google OAuth for user account connection through Pages Router.
- The default authentication adapter for this project is `next-auth` v4 with `GoogleProvider`, because it is compatible with Pages Router.
- Keep the NextAuth handler in `src/pages/api/auth/[...nextauth].ts`.
- Keep `authOptions`, OAuth config, token refresh logic, and Google client factories inside `src/modules/auth/infrastructure/*`.
- Wrap the application session boundary in `src/pages/_app.tsx`.

### OAuth behavior

- The authorization flow must support offline access when long-lived Drive access is needed.
- Prefer server-managed OAuth code exchange and secure token persistence.
- Use custom sign-in and error pages when product UX requires it, but keep sensitive failure details out of the UI.

### Google Drive rules

- Store internal application data in the database (Turso), not in Drive app data storage.
- Use `drive.file` for user-visible files in My Drive.
- Keep Google SDK calls isolated in infrastructure adapters.
- Keep Google Drive error mapping and Drive client factories inside module infrastructure folders such as `src/modules/storage/infrastructure/*` and `src/modules/auth/infrastructure/*`.

### Technical error traceability (mandatory)

- Every technical error from SSR flows or external API/provider/database integrations must include a stable `errorCode` with format `E####`.
- Use the shared centralized error-code catalog under `src/modules/shared/infrastructure/errors/*` and do not introduce ad-hoc or duplicated codes.
- API technical error envelopes must return both `error` and `errorCode`; keep success envelopes unchanged.
- Request/query/body validation errors (form/business validation) must not expose `errorCode` to the UI.
- Global UI errors (page-level feedback and toasts) must keep the current generic message and render `errorCode` as secondary text below it.
- Whenever a new feature can introduce technical errors, or when an existing technical error without traceability is found, add/update `errorCode` coverage in the same work item.

## 6. Development Workflow

### TDD is mandatory

- Work in strict TDD for every feature, bug fix, and architectural change.
- The development sequence is always:
  1. `testing`
  2. `code`
  3. `refactor`
  4. `green`

### How to apply the cycle

#### 1. Testing

- Start by writing the smallest failing test at the correct architectural layer.
- Define the expected behavior before implementing production code.
- Prefer one clear behavior per test.

#### 2. Code

- Implement the minimum code needed to make the failing test pass.
- Respect hexagonal boundaries even in the first implementation.
- Do not skip ports, mappers, or value objects just to move faster.

#### 3. Refactor

- Refactor only after the behavior is covered.
- Improve naming, remove duplication, extract helpers, simplify adapters, and tighten boundaries.
- Preserve behavior while clarifying the design.

#### 4. Green

- Run the relevant test suite until it is green.
- A task is not complete until the relevant tests and lint checks pass.

### Testing responsibilities by layer

- `domain`
  - Unit tests for entities, value objects, and pure business rules.
- `application`
  - Unit tests for use cases using doubles for domain ports.
- `infrastructure`
  - Integration tests for adapters, DTO mappers, auth wiring, and Google API boundaries.
- `pages` and UI
  - React Testing Library tests for SSR props handling, rendering, and critical user flows.
- End-to-end
  - Add smoke coverage for critical authentication and Drive workflows.

### Testing rules

- Never place test files inside `src/pages`, because Pages Router will treat them as routes.
- When functionality changes, add or update the corresponding tests in the same work item.
- Prefer mocks at the port boundary, not at low-level vendor internals, unless the test is explicitly for an adapter.

### Lint gate (mandatory)

- Every work item must run `npm run lint` before completion.
- A change is blocked from completion if `npm run lint` exits with a non-zero status.
- If lint fails, fix the reported issues in the same work item and rerun lint until it passes.
- Do not bypass lint failures with pending TODOs or deferred follow-ups.

### Quality gates (mandatory)

- Every work item must run all three checks before completion:
  - `npm run lint`
  - `npm run typecheck`
  - `npm run test`
- A task is blocked from completion if any of these commands exits with a non-zero status code.
- If any check fails, fix the issues in the same work item and rerun the failed command(s) until all three are green.
- Do not defer these checks to follow-up tasks.

### SQL migrations push command (mandatory)

- Use `npm run push-migrations` as the single entrypoint to push SQL migrations.
- Do not run provider-specific migration push commands directly when this script exists.
- Keep provider selection inside `scripts/push-migrations.mjs` so the workflow stays consistent across providers.

## 7. Implementation Checklist

- Does the change preserve hexagonal boundaries?
- Is there any new or restored code under `src/server/`? If yes, move it into a module.
- Is Pages Router still the routing mechanism?
- Is SSR the default data-loading strategy for this use case?
- Are external DTOs isolated in infrastructure?
- Are UI-facing models isolated from vendor payloads?
- Are domain input shapes modeled as value objects and application outputs modeled as `results/` contracts?
- Was `shadcn/ui` added through the CLI only?
- Are product styles implemented with `SCSS`?
- Are Google tokens and secrets kept server-side only?
- Were tests written first and left green at the end?
- Does `npm run lint` pass with exit code `0`?
