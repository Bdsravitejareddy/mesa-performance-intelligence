-- Existing consent rows cannot prove consent to the currently configured processor.
-- Seed them with a nonmatching digest so GET/evaluation require fresh consent.
alter table public.ai_processing_consents
  add column configuration_fingerprint text not null default repeat('0', 64)
  check (length(configuration_fingerprint) = 64);
alter table public.ai_processing_consents
  alter column configuration_fingerprint drop default;
