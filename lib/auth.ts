import { createClient } from '@/lib/supabase/server';

export async function obterUsuarioAtual() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
}

export async function obterSessaoAtual() {
  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session;
}

export async function fazerLogout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
