// Liga/desliga recursos que dependem de uma mudança no banco de dados.
// PAGAMENTO_NA_ENTREGA: só ligar depois de rodar o supabase-schema-v33.sql no Supabase
// (sem isso o banco recusa a forma de pagamento "Na entrega").
export const PAGAMENTO_NA_ENTREGA = false;
