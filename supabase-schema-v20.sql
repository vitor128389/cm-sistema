-- =============================================
-- v20: adiciona CNPJ na loja, pra aparecer nas impressões
-- (comprovante de venda, de troca, e fechamento de caixa).
-- =============================================

alter table lojas add column if not exists cnpj text;
