// Public Supabase settings for the optional online features (study groups, push).
// The publishable key is designed to be public: every table is protected by
// row-level security in supabase/migrations. Never put a service-role key here.
export const SUPABASE_URL = 'https://xijpnqgaxvyigyrwcqmo.supabase.co';
export const SUPABASE_KEY = 'sb_publishable_AWNHAVivbty7pAybLV7Dxg_UxPJH49J';
// Pinned ESM build, loaded only when a student opens an online feature.
export const SUPABASE_JS = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.49.1/+esm';
