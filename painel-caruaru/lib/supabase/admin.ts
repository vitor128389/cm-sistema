import { createClient } from "@supabase/supabase-js";

// ATENÇÃO: esse arquivo só pode ser importado dentro de Route Handlers (app/api/**)
// ou outro código que rode no servidor. A SUPABASE_SERVICE_ROLE_KEY tem acesso
// total ao banco, ignorando RLS — nunca deve chegar ao navegador do usuário.
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL as string;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY as string;

  if (!serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY não configurada no .env.local — veja o README."
    );
  }

  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
