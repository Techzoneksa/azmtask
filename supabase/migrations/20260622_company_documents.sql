-- Migration: Create company_documents table and RLS policies
-- Date: 2026-06-22
-- Purpose: Store official company documents with tracking

-- 1) جدول المستندات الرسمية
CREATE TABLE IF NOT EXISTS public.company_documents (
  id uuid primary key default gen_random_uuid(),
  document_type text not null,
  document_name text not null,
  document_number text,
  company_name text,
  issuer text,
  issue_date date,
  expiry_date date,
  status text default 'active',
  file_url text,
  file_name text,
  file_type text,
  file_size bigint,
  extracted_data jsonb default '{}'::jsonb,
  notes text,
  uploaded_by uuid references auth.users(id),
  created_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

ALTER TABLE public.company_documents ENABLE ROW LEVEL SECURITY;

-- 2) سياسات RLS - using profiles table with is_active check
DROP POLICY IF EXISTS "company_documents_select_authenticated" ON public.company_documents;
CREATE POLICY "company_documents_select_authenticated"
ON public.company_documents
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.is_active = true
  )
);

DROP POLICY IF EXISTS "company_documents_insert_admin_director" ON public.company_documents;
CREATE POLICY "company_documents_insert_admin_director"
ON public.company_documents
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role IN ('admin', 'director')
    AND profiles.is_active = true
  )
);

DROP POLICY IF EXISTS "company_documents_update_admin_director" ON public.company_documents;
CREATE POLICY "company_documents_update_admin_director"
ON public.company_documents
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role IN ('admin', 'director')
    AND profiles.is_active = true
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role IN ('admin', 'director')
    AND profiles.is_active = true
  )
);

DROP POLICY IF EXISTS "company_documents_delete_admin" ON public.company_documents;
CREATE POLICY "company_documents_delete_admin"
ON public.company_documents
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'admin'
    AND profiles.is_active = true
  )
);

-- 3) Trigger updated_at
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_company_documents_updated_at ON public.company_documents;
CREATE TRIGGER set_company_documents_updated_at
BEFORE UPDATE ON public.company_documents
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();

-- 4) إنشاء Bucket للمستندات
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'company-documents',
  'company-documents',
  true,
  10485760,
  array[
    'application/pdf',
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- 5) سياسات Storage - using profiles table with is_active check
DROP POLICY IF EXISTS "Public read company documents" ON storage.objects;
CREATE POLICY "Public read company documents"
ON storage.objects
FOR SELECT
USING (bucket_id = 'company-documents');

DROP POLICY IF EXISTS "Admins upload company documents" ON storage.objects;
CREATE POLICY "Admins upload company documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company-documents'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role IN ('admin', 'director')
    AND profiles.is_active = true
  )
);

DROP POLICY IF EXISTS "Admins update company documents" ON storage.objects;
CREATE POLICY "Admins update company documents"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'company-documents'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role IN ('admin', 'director')
    AND profiles.is_active = true
  )
)
WITH CHECK (
  bucket_id = 'company-documents'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role IN ('admin', 'director')
    AND profiles.is_active = true
  )
);

DROP POLICY IF EXISTS "Admins delete company documents" ON storage.objects;
CREATE POLICY "Admins delete company documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'company-documents'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.user_id = auth.uid()
    AND profiles.role = 'admin'
    AND profiles.is_active = true
  )
);

-- 6) Add is_active column to profiles if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'profiles' AND column_name = 'is_active'
  ) THEN
    ALTER TABLE profiles ADD COLUMN is_active BOOLEAN DEFAULT true;
  END IF;
END $$;

-- 7) Create index for is_active
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON profiles(is_active);
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_company_documents_document_type ON company_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_company_documents_expiry_date ON company_documents(expiry_date);
CREATE INDEX IF NOT EXISTS idx_company_documents_status ON company_documents(status);