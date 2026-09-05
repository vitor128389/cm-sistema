-- =============================================
-- PAINEL CARUARU MÓVEIS — Seed de dados (v2)
-- Rode isso DEPOIS do supabase-schema.sql e do supabase-schema-v2.sql.
-- Preenche produtos, variações de tecido/espessura e cores disponíveis
-- com tudo que já validamos no preview.
-- =============================================

-- ---------- PRODUTOS SIMPLES (Puffs, Bases, Cabeceiras, Cama Auxiliar) ----------
insert into produtos (nome, categoria, custo, preco_venda, tipo_estoque, quantidade_estoque, tipo_precificacao) values
  ('Puff Redondo', 'Puffs', 0, 70, 'pronta_entrega', 0, 'simples'),
  ('Puff Premium', 'Puffs', 0, 100, 'pronta_entrega', 0, 'simples'),
  ('Puff Argola', 'Puffs', 0, 100, 'pronta_entrega', 0, 'simples'),
  ('Puff Quadrado', 'Puffs', 0, 25, 'pronta_entrega', 0, 'simples'),
  ('Base Solteiro', 'Camas', 0, 240, 'pronta_entrega', 0, 'simples'),
  ('Base Casal', 'Camas', 0, 300, 'pronta_entrega', 0, 'simples'),
  ('Cama Auxiliar', 'Camas', 0, 600, 'pronta_entrega', 0, 'simples'),
  ('Cabeceira Casal', 'Cabeceiras', 0, 200, 'pronta_entrega', 0, 'simples'),
  ('Cabeceira Solteiro', 'Cabeceiras', 0, 150, 'pronta_entrega', 0, 'simples')
on conflict do nothing;

-- ---------- PRODUTOS COM VARIAÇÃO POR TECIDO (Sofás, Poltronas, Namoradeiras) ----------
insert into produtos (nome, categoria, custo, preco_venda, tipo_estoque, quantidade_estoque, tipo_precificacao) values
  ('Sofá Itália com Chaise', 'Sofás', 0, 650, 'pronta_entrega', 0, 'tecido'),
  ('Sofá Elegance', 'Sofás', 0, 1000, 'pronta_entrega', 0, 'tecido'),
  ('Sofá Milão 2 e 3 Lugares', 'Sofás', 0, 700, 'pronta_entrega', 0, 'tecido'),
  ('Sofá Nobre 2 e 3 Lugares', 'Sofás', 0, 700, 'pronta_entrega', 0, 'tecido'),
  ('Sofá Turquia 2 e 3 Lugares', 'Sofás', 0, 1000, 'pronta_entrega', 0, 'tecido'),
  ('Sofá Paris 2 e 3 Lugares', 'Sofás', 0, 1300, 'pronta_entrega', 0, 'tecido'),
  ('Sofá Retrátil 1.80m', 'Sofás', 0, 1100, 'pronta_entrega', 0, 'tecido'),
  ('Sofá Retrátil 2.20m', 'Sofás', 0, 1500, 'pronta_entrega', 0, 'tecido'),
  ('Poltrona Borboleta', 'Poltronas', 0, 150, 'pronta_entrega', 0, 'tecido'),
  ('Poltrona Benny', 'Poltronas', 0, 200, 'pronta_entrega', 0, 'tecido'),
  ('Poltrona Napoli', 'Poltronas', 0, 250, 'pronta_entrega', 0, 'tecido'),
  ('Poltrona Dubai', 'Poltronas', 0, 300, 'pronta_entrega', 0, 'tecido'),
  ('Poltrona Paris', 'Poltronas', 0, 370, 'pronta_entrega', 0, 'tecido'),
  ('Poltrona Pétala', 'Poltronas', 0, 400, 'pronta_entrega', 0, 'tecido'),
  ('Namoradeira Borboleta', 'Namoradeiras', 0, 300, 'pronta_entrega', 0, 'tecido'),
  ('Namoradeira Dubai', 'Namoradeiras', 0, 500, 'pronta_entrega', 0, 'tecido'),
  ('Namoradeira Pétala', 'Namoradeiras', 0, 500, 'pronta_entrega', 0, 'tecido')
on conflict do nothing;

-- ---------- PRODUTOS COM VARIAÇÃO POR ESPESSURA (Camas) ----------
insert into produtos (nome, categoria, custo, preco_venda, tipo_estoque, quantidade_estoque, tipo_precificacao) values
  ('Cama Casal', 'Camas', 0, 400, 'pronta_entrega', 0, 'espessura'),
  ('Cama Solteiro', 'Camas', 0, 350, 'pronta_entrega', 0, 'espessura'),
  ('Cama Solteirão', 'Camas', 0, 380, 'pronta_entrega', 0, 'espessura')
on conflict do nothing;

-- ---------- VARIAÇÕES DE TECIDO (preço à vista, estoque começa em 0) ----------
insert into produto_variantes (produto_id, nome_variante, preco_avista, estoque)
select id, v.nome_variante, v.preco_avista, 0
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
on conflict (produto_id, nome_variante) do nothing;

-- ---------- VARIAÇÕES DE ESPESSURA (Camas) ----------
insert into produto_variantes (produto_id, nome_variante, preco_avista, estoque)
select id, v.nome_variante, v.preco_avista,
  case when p.nome = 'Cama Casal' and v.nome_variante = '5cm' then 1 else 0 end -- teste: 1 unidade já em estoque
from produtos p
cross join lateral (values
  ('Cama Casal', '5cm', 400), ('Cama Casal', '7cm', 550), ('Cama Casal', '14cm', 800),
  ('Cama Solteiro', '5cm', 350), ('Cama Solteiro', '7cm', 450), ('Cama Solteiro', '14cm', 600),
  ('Cama Solteirão', '5cm', 380), ('Cama Solteirão', '7cm', 500), ('Cama Solteirão', '14cm', 700)
) as v(produto_nome, nome_variante, preco_avista)
where p.nome = v.produto_nome
on conflict (produto_id, nome_variante) do nothing;

-- ---------- CORES DISPONÍVEIS POR TECIDO ----------
insert into tecidos_cores (tecido, codigo, nome, disponivel) values
  ('Suede', '12', 'Ivory', true),
  ('Suede', '24', 'Timber', true),
  ('Suede', '13', 'Chocolate', true),
  ('Suede', '49', 'Steel', true),
  ('Suede', '32', 'Grafite', true),
  ('Suede', '05', 'Black', true),
  ('Linho', '63', 'Bege', true),
  ('Linho', '56', 'Natural', true),
  ('Linho', '40', 'Castor', true),
  ('Linho', '28', 'Tabaco', true),
  ('Linho', '15', 'Ice', true),
  ('Linho', '32', 'Grafite', true),
  ('Linho', '59', 'Chumbo', true)
on conflict (tecido, codigo) do nothing;
-- Veludo fica sem cores por enquanto — adicione aqui quando vocês definirem a paleta.
