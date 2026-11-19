# Why the original `aether3d_c90154` project failed

The archive held 39 generated files (~275 KB). It looked complete from its README, but it could not install, build or run, and most of its features were mocked. Below are the findings, grouped by severity, with the file each comes from.

## 1. It could not be installed (fatal, first error a user sees)

`package.json` listed the project's own **import aliases as npm dependencies**:

```json
"@/components": "latest", "@/lib": "latest", "@/types": "latest", "@/app": "latest"
```

`@/...` is a TypeScript path alias (`tsconfig.json → paths`), not a package. npm rejects the names (`EINVALIDPACKAGENAME`) and aborts the whole install, so nothing else could even be tried. The generated README itself admits this ("automatic dependency install did not finish"). `run.sh` / `run.bat` then call `npm run dev` without `node_modules`.

**Root cause:** the generator scanned imports and added every non-relative specifier to `dependencies` without recognising path aliases. Other packages were added the same way with `"latest"` (unpinned; e.g. `bcrypt`, a native module, next to `bcryptjs`).

## 2. It could not compile even after fixing the install

Files imported by the code did not exist in the archive:

- `src/app/globals.css`, every `src/components/ui/*` (button, card, badge, table, textarea, scroll-area, toaster, motion), `src/components/providers/*`, `src/lib/utils`
- `next.config.*`, `tailwind.config.*`, `postcss.config.*`, `next-env.d.ts`
- Pages and APIs the UI calls: `/login`, `/api/auth/[...nextauth]`, `/api/checkout`, `/api/admin/chat/message`, `/checkout/success`
- `chat-thread.tsx` uses `cn()` without importing it.

## 3. The code contradicted its own database schema

| File | Uses | Schema actually has |
|---|---|---|
| `api/webhooks/stripe/route.ts` | `order.total`, `tx.license`, `key` | `totalAmount`, `UserLicense`, `licenseKey` |
| same | looks up refunds with `stripeSessionId = payment_intent` | session id ≠ payment-intent id → refunds never match an order |
| `lib/auth.ts` | `user.password`, `user.isTwoFactorEnabled` | `passwordHash`, `isTfaEnabled` |
| `prisma/seed.ts` | imports enum `Priority` | enum is `ConversationPriority` |
| `account/library/page.tsx` | `asset.name` | `title` |
| `tests/checkout.integration.test.ts` | creates `Product { price }` | no `price` column; required fields missing |

Two Prisma clients were created (`lib/db.ts` and `lib/prisma.ts`), used inconsistently.

## 4. Core features were fake or insecure

- **2FA**: the only valid code was the hard-coded string `'123456'` (`lib/auth.ts`).
- **Socket server** (`server.ts`) trusted `userId` and `role` sent by the client: anyone could claim `SUPER_ADMIN`, join `agent-inbox` and any `conversation:{id}` room. Messages were **never persisted**, got fake ids, and were always marked `DELIVERED`.
- **Support chat widget** answered with `setTimeout` fake agent replies stored in `localStorage`.
- **Agent inbox** posted to an API route that did not exist; "internal notes" was an unsaved `<textarea>`.
- **Catalog / product page** rendered hard-coded `SAMPLE_ASSETS` / `MOCK_PRODUCTS` instead of the database.
- **Cart** used three different `localStorage` keys (`cart`, `aether3d_cart`, `aether_cart`) across components, so items added on one page vanished on another.
- **Checkout** had `agreeToTerms: true` as the *default* (so the legally required withdrawal waiver was pre-ticked), fell back to a fake product id `"default-model-id"`, and tax was a flat client-side guess.
- **Downloads**: the library "Download" button only `console.log`-ed a URL on the server. There was no ownership check, limit or log, and the path `products/{id}/source.zip` never existed.
- **Webhook** created a new order on `checkout.session.completed` without idempotency, so Stripe retries duplicated orders. Refunds deleted licenses instead of revoking them, breaking the audit trail.
- **RBAC** gave `CUSTOMER` the `orders:read` permission and checked role names, not per-resource access. The audit log was called "immutable" but was a normal table, and failures to write it were swallowed.
- `lib/stripe.ts` threw at import time when `STRIPE_SECRET_KEY` was missing, which crashes any page importing it.

## 5. The tests could not pass

- `tests/pricing.test.ts` expected a subtotal of 300 for items priced 100 (Personal ×1) + 200 (Commercial ×2): the code correctly returns 500, so the test was wrong.
- The integration test used `jest.mock` after importing the module (no effect) and passed a `node-mocks-http` request to a Fetch-API route handler (`req.text()` does not exist), so it could never run.
- No jest config/TS transform existed, and Playwright tests were promised but absent.

## 6. Why this happened (process)

1. **Single-shot generation of a very large spec.** The prompt asks for a production platform (~10 subsystems). The generator emitted large UI files (a 1,039-line catalog page with mock data) but skipped the glue: configs, shared components, API routes.
2. **No compile/install loop.** Nothing was ever run: one `npm install` would have shown error #1, and one `tsc` would have shown sections 2–3.
3. **No single source of truth.** Each file was written independently, so field names drifted from the Prisma schema.
4. **Mocks standing in for logic.** Hard parts (realtime chat, signed downloads, tax, 2FA) were replaced with timers, hard-coded values and `console.log`, while the README claimed the acceptance criteria were met.

## 7. What the rebuild changes

- Valid, pinned dependencies; `npm install`, `prisma migrate` and `tsc --noEmit` all pass.
- One Prisma schema everything is typed against; a migration with an **append-only audit trigger** and trigram search indexes.
- Real TOTP (RFC 6238) with encrypted secrets; 2FA enforced for all staff; device sessions with "log out everywhere".
- Socket.IO authenticated with short-lived signed tokens (users) or signed guest tokens; room joins authorised server-side; messages persisted, deduplicated and acknowledged.
- Fulfilment only from signature-verified, idempotent webhooks; refunds/chargebacks revoke licenses and update open libraries live.
- Single-use, expiring download grants with ownership re-check, limits and logs.
- A tax engine covering EU OSS, reverse charge (VIES), UK and US states, plus sequential invoices and PDF certificates.
- 20 sample models generated in-repo (CC0), with decimated, meshopt-compressed web previews.

See the README "Status" table for what is still unfinished.
