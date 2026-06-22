-- Migration: Create company_documents table
-- Date: 2026-06-22
-- Purpose: Store official company documents with tracking

-- Create company_documents table
CREATE TABLE IF NOT EXISTS company_documents (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    document_type TEXT NOT NULL,
    document_name TEXT,
    document_number TEXT,
    company_name TEXT,
    issuer TEXT,
    issue_date DATE,
    expiry_date DATE,
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'expired', 'expiring_soon', 'missing_data', 'pending_review')),
    file_url TEXT,
    file_name TEXT,
    file_type TEXT,
    file_size BIGINT,
    extracted_data JSONB DEFAULT '{}'::JSONB,
    notes TEXT,
    uploaded_by UUID REFERENCES auth.users(id),
    created_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_company_documents_document_type ON company_documents(document_type);
CREATE INDEX IF NOT EXISTS idx_company_documents_expiry_date ON company_documents(expiry_date);
CREATE INDEX IF NOT EXISTS idx_company_documents_status ON company_documents(status);

-- Enable Row Level Security (RLS)
ALTER TABLE company_documents ENABLE ROW LEVEL SECURITY;

-- RLS Policies
-- Policy: Authenticated users can read all documents
CREATE POLICY "Authenticated users can read company documents"
    ON company_documents
    FOR SELECT
    TO authenticated
    USING (true);

-- Policy: Admin and director can insert documents
CREATE POLICY "Admin and director can insert company documents"
    ON company_documents
    FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = auth.uid()
            AND (profiles.role = 'admin' OR profiles.role = 'director')
        )
        OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = auth.uid()
            AND profiles.roles::text LIKE '%"admin"%'
        )
    );

-- Policy: Admin and director can update documents
CREATE POLICY "Admin and director can update company documents"
    ON company_documents
    FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = auth.uid()
            AND (profiles.role = 'admin' OR profiles.role = 'director')
        )
        OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = auth.uid()
            AND profiles.roles::text LIKE '%"admin"%'
        )
    );

-- Policy: Only admin can delete documents
CREATE POLICY "Only admin can delete company documents"
    ON company_documents
    FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = auth.uid()
            AND profiles.role = 'admin'
        )
        OR
        EXISTS (
            SELECT 1 FROM profiles
            WHERE profiles.user_id = auth.uid()
            AND profiles.roles::text LIKE '%"admin"%'
        )
    );

-- Create updated_at trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to automatically update updated_at
CREATE TRIGGER update_company_documents_updated_at
    BEFORE UPDATE ON company_documents
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Add comments for documentation
COMMENT ON TABLE company_documents IS 'Official company documents with expiry tracking';
COMMENT ON COLUMN company_documents.document_type IS 'Type of document: commercial_registration, transport_license, vat_certificate, etc.';
COMMENT ON COLUMN company_documents.status IS 'Document status: active, expired, expiring_soon, missing_data, pending_review';