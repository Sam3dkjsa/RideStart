# RideLedger implementation plan

## Product and boundaries

Build RideLedger as a new standalone full-stack Manus WebDev project using the initialized `web-db-user` scaffold. Do not edit or replace the separate Creator’s Starter Guide website (`ai-video-starter-guide`), do not add external service integrations or public data, and do not publish RideLedger. Preserve the scaffold's Manus OAuth and the bundled `DashboardLayout` authentication flow.

## Serving and deployment

Use the scaffold's React/Vite SPA plus Express/tRPC API in the existing server container. Browser business-data requests stay same-origin under `/api/trpc`; no SSR or search indexing is required because the product is an authenticated operations dashboard. Keep personalized API responses private and uncached (`private, no-store`); use the existing static build and container contract rather than changing frameworks or enabling static-only hosting. Preview and published app paths must remain relative. Keep only `/` and `/settings` as user-facing routes and declare them in `client/public/manus-routes.json` before starting the development server.

## Application structure

- `client/src/App.tsx`: route map, app providers, and the protected app shell.
- `client/src/components/DashboardLayout.tsx`: adapt the supplied persistent sidebar labels/branding while preserving its existing OAuth, authenticated-user, and logout behavior.
- `client/src/pages/Dashboard.tsx` and `Settings.tsx`: date-range ledger dashboard and editable rider cost settings.
- `client/src/components/rideledger/`: focused daily-entry form, summary cards, recent ledger, date-range controls, chart and confirmations.
- `client/src/lib/`: small deterministic formatting and CSV-download helpers.
- `server/rideLedger/calculations.ts`: pure validated calculations and exact decimal scaling helpers.
- `server/rideLedger/db.ts`: explicitly owner-scoped data queries and mapping of DECIMAL/date values.
- `server/rideLedger/router.ts` and `server/routers.ts`: protected tRPC procedures; derive ownership only from `ctx.user.id`.
- `drizzle/schema.ts` and an additive generated SQL migration: settings and daily-ledger tables.

## Persistence and permissions

Add a settings row scoped to each authenticated user and a daily-entry row with a unique `(userId, rideDate)` constraint plus an index for owner/date-range reads. Reference the existing OAuth-backed `users.id`. Persist dates as `YYYY-MM-DD` in a MySQL DATE column, independent of timestamps. Use UTC `createdAt`/`updatedAt` timestamps. Store money, distance, efficiency, fuel volume, and reserve assumptions as DECIMAL values at appropriate scales. All procedures that read or mutate settings or rides must be protected and include `ctx.user.id` in the database predicate; do not accept an owner ID from the client. No demo or test rows are to be inserted into the managed database.

## Calculations and settings

Default only the currency selector to INR. Do not invent rider cost assumptions; the first-use flow asks for vehicle efficiency, fuel price per liter, and maintenance reserve per km, with clear editable labels and bounds. Validate inputs as finite and nonnegative, with reasonable operational maxima; rides completed is a nonnegative integer. Calculate fuel liters as distance / efficiency, fuel expense as fuel liters × price per liter, maintenance reserve as distance × reserve rate, and net profit as gross earnings − platform fees − fuel expense − maintenance reserve − other costs. Round derived money to the selected currency's minor unit and persist the displayable fuel volume to three decimals. Snapshot the three current vehicle/cost assumptions, derived liters and amounts, and net profit on every daily row so settings edits never rewrite history. Maintenance is presented as an estimate/reserve, not as a repair bill.

## User experience

Use a polished, responsive operational ledger dashboard with persistent navigation, compact cards, an accessible daily-entry workflow, a recent-record table/list, and an accurate Recharts chart built only from stored records. The dashboard offers date-range filters and displays rides completed, distance, gross earnings, platform fees, other costs, fuel consumption, estimated fuel cost, maintenance reserve, and net profit. Include an honest no-records/setup empty state, visible save/error feedback, edit/delete actions, and a CSV download limited to the signed-in user's own records. Use the scaffold's Lucide icons and installed Recharts. A fresh account must never see fabricated example business records.

## Migration, implementation checks, and delivery

Use Drizzle schema and generate a committed additive migration; apply that generated migration through the documented WebDev-managed database migration/SQL workflow, without inserting test data. Add pure unit tests for fuel, fuel expense, maintenance, net-profit arithmetic, rounding, and input validation. Verify persisted mutation/query ownership in code; exercise live persisted/auth isolation only when the real authenticated preview can do so without creating misleading seed data. Run `pnpm run check`, `pnpm test`, and the production build. After routes and code are ready, start Preview on its configured port, verify `/manus-routes.json` is served as JSON, and capture the explicitly requested desktop and mobile previews. Save one accepted canonical WebDev checkpoint after verification. Leave publication untouched and report the preview URL, sign-in/setup requirement, exact net-profit formula, and maintenance-reserve caveat.
