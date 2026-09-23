-- Bootstrap migration: extensions only.
--
-- This is NOT the product schema. Tables, RLS policies and RPCs are added per
-- sprint, together with an approved spec under docs/specs/. Every schema change
-- ships through a migration file; never hand-edit an applied migration
-- (docs/01-dev-environment.md section 8.1).

-- Password/secret hashing, gen_random_uuid(), and digest helpers used by
-- care-link codes and evidence checksums.
create extension if not exists pgcrypto with schema extensions;

-- Embeddings for caregiver-approved prescription text (document_chunks).
create extension if not exists vector with schema extensions;
