-- =============================================
-- v13: custo separado por variante (Suede/Linho/Veludo, ou
-- 5cm/7cm/14cm). Antes só existia um custo único por produto.
-- =============================================

alter table produto_variantes add column if not exists custo numeric(10,2) not null default 0;

-- preenche o custo de cada variante com o custo do produto "pai", só pra
-- não ficar tudo zerado de uma vez — pode ajustar depois em cada variante
update produto_variantes v
set custo = p.custo
from produtos p
where v.produto_id = p.id and v.custo = 0 and p.custo > 0;
