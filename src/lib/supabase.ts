import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️ Supabase credentials not configured');
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

/**
 * Get authenticated Supabase client for server-side operations
 * @deprecated Use lib/supabase/serviceClient.ts instead
 */
export const getServerSupabase = () => {
  const serverKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serverKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY not configured. Check your .env.local file.');
  }
  return createClient(supabaseUrl, serverKey);
};

/**
 * Get Supabase client with user context
 */
export async function getSupabaseWithAuth() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    throw new Error('User not authenticated');
  }
  return supabase;
}
