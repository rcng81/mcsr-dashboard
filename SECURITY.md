# Security Baseline

This project includes baseline controls for a public stats dashboard.

## Implemented in Code
- No hardcoded backend secrets in source code.
- `.env` and local env variants ignored via `.gitignore`.
- Strict CORS configured via `CORS_ALLOW_ORIGINS` (no wildcard by default).
- Host header allow-list via `ALLOWED_HOSTS`.
- Security response headers:
  - `X-Content-Type-Options: nosniff`
  - `X-Frame-Options: DENY`
  - `Referrer-Policy: no-referrer`
  - `Permissions-Policy` restrictive default
  - `Strict-Transport-Security` in production
- Global request validation/error sanitization to avoid internal detail leakage.
- Redis-backed API rate limiting (global + stricter sync endpoints).
- Input validation on user-controlled route/query params.
- SQL writes/reads use ORM or bound SQL parameters.
- Backend dependencies pinned to specific versions.

## Operational Requirements (Do Before Production)
- Set `APP_ENV=production`.
- Set explicit `CORS_ALLOW_ORIGINS` to your frontend domain(s) only.
- Set explicit `ALLOWED_HOSTS` to your API domain(s) only.
- Enforce HTTPS at your edge (Vercel/Render/Railway) and keep HSTS enabled.
- Rotate and store all secrets in provider secret managers only.
- Never expose Postgres/Redis publicly; keep them private/VPC-only.
- Run dependency audits regularly:
  - Backend: `pip-audit` (install in CI/runtime image or a security job)
  - Frontend: `npm run audit`
- Add request logging with PII redaction before production analytics.

## Notes
- This app does not implement auth/roles yet. If admin or private data is introduced,
  add authentication + authorization checks before release.
- No file upload/payment features are currently present.
