// Mantido pra não precisar mexer nas páginas que já usavam `import { supabase } from "@/lib/supabase"`.
// Por baixo, agora usa createBrowserClient (com suporte a cookies de sessão/login).
import { createClient } from "@/lib/supabase/client";

export const supabase = createClient();
