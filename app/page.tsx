import { createClient } from '@/lib/supabase/server';
import { HomePageClient } from './HomePageClient';

export const dynamic = 'force-dynamic';

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return <HomePageClient userEmail={user?.email} />;
}
