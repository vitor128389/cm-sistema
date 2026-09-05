# Painel Caruaru Móveis

Painel interno (só da equipe) pra cadastrar produtos, controlar custo/preço/lucro
e gerenciar encomendas até a nota final.

## O que tem pronto

- **Produtos** — cadastro com custo, preço de venda, lucro (R$ e %) calculado automático,
  e se é peça de pronta entrega ou sob encomenda.
- **Encomendas** — cliente, produto, variação (tecido/cor), sinal pago, saldo restante,
  status (aguardando produção → produzindo → pronto → entregue).
- **Notas** — histórico de vendas e encomendas. Notas de encomenda já saem marcadas
  com "ENCOMENDA" destacado.
- **Painel** — resumo geral: produtos cadastrados, encomendas em aberto, faturado no mês.

## Passo a passo pra colocar no ar

### 1. Criar o projeto no Supabase
1. Acesse [supabase.com](https://supabase.com) e crie um novo projeto (é grátis pra começar).
2. No painel do projeto, vá em **SQL Editor** → cole todo o conteúdo do arquivo
   `supabase-schema.sql` (está na raiz deste projeto) → clique em **Run**.
   Isso cria todas as tabelas (produtos, clientes, encomendas, notas, usuários).
3. Vá em **Project Settings → API** e copie:
   - a **Project URL**
   - a **anon public key**

### 2. Configurar o projeto localmente
```bash
npm install
cp .env.local.example .env.local
```
Abra o `.env.local` e cole a URL e a chave que você copiou do Supabase:
```
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxxxxxxxxxxxxxx
```

Rodar localmente pra testar:
```bash
npm run dev
```
Abre em `http://localhost:3000`.

### 3. Criar login pra equipe
No Supabase, vá em **Authentication → Users → Add user** e crie um login (email/senha)
pra cada pessoa da equipe. Depois, vá na tabela **usuarios** (Table Editor) e crie uma
linha com o mesmo `id` do usuário que você acabou de criar (copie o ID lá de
Authentication → Users), preenchendo `nome` e `funcao` (admin/vendedor/producao).

A tela de login já vem pronta (`/login`) e todas as outras páginas do sistema exigem
login — quem não estiver logado é redirecionado automaticamente pra lá.

### 4. Subir pro GitHub e Vercel (do jeito que você já faz)
```bash
git init
git add .
git commit -m "primeira versão do painel"
git remote add origin <seu-repo-no-github>
git push -u origin main
```
Depois é só importar o repositório no Vercel e adicionar as mesmas duas variáveis de
ambiente (`NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`) nas configurações
do projeto lá.

## Próximos passos sugeridos
- Tela de login (autenticação da equipe)
- Edição e exclusão de produtos/encomendas direto na tabela
- Upload de foto do produto (usando o Storage do Supabase)
- Impressão da nota em formato de cupom (PDF ou impressora térmica)

## Ampliando o banco (v2) — vendas, caixa, tecidos e permissões

O `supabase-schema.sql` original cobre o básico (produtos, clientes, encomendas,
notas). Depois de tudo o que testamos no preview em HTML, o banco cresceu bastante.
Os dois arquivos abaixo ampliam ele pra bater com o preview:

- **`supabase-schema-v2.sql`** — cria as tabelas novas: `produto_variantes`
  (preço/estoque por tecido ou espessura), `tecidos_cores`, `caixas`,
  `turnos_caixa`, `vendas`, `venda_itens`, `permissoes`, e os campos que
  faltavam em `clientes` (número, complemento, múltiplos celulares).
- **`supabase-seed-v2.sql`** — preenche esse banco com todos os produtos,
  preços e cores que já validamos no preview (rode só depois do v2, e só
  uma vez — ele ignora duplicados, mas não tem por que rodar duas vezes).

### Passo a passo
1. No painel do Supabase → **SQL Editor** → **New query**.
2. Cole o conteúdo de `supabase-schema-v2.sql` inteiro → **Run**.
3. Nova query → cole `supabase-seed-v2.sql` inteiro → **Run**.
4. Confira em **Table Editor** se as tabelas novas apareceram com os dados
   (principalmente `produtos`, `produto_variantes` e `tecidos_cores`).

Depois disso o banco já fica pronto pra receber as telas reais em React —
que é o próximo passo (trocar o preview HTML por telas conectadas de
verdade no Supabase).

## Preenchimento automático de nome pelo CPF (CPFHub.io)

O projeto já vem com uma Edge Function pronta (`supabase/functions/consulta-cpf`) que
consulta o CPF na API da [CPFHub.io](https://www.cpfhub.io/) e devolve o nome do cliente,
sem expor sua chave de API no navegador. Plano grátis: 50 consultas/mês, sem cartão.

### Passo a passo

1. **Crie sua conta grátis** em [app.cpfhub.io/auth/register](https://app.cpfhub.io/auth/register)
   e copie sua API key no painel.

2. **Instale o Supabase CLI** (se ainda não tiver):

   No Windows, use o [Scoop](https://scoop.sh/):
   ```powershell
   irm get.scoop.sh | iex
   scoop bucket add supabase https://github.com/supabase/scoop-bucket.git
   scoop install supabase
   ```

   No Mac, use o Homebrew:
   ```bash
   brew install supabase/tap/supabase
   ```

   Confirme com `supabase --version`.

3. **Faça login e conecte ao seu projeto:**
   ```bash
   supabase login
   supabase link --project-ref SEU-PROJECT-REF
   ```
   (o project-ref você encontra em Project Settings → General, no painel do Supabase)

4. **Salve sua chave da CPFHub como secret** (isso mantém ela fora do código):
   ```bash
   supabase secrets set CPFHUB_API_KEY=sua-chave-aqui
   ```

5. **Publique a função:**
   ```bash
   supabase functions deploy consulta-cpf --no-verify-jwt
   ```
   O `--no-verify-jwt` é importante aqui: sem ele, o Supabase bloqueia a chamada com
   erro 401 (Unauthorized), porque por padrão toda Edge Function exige um token de
   autenticação. Essa função em especial não precisa disso — ela só consulta um CPF.

6. Pronto — no código React, é só chamar `consultarCpf(cpf)` (de `lib/consultaCpf.ts`)
   assim que o campo CPF completar 11 dígitos, e usar `resultado.nome` pra preencher o
   campo de nome automaticamente.

### Sobre o limite gratuito
- 50 consultas por mês, 1 consulta a cada 2 segundos.
- CPF não encontrado na base **não consome crédito** — só é cobrado quando retorna dado.
- Se passar de 50/mês, dá pra assinar o plano Pro (R$ 149/mês, 1.000 consultas) direto
  no painel da CPFHub.

### Sobre a LGPD
Você só pode consultar o CPF pra uma finalidade legítima e já informada ao cliente —
nesse caso, agilizar o cadastro dele numa venda, o que é uma base válida. Evite guardar
o CPF de gente que não virou cliente de fato, e não use essa consulta pra outra
finalidade que não seja o cadastro da própria venda.

## Ampliando o banco (v4 e v5) — número de pedido, cargo Caixa, novos produtos

- **`supabase-schema-v4.sql`** — número de pedido sequencial e imutável nas vendas,
  prazo de entrega, status por item de encomenda (ENCOMENDA/ENTREGUE).
- **`supabase-schema-v5.sql`** — cargo **Caixa**, tabela `usuario_permissoes`
  (permissões extras por pessoa, além do cargo), e produtos novos: Namoradeira Benny,
  Cabeceira Queen/King, Painéis (Casal/Solteiro/Queen/King), Base Queen/King.

Rode os dois no SQL Editor do Supabase, na ordem (v4 antes do v5), do mesmo jeito que
já fez com os anteriores.

## Cadastro de usuários pelo próprio sistema

A partir de agora, criar um login novo pra equipe **não precisa mais passar pelo painel
do Supabase** — tem um formulário em Administração → Usuários → "+ Cadastrar usuário"
(só aparece pra quem já é admin).

Isso só funciona se você configurar mais uma chave no `.env.local`:

```
SUPABASE_SERVICE_ROLE_KEY=sua-service-role-key-aqui
```

Pra pegar essa chave: Project Settings → API Keys → copie a que tiver escrito
**`service_role`** (em contas mais novas do Supabase pode aparecer como **`secret`**).

⚠️ **Essa chave é diferente da `anon`/`publishable`** que você já usa — ela dá acesso
total ao banco, sem nenhuma das proteções de segurança (RLS). Por isso:
- **Nunca** coloque o prefixo `NEXT_PUBLIC_` nela (isso a exporia no navegador)
- **Nunca** suba ela pro GitHub — o `.gitignore` do projeto já protege o `.env.local`,
  mas fique atento se copiar código pra outro lugar
- Ela só é usada dentro de `app/api/admin/criar-usuario/route.ts`, que roda no
  servidor e confere se quem está chamando é realmente um admin antes de fazer
  qualquer coisa

Depois de configurar, reinicie o `npm run dev` (variáveis de ambiente só são lidas
quando o servidor liga).

## Ampliando o banco (v6) — multi-loja

Se vocês têm mais de uma loja/unidade, cada uma agora pode ter **produtos, estoque,
clientes, caixas e vendas próprios**, sem misturar com as outras.

Rode **`supabase-schema-v6.sql`** no SQL Editor do Supabase. Ele:
- cria a tabela `lojas` e uma "Loja Principal" automática, que recebe tudo que já
  existia no banco antes dessa migração;
- separa por loja: produtos, clientes, caixas, turnos de caixa e vendas;
- ajusta as permissões (RLS) pra cada pessoa só ver/mexer na loja em que está
  cadastrada — quem é **admin** continua vendo todas as lojas juntas.

Depois de rodar:
1. Vá em Administração → **Lojas** e cadastre as lojas de vocês (se já tiver mais de
   uma, além da "Loja Principal" criada automaticamente).
2. No menu lateral, quem for admin vai ver um seletor **"Loja ativa"** — é nele que
   você escolhe em qual loja está cadastrando produto, abrindo caixa, vendendo, etc.
3. Em Administração → Usuários, ao cadastrar alguém novo, escolha em qual loja essa
   pessoa vai trabalhar — a partir daí, o sistema já filtra tudo sozinho pra ela.

`tecidos_cores` (catálogo de tecidos e cores) continua sendo **compartilhado entre
todas as lojas** — se vocês quiserem paletas diferentes por loja no futuro, é só pedir.

