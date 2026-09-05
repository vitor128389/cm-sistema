import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { obterPermissoesEfetivas, telaDaRota } from "@/lib/permissoes";

// Páginas que qualquer um pode ver sem estar logado
const ROTAS_PUBLICAS = ["/login"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL as string,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY as string,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const rotaPublica = ROTAS_PUBLICAS.some((rota) => request.nextUrl.pathname.startsWith(rota));

  if (!user && !rotaPublica) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Usuário desativado: derruba a sessão e manda pro login com um aviso
  if (user && !rotaPublica) {
    const { data: perfil } = await supabase.from("usuarios").select("ativo").eq("id", user.id).maybeSingle();
    if (perfil && perfil.ativo === false) {
      await supabase.auth.signOut();
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("desativado", "1");
      return NextResponse.redirect(url);
    }
  }

  // Bloqueia acesso direto pela URL a telas que essa pessoa não tem permissão de ver
  if (user) {
    const tela = telaDaRota(request.nextUrl.pathname);
    if (tela) {
      const { permissoes } = await obterPermissoesEfetivas(supabase, user.id);
      if (!permissoes[tela]) {
        const url = request.nextUrl.clone();
        url.pathname = "/";
        url.searchParams.set("sem-permissao", tela);
        return NextResponse.redirect(url);
      }
    }
  }

  return supabaseResponse;
}
