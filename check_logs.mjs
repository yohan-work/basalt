import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const { data, error } = await supabase.from('Execution_Logs').select('message, metadata, agent_role').eq('metadata->>type', 'ACTION').limit(10);
  console.log('Error:', error);
  console.log('Data:', JSON.stringify(data, null, 2));
}
check();
