// js/supabase-client.js
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://mfwxtgjkrviylxyyuhho.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_n3aIM_62ocWvL4S8FBd9sQ_TwEWYCU9';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);