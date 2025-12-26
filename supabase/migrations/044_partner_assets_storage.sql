-- Migration: Partner Assets Storage Bucket
--
-- Creates the partner-assets storage bucket and RLS policies for logo/icon uploads
--
-- Note: The bucket itself must be created via Supabase Dashboard or CLI:
--   1. Go to Storage in Supabase Dashboard
--   2. Create bucket named "partner-assets"
--   3. Set it to public (for asset serving)
--
-- This migration sets up the RLS policies for the bucket.

-- ============================================
-- 1. Storage RLS Policies
-- ============================================

-- Note: Supabase storage policies are managed in the storage schema.
-- These policies control who can upload/download files.

-- Drop existing policies if any
DROP POLICY IF EXISTS "Partner org members can upload assets" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view partner assets" ON storage.objects;
DROP POLICY IF EXISTS "Partner org admins can delete assets" ON storage.objects;

-- Policy: Partner org admins can upload files to their org folder
-- Path format: partner-assets/{organization_id}/{filename}
CREATE POLICY "Partner org members can upload assets"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'partner-assets'
  AND (
    -- Extract org_id from path (first segment after bucket)
    (storage.foldername(name))[1]::uuid IN (
      SELECT om.organization_id
      FROM organization_members om
      JOIN users u ON u.id = om.user_id
      WHERE u.auth_user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  )
);

-- Policy: Anyone can view partner assets (public bucket)
CREATE POLICY "Anyone can view partner assets"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'partner-assets');

-- Policy: Partner org admins can update their assets
CREATE POLICY "Partner org admins can update assets"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'partner-assets'
  AND (
    (storage.foldername(name))[1]::uuid IN (
      SELECT om.organization_id
      FROM organization_members om
      JOIN users u ON u.id = om.user_id
      WHERE u.auth_user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  )
);

-- Policy: Partner org admins can delete their assets
CREATE POLICY "Partner org admins can delete assets"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'partner-assets'
  AND (
    (storage.foldername(name))[1]::uuid IN (
      SELECT om.organization_id
      FROM organization_members om
      JOIN users u ON u.id = om.user_id
      WHERE u.auth_user_id = auth.uid()
      AND om.role IN ('owner', 'admin')
    )
  )
);

-- ============================================
-- Setup Instructions
-- ============================================
--
-- After running this migration, you must create the bucket in Supabase:
--
-- Option 1: Via Dashboard
--   1. Go to Storage > Create bucket
--   2. Name: partner-assets
--   3. Public bucket: Yes (so logos can be served without auth)
--   4. File size limit: 2MB (recommended)
--   5. Allowed MIME types: image/png, image/jpeg, image/svg+xml, image/x-icon
--
-- Option 2: Via Supabase CLI
--   supabase storage create partner-assets --public
--
-- Option 3: Via API (in edge function or setup script)
--   await supabase.storage.createBucket('partner-assets', {
--     public: true,
--     fileSizeLimit: 2097152, // 2MB
--     allowedMimeTypes: ['image/png', 'image/jpeg', 'image/svg+xml', 'image/x-icon']
--   });
--
