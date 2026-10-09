-- v27: no máximo UM turno de caixa aberto por caixa (evita caixa duplicado por clique duplo / duas abas).
create unique index if not exists turnos_caixa_um_aberto_por_caixa on turnos_caixa(caixa_id) where status = 'aberto';
