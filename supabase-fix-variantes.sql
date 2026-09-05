-- =============================================
-- Correção: garante que TODAS as variações (tecido e espessura) existam
-- em produto_variantes, mesmo que a inserção anterior tenha falhado
-- parcialmente. Pode rodar quantas vezes quiser — sempre corrige os
-- valores certos sem duplicar linhas.
-- =============================================

-- ---------- VARIAÇÕES DE TECIDO ----------
insert into produto_variantes (produto_id, nome_variante, preco_avista, estoque)
select p.id, v.nome_variante, v.preco_avista, 0
from produtos p
cross join lateral (values
  ('Sofá Itália com Chaise', 'Suede', 650), ('Sofá Itália com Chaise', 'Linho', 750), ('Sofá Itália com Chaise', 'Veludo', 750),
  ('Sofá Elegance', 'Suede', 1000), ('Sofá Elegance', 'Linho', 1000), ('Sofá Elegance', 'Veludo', 1000),
  ('Sofá Milão 2 e 3 Lugares', 'Suede', 700), ('Sofá Milão 2 e 3 Lugares', 'Linho', 800), ('Sofá Milão 2 e 3 Lugares', 'Veludo', 800),
  ('Sofá Nobre 2 e 3 Lugares', 'Suede', 700), ('Sofá Nobre 2 e 3 Lugares', 'Linho', 800), ('Sofá Nobre 2 e 3 Lugares', 'Veludo', 800),
  ('Sofá Turquia 2 e 3 Lugares', 'Suede', 1000), ('Sofá Turquia 2 e 3 Lugares', 'Linho', 1200), ('Sofá Turquia 2 e 3 Lugares', 'Veludo', 1200),
  ('Sofá Paris 2 e 3 Lugares', 'Suede', 1300), ('Sofá Paris 2 e 3 Lugares', 'Linho', 1300), ('Sofá Paris 2 e 3 Lugares', 'Veludo', 1300),
  ('Sofá Retrátil 1.80m', 'Suede', 1100), ('Sofá Retrátil 1.80m', 'Linho', 1200), ('Sofá Retrátil 1.80m', 'Veludo', 1200),
  ('Sofá Retrátil 2.20m', 'Suede', 1500), ('Sofá Retrátil 2.20m', 'Linho', 1700), ('Sofá Retrátil 2.20m', 'Veludo', 1700),
  ('Poltrona Borboleta', 'Suede', 150), ('Poltrona Borboleta', 'Linho', 170), ('Poltrona Borboleta', 'Veludo', 170),
  ('Poltrona Benny', 'Suede', 200), ('Poltrona Benny', 'Linho', 220), ('Poltrona Benny', 'Veludo', 220),
  ('Poltrona Napoli', 'Suede', 250), ('Poltrona Napoli', 'Linho', 270), ('Poltrona Napoli', 'Veludo', 270),
  ('Poltrona Dubai', 'Suede', 300), ('Poltrona Dubai', 'Linho', 320), ('Poltrona Dubai', 'Veludo', 320),
  ('Poltrona Paris', 'Suede', 370), ('Poltrona Paris', 'Linho', 400), ('Poltrona Paris', 'Veludo', 400),
  ('Poltrona Pétala', 'Suede', 400), ('Poltrona Pétala', 'Linho', 400), ('Poltrona Pétala', 'Veludo', 400),
  ('Namoradeira Borboleta', 'Suede', 300), ('Namoradeira Borboleta', 'Linho', 320), ('Namoradeira Borboleta', 'Veludo', 320),
  ('Namoradeira Dubai', 'Suede', 500), ('Namoradeira Dubai', 'Linho', 520), ('Namoradeira Dubai', 'Veludo', 520),
  ('Namoradeira Pétala', 'Suede', 500), ('Namoradeira Pétala', 'Linho', 600), ('Namoradeira Pétala', 'Veludo', 600)
) as v(produto_nome, nome_variante, preco_avista)
where p.nome = v.produto_nome
on conflict (produto_id, nome_variante) do update set preco_avista = excluded.preco_avista;

-- ---------- VARIAÇÕES DE ESPESSURA (Camas) ----------
insert into produto_variantes (produto_id, nome_variante, preco_avista, estoque)
select p.id, v.nome_variante, v.preco_avista,
  case when p.nome = 'Cama Casal' and v.nome_variante = '5cm' then 1 else 0 end
from produtos p
cross join lateral (values
  ('Cama Casal', '5cm', 400), ('Cama Casal', '7cm', 550), ('Cama Casal', '14cm', 800),
  ('Cama Solteiro', '5cm', 350), ('Cama Solteiro', '7cm', 450), ('Cama Solteiro', '14cm', 600),
  ('Cama Solteirão', '5cm', 380), ('Cama Solteirão', '7cm', 500), ('Cama Solteirão', '14cm', 700)
) as v(produto_nome, nome_variante, preco_avista)
where p.nome = v.produto_nome
on conflict (produto_id, nome_variante) do update set preco_avista = excluded.preco_avista;

-- ---------- Confira o resultado ----------
select p.nome, p.tipo_precificacao, count(pv.id) as qtd_variacoes
from produtos p
left join produto_variantes pv on pv.produto_id = p.id
where p.tipo_precificacao in ('tecido', 'espessura')
group by p.nome, p.tipo_precificacao
order by p.nome;
