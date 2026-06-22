import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      throw new Error('Missing authorization header');
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: tokenData, error: tokenError } = await supabaseClient.auth.getUser(token);
    
    if (tokenError || !tokenData.user) {
      throw new Error('Invalid token');
    }

    const callingUserId = tokenData.user.id;

    const { data: adminProfile } = await supabaseClient
      .from('profiles')
      .select('role, is_active')
      .eq('user_id', callingUserId)
      .single();

    if (!adminProfile) {
      throw new Error('Profile not found');
    }

    if (!adminProfile.is_active) {
      throw new Error('Your account is disabled');
    }

    if (adminProfile.role !== 'admin' && adminProfile.role !== 'director') {
      throw new Error('Unauthorized: Admin or Director role required');
    }

    const {
      email,
      password,
      name,
      role,
      position
    } = await req.json();

    if (!email || !password || !name) {
      throw new Error('Missing required fields: email, password, name');
    }

    if (role === 'admin' && adminProfile.role !== 'admin') {
      throw new Error('Only admin can create other admins');
    }

    const { data: authData, error: authError } = await supabaseClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name }
    });

    if (authError) {
      throw authError;
    }

    const { error: profileError } = await supabaseClient.from('profiles').insert({
      id: authData.user.id,
      name,
      email,
      role: role || 'employee',
      position: position || null,
      is_active: true
    });

    if (profileError) {
      console.error('Profile creation error:', profileError);
      try {
        await supabaseClient.auth.admin.deleteUser(authData.user.id);
      } catch (e) {
        console.error('Cleanup error:', e);
      }
      throw profileError;
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        user: { id: authData.user.id, email, name, role } 
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});