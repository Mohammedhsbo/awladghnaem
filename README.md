# Motorcycle Desktop

Standalone pnpm workspace for the Motorcycle System point-of-sale client. It
contains the React/Vite renderer, its Electron main and preload processes, and
the shared TypeScript contracts used by the client.

## Requirements

- Node.js 22
- pnpm 11.9.0

## Local development

1. Install dependencies with `pnpm install`.
2. Copy `.env.example` to `.env` and set `VITE_API_URL` to the API base URL.
3. Start Vite with `pnpm dev`.

`VITE_API_URL` is embedded in the renderer bundle and must be a public URL. Do
not place backend credentials or other secrets in `VITE_*` variables.

## Build and checks

```sh
pnpm build
pnpm typecheck
pnpm lint
```

The Vite renderer is emitted to `apps/desktop/dist`. To create the Windows
Electron installer, run `pnpm package:win`; the existing Electron Builder
configuration writes installer output to `apps/desktop/release`.

The Electron shell provides native printer discovery and printing. Hosting the
Vite renderer on Vercel creates a web client, not an installable Electron
desktop application; native printer functionality is available only in the
packaged Electron app.

## Vercel web target

Configure the Vercel project root as this repository root. The included
`vercel.json` selects Vite, runs the standalone workspace build, and publishes
`apps/desktop/dist`. Set the public `VITE_API_URL` build variable in the Vercel
project. Verify the actual API URL and allowed CORS origins before deployment.

The shared-types package is vendored in this workspace so the project can be
built independently of the original monorepo. Keep its API contract changes in
sync with the API project.
