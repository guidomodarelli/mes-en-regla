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
  - `https://www.googleapis.com/auth/drive.appdata`
- Do not request `https://www.googleapis.com/auth/drive` unless there is an explicit product requirement for full My Drive access.
- Request offline access only from the server-side OAuth flow and persist refresh tokens securely.
- Use the Google callback path for Pages Router: `/api/auth/callback/google`.

## 2. Core Architecture

### Mandatory architecture

- Prioritize hexagonal architecture from the first commit and in every change.
- Use `~/hexagonal-architecture` as the implementation reference when there is any doubt about structure, boundaries, ports, adapters, DTO placement, or testing strategy.
- Organize the codebase by vertical slice, not by technical layer at the repository root.
- Keep all technical identifiers in English: folders, files, modules, symbols, DTOs, ports, adapters, tests, and comments.

### Dependency rule

- Dependencies must always point inward.
- Allowed directions:
  - `pages` or UI entrypoints -> `application`
  - `application` -> `domain`
  - `infrastructure` -> `application`
  - `infrastructure` -> `domain`
- Forbidden directions:
  - `domain` -> `application` or `infrastructure`
  - `application` -> `infrastructure`
  - UI or pages importing external DTOs directly

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
        auth/
        repositories/
  components/
  lib/
  styles/
```

### Layer responsibilities

- `src/pages/*`
  - Route entrypoints only.
  - Compose dependencies for SSR and page-level interactions.
  - Never host domain rules.
- `domain`
  - Pure business rules, entities, value objects, and ports.
  - No framework, HTTP, Google SDK, or persistence details.
- `application`
  - Use cases and internal contracts (`commands`, `queries`, `results`).
  - Orchestrates domain behavior through ports.
- `infrastructure`
  - Adapters for Google APIs, authentication, HTTP clients, storage, and third-party SDKs.
  - Owns external DTOs and their mappers.

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

### Client-side fetching

- Client-side fetching is allowed only when SSR is not a fit, such as user-triggered refreshes, incremental interactions, or post-render mutations.
- If client-side fetching is necessary, keep it behind use cases and adapters instead of calling third-party SDKs from components.

## 5. Google OAuth and Drive Integration

### Authentication setup

- Prepare Google OAuth for user account connection through Pages Router.
- The default authentication adapter for this project is `next-auth` v4 with `GoogleProvider`, because it is compatible with Pages Router.
- Keep auth configuration in `src/pages/api/auth/[...nextauth].ts`.
- Wrap the application session boundary in `src/pages/_app.tsx`.

### OAuth behavior

- The authorization flow must support offline access when long-lived Drive access is needed.
- Prefer server-managed OAuth code exchange and secure token persistence.
- Use custom sign-in and error pages when product UX requires it, but keep sensitive failure details out of the UI.

### Google Drive rules

- Use `drive.appdata` for application metadata stored in `appDataFolder`.
- Files saved to `appDataFolder` must be created with:

```ts
parents: ['appDataFolder']
```

- Queries against `appDataFolder` must use the `appDataFolder` space.
- Do not attempt to share, move across spaces, or trash files stored in `appDataFolder`.
- Use `drive.file` for user-visible files in My Drive.
- Keep Google SDK calls isolated in infrastructure adapters.

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

## 7. Implementation Checklist

- Does the change preserve hexagonal boundaries?
- Is Pages Router still the routing mechanism?
- Is SSR the default data-loading strategy for this use case?
- Are external DTOs isolated in infrastructure?
- Are UI-facing models isolated from vendor payloads?
- Was `shadcn/ui` added through the CLI only?
- Are product styles implemented with `SCSS`?
- Are Google tokens and secrets kept server-side only?
- Were tests written first and left green at the end?
