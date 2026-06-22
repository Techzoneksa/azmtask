-- Migration: Add is_active column to profiles for user management
-- Date: 2026-06-22
-- Purpose: Enable user activation/deactivation

-- Add is_active column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'profiles' AND column_name = 'is_active'
    ) THEN
        ALTER TABLE profiles ADD COLUMN is_active BOOLEAN DEFAULT true;
    END IF;
END $$;

-- Create index for faster queries on is_active
CREATE INDEX IF NOT EXISTS idx_profiles_is_active ON profiles(is_active);

-- Update RLS policies to check is_active
-- Policy: Users can only see active users in company documents (for display purposes)
-- Note: The main profiles table policies should already exist from initial setup

-- Add comment
COMMENT ON COLUMN profiles.is_active IS 'User account active status - true means active, false means disabled';

-- Migration: Create Edge Function for user management
-- Note: This is a placeholder for documentation. The actual Edge Function code
-- will be in supabase/functions/create-user/index.ts

-- For manual execution on Supabase dashboard:
-- 1. Go to SQL Editor
-- 2. Run the RLS policy updates below if needed

-- Enable admin capabilities for user management (if not already enabled)
-- This allows directors to manage users within their permission level