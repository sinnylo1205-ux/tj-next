-- HR expense proofs contain staff receipts / reimbursement documents.
-- They were uploaded into the public `custom_asset` bucket and stored as
-- permanent public URLs. Public-bucket object GETs bypass storage RLS, so
-- anyone with the URL (including payroll Excel exports) could download them.
--
-- Fix: private bucket + admin-only storage policies. App stores proof_path
-- only and serves short-lived signed URLs for viewing.

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'hr_expense_proofs',
  'hr_expense_proofs',
  false,
  15728640, -- 15 MiB
  ARRAY[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'image/gif',
    'application/pdf'
  ]::text[]
)
ON CONFLICT (id) DO UPDATE
SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "Admins can upload hr expense proofs"
  ON storage.objects;
CREATE POLICY "Admins can upload hr expense proofs"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'hr_expense_proofs'
    AND public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Admins can read hr expense proofs"
  ON storage.objects;
CREATE POLICY "Admins can read hr expense proofs"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'hr_expense_proofs'
    AND public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Admins can update hr expense proofs"
  ON storage.objects;
CREATE POLICY "Admins can update hr expense proofs"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'hr_expense_proofs'
    AND public.has_role(auth.uid(), 'admin')
  )
  WITH CHECK (
    bucket_id = 'hr_expense_proofs'
    AND public.has_role(auth.uid(), 'admin')
  );

DROP POLICY IF EXISTS "Admins can delete hr expense proofs"
  ON storage.objects;
CREATE POLICY "Admins can delete hr expense proofs"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'hr_expense_proofs'
    AND public.has_role(auth.uid(), 'admin')
  );

COMMENT ON COLUMN public.hr_expense_claims.proof_url IS
  'Deprecated permanent URL; new uploads leave this NULL and use proof_path + signed URLs from private bucket hr_expense_proofs';
COMMENT ON COLUMN public.hr_expense_claims.proof_path IS
  'Storage object path under private bucket hr_expense_proofs (legacy rows may still point at custom_asset/hr-expenses/...)';
