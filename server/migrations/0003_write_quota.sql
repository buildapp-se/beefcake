-- Skrivningar per konto och dag, taket i server/src/index.ts (OWASP 2026-09-16).
CREATE TABLE IF NOT EXISTS write_quota (
  owner TEXT PRIMARY KEY,
  day TEXT NOT NULL,
  count INTEGER NOT NULL DEFAULT 0
);
