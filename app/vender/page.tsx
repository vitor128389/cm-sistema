"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { formatarMoeda } from "@/lib/format";
import { consultarCpf } from "@/lib/consultaCpf";
import ComprovanteImpressao from "@/components/ComprovanteImpressao";
import { useLoja } from "@/contexts/LojaContext";
import { carregarProdutosComEstoque, ajustarEstoqueLoja } from "@/lib/produtos";
import type {
  ProdutoComVariantes,
  TecidoCor,
  ItemCarrinho,
  FormaPagamento,
  TipoEntregaItem,
  LojaCompleta,
  FormaRecebimento,
} from "@/types";

const ESPESSURAS = ["5cm", "7cm", "14cm"];
const TECIDOS = ["Suede", "Linho", "Veludo"];
const MODELOS = ["Capitonê", "Quadrado", "Vertical", "V"];
const PRODUTOS_COM_MODELO = ["Poltrona Benny", "Namoradeira Benny"];

export default function VenderPage() {
  const [passo, setPasso] = useState<1 | 2 | 3 | 4>(1);
  const { lojaAtual } = useLoja();

  // ---------- Cliente ----------
  const [nome, setNome] = useState("");
  const [cpf, setCpf] = useState("");
  const [semCpf, setSemCpf] = useState(false);
  const [celulares, setCelulares] = useState<{ numero: string; responsavel: string }[]>([
    { numero: "", responsavel: "" },
  ]);
  const [endereco, setEndereco] = useState("");
  const [numero, setNumero] = useState("");
  const [semNumero, setSemNumero] = useState(false);
  const [complemento, setComplemento] = useState("");
  const [cidade, setCidade] = useState("");
  const [cpfInfo, setCpfInfo] = useState("");
  const [cpfInfoCor, setCpfInfoCor] = useState("text-madeira-500");
  const [clienteIdExistente, setClienteIdExistente] = useState<string | null>(null);
  const [erroPasso1, setErroPasso1] = useState("");
  const [sugestoesNome, setSugestoesNome] = useState<
    {
      id: string;
      nome: string;
      cpf: string | null;
      endereco: string | null;
      numero: string | null;
      sem_numero: boolean | null;
      complemento: string | null;
      cidade: string | null;
      cliente_celulares: { celular: string; nome_responsavel: string | null }[];
    }[]
  >([]);
  const [mostrarSugestoesNome, setMostrarSugestoesNome] = useState(false);

  // ---------- Produtos / carrinho ----------
  const [produtos, setProdutos] = useState<ProdutoComVariantes[]>([]);
  const [tecidosCores, setTecidosCores] = useState<TecidoCor[]>([]);
  const [carrinho, setCarrinho] = useState<ItemCarrinho[]>([]);

  const [buscaProduto, setBuscaProduto] = useState("");
  const [dropdownAberto, setDropdownAberto] = useState(false);
  const [categoriaAberta, setCategoriaAberta] = useState<string | null>(null);
  const [produtoSelecionado, setProdutoSelecionado] = useState<ProdutoComVariantes | null>(null);
  const [tecidoSel, setTecidoSel] = useState("Suede");
  const [espessuraSel, setEspessuraSel] = useState("5cm");
  const [corSel, setCorSel] = useState("");
  const [corManual, setCorManual] = useState("");
  const [corSimplesSel, setCorSimplesSel] = useState("");
  const [corSimplesManual, setCorSimplesManual] = useState("");
  const [modeloSel, setModeloSel] = useState("");
  const [tipoEntrega, setTipoEntrega] = useState<TipoEntregaItem>("pronta");
  const [clienteRetira, setClienteRetira] = useState(false); // usado quando formaRecebimento === "misto", por item
  const [qtdRetiradaItem, setQtdRetiradaItem] = useState(0);
  const [qtdEntregaItem, setQtdEntregaItem] = useState(0);
  const [dividirRecebimentoItem, setDividirRecebimentoItem] = useState(false);
  const [quantidade, setQuantidade] = useState(1);

  useEffect(() => {
    if (dividirRecebimentoItem) return;
    if (qtdEntregaItem > 0) {
      setQtdEntregaItem(quantidade);
      setQtdRetiradaItem(0);
    } else {
      setQtdRetiradaItem(quantidade);
      setQtdEntregaItem(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quantidade]);
  const [valorUnitario, setValorUnitario] = useState(0);
  const [observacaoItem, setObservacaoItem] = useState("");

  // ---------- Pagamento ----------
  interface PagamentoParte {
    forma: FormaPagamento | "";
    parcelas: number;
    valor: number; // valor que o cliente REALMENTE vai pagar nessa forma (já com acréscimo se for parcelado)
  }
  const [pagamentos, setPagamentos] = useState<PagamentoParte[]>([
    { forma: "", parcelas: 1, valor: 0 },
  ]);
  const [turnoAtual, setTurnoAtual] = useState<{ id: string } | null>(null);
  const [lojaInfo, setLojaInfo] = useState<LojaCompleta | null>(null);

  const [salvando, setSalvando] = useState(false);
  const [prazoEntregaMaximo, setPrazoEntregaMaximo] = useState("");
  const [formaRecebimento, setFormaRecebimento] = useState<FormaRecebimento>("retirada");
  const [vendaConcluida, setVendaConcluida] = useState<{
    total: number;
    forma: string;
    numeroPedido: number;
    pagamentos: PagamentoParte[];
  } | null>(
    null
  );

  useEffect(() => {
    carregarProdutos();
    carregarCores();
    carregarTurnoAberto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lojaAtual]);

  const buscaProdutoRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function aoClicarFora(e: MouseEvent) {
      if (buscaProdutoRef.current && !buscaProdutoRef.current.contains(e.target as Node)) {
        setDropdownAberto(false);
      }
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, []);

  async function carregarProdutos() {
    const data = await carregarProdutosComEstoque(supabase, lojaAtual);
    const normalizado = data.map((p) => ({
      ...p,
      tipo_precificacao: (p.tipo_precificacao || "simples").trim() as ProdutoComVariantes["tipo_precificacao"],
    }));
    setProdutos(normalizado);
  }

  async function carregarCores() {
    const { data } = await supabase.from("tecidos_cores").select("*").order("codigo");
    if (data) setTecidosCores(data as TecidoCor[]);
  }

  async function carregarTurnoAberto() {
    if (!lojaAtual) {
      setTurnoAtual(null);
      return;
    }
    const { data } = await supabase
      .from("turnos_caixa")
      .select("id")
      .eq("status", "aberto")
      .eq("loja_id", lojaAtual)
      .order("aberto_em", { ascending: false })
      .limit(1)
      .maybeSingle();
    setTurnoAtual(data);
  }

  /* ---------------- CPF ---------------- */
  function apenasNumeros(v: string) {
    return v.replace(/\D/g, "");
  }

  async function aoMudarCpf(v: string) {
    const digitos = apenasNumeros(v).slice(0, 11);
    let formatado = digitos;
    if (digitos.length > 9) formatado = `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
    else if (digitos.length > 6) formatado = `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6)}`;
    else if (digitos.length > 3) formatado = `${digitos.slice(0, 3)}.${digitos.slice(3)}`;
    setCpf(formatado);

    if (digitos.length !== 11) {
      setCpfInfo("");
      setClienteIdExistente(null);
      return;
    }
    setCpfInfo("Consultando...");
    setCpfInfoCor("text-madeira-500");

    const { data: clienteExistente } = await supabase
      .from("clientes")
      .select("*, cliente_celulares(celular, nome_responsavel)")
      .eq("cpf", digitos)
      .eq("loja_id", lojaAtual)
      .maybeSingle();

    if (clienteExistente) {
      preencherCliente(clienteExistente);
      setCpfInfo(`Cliente já cadastrado: ${clienteExistente.nome}`);
      setCpfInfoCor("text-green-700");
      return;
    }

    setClienteIdExistente(null);
    const resultado = await consultarCpf(digitos);
    if (resultado.encontrado && resultado.nome) {
      setNome(resultado.nome);
      setCpfInfo(`Nome encontrado: ${resultado.nome} (cliente novo)`);
      setCpfInfoCor("text-green-700");
    } else {
      setCpfInfo("CPF não encontrado — será cadastrado um cliente novo.");
      setCpfInfoCor("text-madeira-500");
    }
  }

  function preencherCliente(c: {
    id: string;
    nome: string;
    cpf: string | null;
    endereco: string | null;
    numero: string | null;
    sem_numero: boolean | null;
    complemento: string | null;
    cidade?: string | null;
    cliente_celulares?: { celular: string; nome_responsavel: string | null }[];
  }) {
    setClienteIdExistente(c.id);
    setNome(c.nome || "");
    setCpf(c.cpf ? formatarCpfExibicao(c.cpf) : "");
    setSemCpf(!c.cpf);
    setEndereco(c.endereco || "");
    setNumero(c.numero || "");
    setSemNumero(c.sem_numero || false);
    setComplemento(c.complemento || "");
    setCidade(c.cidade || "");
    const cels = (c.cliente_celulares || []).map((cc) => ({
      numero: cc.celular,
      responsavel: cc.nome_responsavel || "",
    }));
    setCelulares(cels.length ? cels : [{ numero: "", responsavel: "" }]);
  }

  function formatarCpfExibicao(digitos: string) {
    if (digitos.length !== 11) return digitos;
    return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
  }

  /* ---------------- Busca de cliente pelo nome (autocomplete) ---------------- */
  async function aoMudarNome(v: string) {
    setNome(v);
    setClienteIdExistente(null);
    if (v.trim().length < 2 || !lojaAtual) {
      setSugestoesNome([]);
      setMostrarSugestoesNome(false);
      return;
    }
    const { data } = await supabase
      .from("clientes")
      .select("id, nome, cpf, endereco, numero, sem_numero, complemento, cidade, cliente_celulares(celular, nome_responsavel)")
      .eq("loja_id", lojaAtual)
      .ilike("nome", `%${v.trim()}%`)
      .limit(6);
    setSugestoesNome((data as typeof sugestoesNome) || []);
    setMostrarSugestoesNome(true);
  }

  function selecionarSugestaoNome(c: (typeof sugestoesNome)[number]) {
    preencherCliente(c);
    setMostrarSugestoesNome(false);
    setSugestoesNome([]);
    setCpfInfo(`Cliente já cadastrado: ${c.nome}`);
    setCpfInfoCor("text-green-700");
  }

  function formatarCelularInput(v: string) {
    const n = apenasNumeros(v).slice(0, 11);
    let out = "";
    if (n.length > 0) out = "(" + n.substring(0, 2);
    if (n.length >= 2) out += ") ";
    if (n.length > 2) out += n.substring(2, 3);
    if (n.length > 3) out += " " + n.substring(3, 7);
    if (n.length > 7) out += "-" + n.substring(7, 11);
    return out;
  }

  function atualizarCelular(idx: number, valor: string) {
    const novos = [...celulares];
    novos[idx] = { ...novos[idx], numero: formatarCelularInput(valor) };
    setCelulares(novos);
  }

  function atualizarResponsavelCelular(idx: number, valor: string) {
    const novos = [...celulares];
    novos[idx] = { ...novos[idx], responsavel: valor };
    setCelulares(novos);
  }

  /* ---------------- Passo 1 -> 2 ---------------- */
  function validarPasso1(): string {
    if (!nome.trim()) return "Preencha o nome do cliente.";
    if (!semCpf && apenasNumeros(cpf).length !== 11) {
      return "O CPF precisa ter os 11 números completos (ou marque \"Sem CPF\").";
    }
    const celularesPreenchidos = celulares.filter((c) => c.numero.trim());
    if (celularesPreenchidos.length === 0) return "Preencha pelo menos um número de celular.";
    for (const c of celularesPreenchidos) {
      if (apenasNumeros(c.numero).length !== 11) return "Cada celular precisa ter os 11 números completos.";
    }
    if (formaRecebimento !== "retirada") {
      if (!endereco.trim()) return "Preencha o endereço (ou selecione Retirada na loja).";
      if (!semNumero && !numero.trim()) return "Preencha o número da casa (ou marque Sem número).";
    }
    return "";
  }

  function irParaProdutos() {
    const erro = validarPasso1();
    if (erro) {
      setErroPasso1(erro);
      return;
    }
    setErroPasso1("");
    setPasso(2);
  }

  /* ---------------- Produtos: seleção ---------------- */
  const categorias = Array.from(new Set(produtos.map((p) => p.categoria)));
  const todasAsCores = tecidosCores.filter((c) => c.disponivel);

  function atualizarValorPelaVariante(
    p: ProdutoComVariantes,
    nomeVariante: string
  ) {
    const variante = p.produto_variantes.find((v) => v.nome_variante === nomeVariante);
    if (variante) setValorUnitario(Math.round(variante.preco_avista * 1.1 * 100) / 100);
  }

  function selecionarProduto(p: ProdutoComVariantes) {
    setProdutoSelecionado(p);
    setBuscaProduto(p.nome);
    setDropdownAberto(false);
    setTipoEntrega("pronta");
    setCorSel("");
    setCorManual("");
    setCorSimplesSel("");
    setCorSimplesManual("");
    setModeloSel("");
    setObservacaoItem("");
    setDividirRecebimentoItem(false);
    setQtdRetiradaItem(formaRecebimento === "entrega" ? 0 : 1);
    setQtdEntregaItem(formaRecebimento === "entrega" ? 1 : 0);

    if (p.tipo_precificacao === "espessura") {
      const primeira = p.produto_variantes[0]?.nome_variante || "5cm";
      setEspessuraSel(primeira);
      atualizarValorPelaVariante(p, primeira);
    } else if (p.tipo_precificacao === "tecido") {
      const primeira = p.produto_variantes[0]?.nome_variante || "Suede";
      setTecidoSel(primeira);
      atualizarValorPelaVariante(p, primeira);
    } else {
      setValorUnitario(Math.round(p.preco_venda * 1.1 * 100) / 100);
      if (p.categoria === "Cabeceiras") setTecidoSel("Suede"); // só pra filtrar a cor, não muda o preço
    }
  }

  function estoqueDisponivel(): number {
    if (!produtoSelecionado) return 0;
    if (produtoSelecionado.tipo_precificacao === "espessura") {
      const v = produtoSelecionado.produto_variantes.find((vv) => vv.nome_variante === espessuraSel);
      return v?.estoque || 0;
    }
    if (produtoSelecionado.tipo_precificacao === "tecido") {
      const v = produtoSelecionado.produto_variantes.find((vv) => vv.nome_variante === tecidoSel);
      return v?.estoque || 0;
    }
    return produtoSelecionado.quantidade_estoque || 0;
  }

  function varianteAtualId(): string | null {
    if (!produtoSelecionado) return null;
    if (produtoSelecionado.tipo_precificacao === "espessura") {
      return (
        produtoSelecionado.produto_variantes.find((v) => v.nome_variante === espessuraSel)?.id ||
        null
      );
    }
    if (produtoSelecionado.tipo_precificacao === "tecido") {
      return (
        produtoSelecionado.produto_variantes.find((v) => v.nome_variante === tecidoSel)?.id || null
      );
    }
    return null;
  }

  function valorAVistaAtual(): number {
    if (!produtoSelecionado) return 0;
    if (produtoSelecionado.tipo_precificacao === "espessura") {
      return (
        produtoSelecionado.produto_variantes.find((v) => v.nome_variante === espessuraSel)
          ?.preco_avista || 0
      );
    }
    if (produtoSelecionado.tipo_precificacao === "tecido") {
      return (
        produtoSelecionado.produto_variantes.find((v) => v.nome_variante === tecidoSel)
          ?.preco_avista || 0
      );
    }
    return produtoSelecionado.preco_venda;
  }

  function mostrarTecidoCor(): boolean {
    if (!produtoSelecionado) return false;
    return produtoSelecionado.tipo_precificacao === "tecido" || produtoSelecionado.categoria === "Cabeceiras";
  }

  function precisaCorSimples(): boolean {
    if (!produtoSelecionado) return false;
    if (mostrarTecidoCor()) return false; // cabeceiras/tecido já têm cor via tecido
    return produtoSelecionado.categoria === "Puffs";
  }

  function corTexto(): string | null {
    if (!produtoSelecionado) return null;
    let base: string | null = null;
    if (produtoSelecionado.tipo_precificacao === "espessura") base = `Espessura ${espessuraSel}`;
    else if (mostrarTecidoCor()) {
      if (corManual.trim()) base = `${tecidoSel} — ${corManual.trim()}`;
      else {
        const cor = tecidosCores.find((c) => c.tecido === tecidoSel && c.codigo === corSel);
        base = cor ? `${tecidoSel} — Cor ${cor.codigo} (${cor.nome})` : tecidoSel;
      }
    } else if (precisaCorSimples()) {
      if (corSimplesManual.trim()) base = corSimplesManual.trim();
      else if (corSimplesSel) {
        const cor = todasAsCores.find((c) => `${c.tecido}-${c.codigo}` === corSimplesSel);
        base = cor ? cor.nome : null;
      }
    }
    if (precisaModelo() && modeloSel) {
      return base ? `${base} — Modelo ${modeloSel}` : `Modelo ${modeloSel}`;
    }
    return base;
  }

  function precisaModelo(): boolean {
    if (!produtoSelecionado) return false;
    return (
      produtoSelecionado.categoria === "Cabeceiras" ||
      PRODUTOS_COM_MODELO.includes(produtoSelecionado.nome)
    );
  }

  function adicionarAoCarrinho() {
    if (!produtoSelecionado) return;
    const disponivel = estoqueDisponivel();
    if (tipoEntrega === "pronta" && disponivel <= 0) {
      alert(
        `"${produtoSelecionado.nome}" está sem estoque. Marque como Encomenda ou reponha o estoque em Administração.`
      );
      return;
    }
    if (tipoEntrega === "pronta" && quantidade > disponivel) {
      alert(`Só tem ${disponivel} unidade(s) em estoque pra pronta entrega.`);
      return;
    }

    let quantidadeRetirada = quantidade;
    let quantidadeEntrega = 0;
    if (formaRecebimento === "entrega") {
      quantidadeRetirada = 0;
      quantidadeEntrega = quantidade;
    } else if (formaRecebimento === "misto") {
      if (qtdRetiradaItem + qtdEntregaItem !== quantidade) {
        alert(
          `A soma de "Qtd. retirada" e "Qtd. entrega" precisa ser igual à quantidade comprada (${quantidade}).`
        );
        return;
      }
      quantidadeRetirada = qtdRetiradaItem;
      quantidadeEntrega = qtdEntregaItem;
    }

    setCarrinho((atual) => [
      ...atual,
      {
        produtoId: produtoSelecionado.id,
        nome: produtoSelecionado.nome,
        categoria: produtoSelecionado.categoria,
        quantidade,
        valorUnitario,
        valorAVista: valorAVistaAtual(),
        varianteId: varianteAtualId(),
        varianteNome:
          produtoSelecionado.tipo_precificacao === "espessura"
            ? espessuraSel
            : produtoSelecionado.tipo_precificacao === "tecido"
            ? tecidoSel
            : null,
        cor: corTexto(),
        modelo: precisaModelo() ? modeloSel || null : null,
        tipoEntrega,
        retirada: quantidadeRetirada > 0,
        quantidadeRetirada,
        quantidadeEntrega,
        observacao: observacaoItem.trim() || null,
      },
    ]);

    setProdutoSelecionado(null);
    setBuscaProduto("");
    setQuantidade(1);
    setValorUnitario(0);
    setTipoEntrega("pronta");
    setCorSel("");
    setCorManual("");
    setCorSimplesSel("");
    setCorSimplesManual("");
    setModeloSel("");
    setObservacaoItem("");
    setDividirRecebimentoItem(false);
  }

  function removerDoCarrinho(idx: number) {
    setCarrinho((atual) => atual.filter((_, i) => i !== idx));
  }

  const subtotalCarrinho = carrinho.reduce((s, i) => s + i.valorUnitario * i.quantidade, 0);
  const subtotalAVista = carrinho.reduce((s, i) => s + i.valorAVista * i.quantidade, 0);

  /* ---------------- Pagamento ----------------
     O valor de cada forma é o que o CLIENTE REALMENTE vai pagar — digitado
     direto, sem conta escondida. Se a forma for Crédito parcelado, o
     acréscimo de 10% já deve estar embutido nesse valor (calculamos um
     valor sugerido automaticamente quando a forma muda, mas o caixa pode
     ajustar como quiser). */
  function baseImplicita(p: { forma: FormaPagamento | ""; parcelas: number; valor: number }) {
    const ehParcelado = p.forma === "Crédito" && p.parcelas > 1;
    return ehParcelado ? Math.round((p.valor / 1.1) * 100) / 100 : p.valor;
  }

  function valorSugerido(base: number, forma: FormaPagamento | "", parcelas: number) {
    const ehParcelado = forma === "Crédito" && parcelas > 1;
    return ehParcelado ? Math.round(base * 1.1 * 100) / 100 : Math.round(base * 100) / 100;
  }

  const total = Math.round(pagamentos.reduce((s, p) => s + (p.valor || 0), 0) * 100) / 100;
  const baseTotalImplicita = pagamentos.reduce((s, p) => s + baseImplicita(p), 0);
  const acrescimo = Math.round((total - baseTotalImplicita) * 100) / 100;
  const todasFormasEscolhidas = pagamentos.every((p) => p.forma);
  const diferencaDoEsperado = Math.round((total - subtotalAVista) * 100) / 100;

  function irParaPagamento() {
    setPagamentos([{ forma: "", parcelas: 1, valor: subtotalAVista }]);
    setPasso(3);
  }

  function atualizarPagamento(idx: number, mudanca: Partial<PagamentoParte>) {
    setPagamentos((atual) =>
      atual.map((p, i) => {
        if (i !== idx) return p;
        const atualizado = { ...p, ...mudanca };
        // se mudou a forma/parcelas, sugere um valor novo a partir do que já
        // estava lá (o caixa pode digitar por cima se quiser outro valor)
        if (mudanca.forma !== undefined || mudanca.parcelas !== undefined) {
          const base = baseImplicita(p);
          atualizado.valor = valorSugerido(base, atualizado.forma, atualizado.parcelas);
        }
        return atualizado;
      })
    );
  }

  function adicionarFormaPagamento() {
    const jaAlocado = pagamentos.reduce((s, p) => s + (p.valor || 0), 0);
    const restante = Math.max(Math.round((subtotalAVista - jaAlocado) * 100) / 100, 0);
    setPagamentos((atual) => [...atual, { forma: "", parcelas: 1, valor: restante }]);
  }

  function removerFormaPagamento(idx: number) {
    setPagamentos((atual) => atual.filter((_, i) => i !== idx));
  }

  function precisaPrazoObrigatorio(): boolean {
    return (
      formaRecebimento === "entrega" ||
      (formaRecebimento === "misto" && carrinho.some((i) => i.quantidadeEntrega > 0)) ||
      carrinho.some((i) => i.tipoEntrega === "encomenda")
    );
  }

  /* ---------------- Finalizar venda ---------------- */
  async function finalizarVenda() {
    if (!todasFormasEscolhidas) {
      alert("Escolha a forma de pagamento em todas as linhas antes de finalizar.");
      return;
    }
    if (total <= 0) {
      alert("O valor total da venda precisa ser maior que zero.");
      return;
    }
    if (precisaPrazoObrigatorio() && !prazoEntregaMaximo) {
      alert("Preencha o prazo máximo de entrega — é obrigatório quando tem item de entrega ou encomenda.");
      return;
    }
    if (!lojaAtual) {
      alert("Selecione uma loja ativa no menu lateral antes de vender.");
      return;
    }

    // Caixa fechado? pergunta se quer abrir na hora, sem sair da tela de venda.
    let turnoParaUsar = turnoAtual;
    if (!turnoParaUsar) {
      const querAbrir = confirm("O caixa está fechado. Deseja abrir o caixa?");
      if (!querAbrir) return;

      const { data: caixasLoja, error: erroCaixas } = await supabase
        .from("caixas")
        .select("id")
        .eq("loja_id", lojaAtual)
        .eq("ativo", true)
        .order("nome")
        .limit(1);
      if (erroCaixas || !caixasLoja || caixasLoja.length === 0) {
        alert("Essa loja ainda não tem nenhum caixa cadastrado. Vá em Administração → Caixas e cadastre um primeiro.");
        return;
      }
      const { data: novoTurno, error: erroAbrir } = await supabase
        .from("turnos_caixa")
        .insert({ caixa_id: caixasLoja[0].id, fundo_inicial: 0, status: "aberto", loja_id: lojaAtual })
        .select("id")
        .single();
      if (erroAbrir || !novoTurno) {
        alert("Erro ao abrir o caixa: " + (erroAbrir?.message || "tente novamente."));
        return;
      }
      turnoParaUsar = novoTurno;
      setTurnoAtual(novoTurno);
    }

    setSalvando(true);

    try {
      let clienteId = clienteIdExistente;
      const celularesPreenchidos = celulares.filter((c) => c.numero.trim());
      const dadosCliente = {
        nome,
        cpf: semCpf ? null : apenasNumeros(cpf),
        telefone: celularesPreenchidos[0]?.numero || null,
        endereco,
        numero: semNumero ? "S/N" : numero,
        sem_numero: semNumero,
        complemento: complemento || null,
        cidade: cidade || null,
      };

      if (!clienteId) {
        const { data: novoCliente, error: erroCliente } = await supabase
          .from("clientes")
          .insert({ ...dadosCliente, loja_id: lojaAtual })
          .select("id")
          .single();
        if (erroCliente) throw erroCliente;
        clienteId = novoCliente.id;

        if (celularesPreenchidos.length > 0) {
          await supabase.from("cliente_celulares").insert(
            celularesPreenchidos.map((c) => ({
              cliente_id: clienteId,
              celular: c.numero,
              nome_responsavel: c.responsavel.trim() || null,
            }))
          );
        }
      } else {
        // cliente já existia — atualiza o cadastro principal com os dados mais recentes
        // digitados nessa venda (endereço, telefone, número, complemento etc.)
        const { error: erroAtualizar } = await supabase
          .from("clientes")
          .update(dadosCliente)
          .eq("id", clienteId);
        if (erroAtualizar) throw erroAtualizar;

        // ressincroniza os celulares (evita duplicar, sempre reflete o que está na tela)
        await supabase.from("cliente_celulares").delete().eq("cliente_id", clienteId);
        if (celularesPreenchidos.length > 0) {
          await supabase.from("cliente_celulares").insert(
            celularesPreenchidos.map((c) => ({
              cliente_id: clienteId,
              celular: c.numero,
              nome_responsavel: c.responsavel.trim() || null,
            }))
          );
        }
      }

      const formaResumo = pagamentos.length > 1 ? "Dividido" : (pagamentos[0].forma as FormaPagamento);

      const { data: venda, error: erroVenda } = await supabase
        .from("vendas")
        .insert({
          turno_caixa_id: turnoParaUsar?.id || null,
          cliente_id: clienteId,
          forma_pagamento: formaResumo,
          parcelas: pagamentos.length === 1 && pagamentos[0].forma === "Crédito" ? pagamentos[0].parcelas : 1,
          subtotal: baseTotalImplicita,
          ajuste: acrescimo,
          total,
          prazo_entrega_maximo: prazoEntregaMaximo || null,
          forma_recebimento: formaRecebimento,
          loja_id: lojaAtual,
        })
        .select("id, numero_pedido")
        .single();
      if (erroVenda) throw erroVenda;

      const pagamentosParaInserir = pagamentos.map((p) => ({
        venda_id: venda.id,
        forma_pagamento: p.forma as FormaPagamento,
        parcelas: p.forma === "Crédito" ? p.parcelas : 1,
        valor: p.valor,
      }));
      const { error: erroPagamentos } = await supabase.from("venda_pagamentos").insert(pagamentosParaInserir);
      if (erroPagamentos) throw erroPagamentos;

      // Cliente vai retirar (parcial ou total) + prazo do mesmo dia (ou sem prazo)
      // = já levou a parte de retirada na hora. Prazo pra outro dia = "vai levar
      // depois", com botão de confirmar quando ele vier buscar (igual encomenda).
      const hojeStr = new Date().toISOString().slice(0, 10);
      const prazoEhHojeOuVazio = !prazoEntregaMaximo || prazoEntregaMaximo === hojeStr;

      const itensParaInserir = carrinho.map((item) => ({
        venda_id: venda.id,
        produto_id: item.produtoId,
        nome_produto: item.nome,
        variante: item.cor || item.varianteNome,
        quantidade: item.quantidade,
        valor_unitario: item.valorUnitario,
        total: item.valorUnitario * item.quantidade,
        tipo_entrega: item.tipoEntrega,
        status_entrega:
          item.quantidadeRetirada > 0
            ? prazoEhHojeOuVazio
              ? "entregue"
              : "encomenda"
            : item.tipoEntrega === "encomenda"
            ? "encomenda"
            : null,
        data_entregue: item.quantidadeRetirada > 0 && prazoEhHojeOuVazio ? new Date().toISOString() : null,
        retirada: item.retirada,
        quantidade_retirada: item.quantidadeRetirada,
        quantidade_entrega: item.quantidadeEntrega,
        observacao: item.observacao,
      }));
      const { error: erroItens } = await supabase.from("venda_itens").insert(itensParaInserir);
      if (erroItens) throw erroItens;

      for (const item of carrinho) {
        if (item.tipoEntrega !== "pronta") continue;
        await ajustarEstoqueLoja(supabase, lojaAtual, item.produtoId, item.varianteId, -item.quantidade);
      }

      if (turnoParaUsar?.id) {
        const { data: turno } = await supabase
          .from("turnos_caixa")
          .select("total_vendido, total_dinheiro, total_pix, total_debito, total_credito")
          .eq("id", turnoParaUsar.id)
          .single();
        if (turno) {
          const totaisAtualizados: Record<string, number> = {
            total_vendido: (turno.total_vendido || 0) + total,
            total_dinheiro: turno.total_dinheiro || 0,
            total_pix: turno.total_pix || 0,
            total_debito: turno.total_debito || 0,
            total_credito: turno.total_credito || 0,
          };
          for (const p of pagamentos) {
            const campoForma =
              p.forma === "Dinheiro"
                ? "total_dinheiro"
                : p.forma === "Pix"
                ? "total_pix"
                : p.forma === "Débito"
                ? "total_debito"
                : "total_credito";
            totaisAtualizados[campoForma] += p.valor;
          }
          await supabase.from("turnos_caixa").update(totaisAtualizados).eq("id", turnoParaUsar.id);
        }
      }

      const { data: lojaData } = await supabase.from("lojas").select("*").eq("id", lojaAtual).maybeSingle();
      setLojaInfo(lojaData as LojaCompleta | null);

      setVendaConcluida({ total, forma: formaResumo, numeroPedido: venda.numero_pedido, pagamentos });
      setPasso(4);
      carregarProdutos();
    } catch (erro: unknown) {
      // eslint-disable-next-line no-console
      console.error("Erro ao finalizar venda:", erro);
      const erroObj = erro as { message?: string; details?: string; hint?: string; code?: string } | null;
      const partes = [erroObj?.message, erroObj?.details, erroObj?.hint].filter(Boolean);
      const mensagem =
        partes.length > 0
          ? partes.join(" — ")
          : typeof erro === "string"
          ? erro
          : "Não deu pra identificar a causa exata — veja o console do navegador (F12) para mais detalhes.";
      alert("Erro ao finalizar a venda: " + mensagem);
    } finally {
      setSalvando(false);
    }
  }

  function novaVenda() {
    setNome("");
    setCpf("");
    setSemCpf(false);
    setCelulares([{ numero: "", responsavel: "" }]);
    setEndereco("");
    setNumero("");
    setSemNumero(false);
    setComplemento("");
    setCidade("");
    setClienteIdExistente(null);
    setClienteRetira(false);
    setFormaRecebimento("retirada");
    setCarrinho([]);
    setPagamentos([{ forma: "", parcelas: 1, valor: 0 }]);
    setPrazoEntregaMaximo("");
    setVendaConcluida(null);
    setPasso(1);
  }

  const produtosFiltrados = produtos.filter((p) => {
    if (buscaProduto && !p.nome.toLowerCase().includes(buscaProduto.toLowerCase())) return false;
    if (categoriaAberta && p.categoria !== categoriaAberta) return false;
    return true;
  });

  return (
    <div className="p-8">
      <h1 className="font-display text-3xl text-madeira-900">Nova venda</h1>
      <p className="text-madeira-600 mt-1 mb-8">
        Cadastre o cliente, monte o pedido e feche a venda.
      </p>

      <div className="flex gap-6 mb-8 border-b border-estofado-100 pb-3 text-sm font-medium">
        <span className={passo === 1 ? "text-madeira-900" : "text-madeira-400"}>1. Cliente</span>
        <span className={passo === 2 ? "text-madeira-900" : "text-madeira-400"}>2. Produtos</span>
        <span className={passo === 3 ? "text-madeira-900" : "text-madeira-400"}>3. Pagamento</span>
      </div>

      {/* PASSO 1: CLIENTE */}
      {passo === 1 && (
        <div className="card p-6 max-w-lg">
          <div className="space-y-4">
            <label className="block relative">
              <span className="text-xs text-madeira-600 mb-1 block">Nome do cliente</span>
              <input
                className="input-base"
                value={nome}
                onChange={(e) => aoMudarNome(e.target.value)}
                onFocus={() => sugestoesNome.length > 0 && setMostrarSugestoesNome(true)}
                onBlur={() => setTimeout(() => setMostrarSugestoesNome(false), 150)}
                autoComplete="off"
              />
              {mostrarSugestoesNome && sugestoesNome.length > 0 && (
                <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-madeira-200 rounded shadow-lg max-h-56 overflow-y-auto">
                  {sugestoesNome.map((c) => (
                    <div
                      key={c.id}
                      className="px-3 py-2 text-sm hover:bg-madeira-50 cursor-pointer border-b border-estofado-100 last:border-0"
                      onMouseDown={() => selecionarSugestaoNome(c)}
                    >
                      <span className="block">{c.nome}</span>
                      {c.cpf && (
                        <span className="block text-xs text-madeira-400">{formatarCpfExibicao(c.cpf)}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </label>

            <label className="block">
              <span className="text-xs text-madeira-600 mb-1 block">CPF</span>
              <input
                className="input-base"
                value={cpf}
                onChange={(e) => aoMudarCpf(e.target.value)}
                placeholder="000.000.000-00"
                disabled={semCpf}
              />
              <label className="flex items-center gap-2 mt-2 text-xs text-madeira-600 cursor-pointer">
                <input
                  type="checkbox"
                  checked={semCpf}
                  onChange={(e) => {
                    setSemCpf(e.target.checked);
                    if (e.target.checked) {
                      setCpf("");
                      setCpfInfo("");
                    }
                  }}
                />
                Sem CPF
              </label>
              {cpfInfo && <p className={`text-xs mt-1 ${cpfInfoCor}`}>{cpfInfo}</p>}
            </label>

            <div>
              <span className="text-xs text-madeira-600 mb-1 block">Celular</span>
              {celulares.map((c, idx) => (
                <div key={idx} className="flex gap-2 mb-2 items-start">
                  <input
                    className="input-base"
                    value={c.numero}
                    onChange={(e) => atualizarCelular(idx, e.target.value)}
                    placeholder="(79) 9 9999-9999"
                  />
                  <input
                    className="input-base"
                    value={c.responsavel}
                    onChange={(e) => atualizarResponsavelCelular(idx, e.target.value)}
                    placeholder="Nome do responsável (opcional)"
                  />
                  {celulares.length > 1 && (
                    <button
                      type="button"
                      className="text-xs text-red-700 mt-2.5 whitespace-nowrap"
                      onClick={() => setCelulares(celulares.filter((_, i) => i !== idx))}
                    >
                      remover
                    </button>
                  )}
                </div>
              ))}
              <button
                type="button"
                className="text-xs text-madeira-600 font-semibold"
                onClick={() => setCelulares([...celulares, { numero: "", responsavel: "" }])}
              >
                + Adicionar outro número
              </button>
            </div>

            <div>
              <p className="text-xs font-semibold text-madeira-700 mb-2">
                Como o cliente vai receber os produtos?
              </p>
              <div className="grid grid-cols-3 gap-2 mb-1">
                {(
                  [
                    ["retirada", "Retirada na loja"],
                    ["entrega", "Entrega"],
                    ["misto", "Misto"],
                  ] as [FormaRecebimento, string][]
                ).map(([valor, label]) => (
                  <button
                    key={valor}
                    type="button"
                    className={`opcao-btn ${formaRecebimento === valor ? "ativo" : ""}`}
                    onClick={() => setFormaRecebimento(valor)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {formaRecebimento === "misto" && (
                <p className="text-xs text-madeira-500">
                  Você escolhe, produto por produto, se é retirada ou entrega no próximo passo.
                </p>
              )}
            </div>

            {formaRecebimento !== "retirada" && (
              <>
                <label className="block">
                  <span className="text-xs text-madeira-600 mb-1 block">Endereço da entrega</span>
                  <input
                    className="input-base"
                    value={endereco}
                    onChange={(e) => setEndereco(e.target.value)}
                    placeholder="Rua, bairro, cidade"
                  />
                </label>

                <label className="block">
                  <span className="text-xs text-madeira-600 mb-1 block">Número da casa</span>
                  <input
                    className="input-base"
                    value={numero}
                    disabled={semNumero}
                    onChange={(e) => setNumero(e.target.value)}
                    placeholder="Ex: 120"
                  />
                  <label className="flex items-center gap-2 mt-2 text-xs text-madeira-600">
                    <input
                      type="checkbox"
                      checked={semNumero}
                      onChange={(e) => {
                        setSemNumero(e.target.checked);
                        if (e.target.checked) setNumero("");
                      }}
                    />
                    Sem número (S/N)
                  </label>
                </label>

                <label className="block">
                  <span className="text-xs text-madeira-600 mb-1 block">
                    Complemento <span className="text-madeira-400">(opcional)</span>
                  </span>
                  <input
                    className="input-base"
                    value={complemento}
                    onChange={(e) => setComplemento(e.target.value)}
                  />
                </label>

                <label className="block">
                  <span className="text-xs text-madeira-600 mb-1 block">Cidade</span>
                  <input className="input-base" value={cidade} onChange={(e) => setCidade(e.target.value)} />
                </label>
              </>
            )}

            {erroPasso1 && <p className="text-sm text-red-700 font-medium">{erroPasso1}</p>}

            <button className="btn-primario w-full" onClick={irParaProdutos}>
              Continuar para produtos
            </button>
          </div>
        </div>
      )}

      {/* PASSO 2: PRODUTOS */}
      {passo === 2 && (
        <div className="grid grid-cols-1 md:grid-cols-[380px_1fr] gap-5">
          <div className="card p-5">
            <div className="relative mb-3" ref={buscaProdutoRef}>
              <span className="text-xs text-madeira-600 mb-1 block">Buscar produto</span>
              <input
                className="input-base"
                value={buscaProduto}
                onFocus={() => setDropdownAberto(true)}
                onChange={(e) => {
                  setBuscaProduto(e.target.value);
                  setDropdownAberto(true);
                }}
                placeholder="Digite ou clique pra ver as categorias..."
              />
              {dropdownAberto && (
                <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-madeira-200 rounded shadow-lg max-h-72 overflow-y-auto">
                  <div className="flex flex-wrap gap-1 p-2 border-b border-estofado-100">
                    <button
                      type="button"
                      className={`text-xs px-2 py-1 rounded-full border ${
                        !categoriaAberta ? "bg-madeira-700 text-white" : "border-madeira-200"
                      }`}
                      onClick={() => setCategoriaAberta(null)}
                    >
                      Todas
                    </button>
                    {categorias.map((c) => (
                      <button
                        type="button"
                        key={c}
                        className={`text-xs px-2 py-1 rounded-full border ${
                          categoriaAberta === c ? "bg-madeira-700 text-white" : "border-madeira-200"
                        }`}
                        onClick={() => setCategoriaAberta(c)}
                      >
                        {c}
                      </button>
                    ))}
                  </div>
                  {produtosFiltrados.length === 0 ? (
                    <p className="text-xs text-madeira-400 p-4 text-center">Nenhum produto encontrado.</p>
                  ) : (
                    produtosFiltrados.map((p) => {
                      const estoqueTotal = p.produto_variantes.length
                        ? p.produto_variantes.reduce((s, v) => s + v.estoque, 0)
                        : p.quantidade_estoque || 0;
                      return (
                        <div
                          key={p.id}
                          className="flex justify-between px-3 py-2 text-sm hover:bg-madeira-50 cursor-pointer border-b border-estofado-100 last:border-0"
                          onClick={() => selecionarProduto(p)}
                        >
                          <span>{p.nome}</span>
                          <span
                            className={`text-xs font-semibold ${
                              estoqueTotal > 0 ? "text-latao-500" : "text-red-600"
                            }`}
                          >
                            {estoqueTotal > 0 ? `${estoqueTotal} em estoque` : "sem estoque"}
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              )}
            </div>

            {produtoSelecionado && (
              <>
                {mostrarTecidoCor() && (
                  <div className="mb-3">
                    <span className="text-xs text-madeira-600 mb-1 block">Tecido</span>
                    <div className="grid grid-cols-3 gap-2">
                      {TECIDOS.map((t) => (
                        <button
                          type="button"
                          key={t}
                          className={`opcao-btn ${tecidoSel === t ? "ativo" : ""}`}
                          onClick={() => {
                            setTecidoSel(t);
                            atualizarValorPelaVariante(produtoSelecionado, t);
                          }}
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {produtoSelecionado.tipo_precificacao === "espessura" && (
                  <div className="mb-3">
                    <span className="text-xs text-madeira-600 mb-1 block">Espessura</span>
                    <div className="grid grid-cols-3 gap-2">
                      {ESPESSURAS.map((e) => (
                        <button
                          type="button"
                          key={e}
                          className={`opcao-btn ${espessuraSel === e ? "ativo" : ""}`}
                          onClick={() => {
                            setEspessuraSel(e);
                            atualizarValorPelaVariante(produtoSelecionado, e);
                          }}
                        >
                          {e}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="mb-3">
                  <span className="text-xs text-madeira-600 mb-1 block">Entrega</span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      className={`opcao-btn ${tipoEntrega === "pronta" ? "ativo" : ""}`}
                      onClick={() => setTipoEntrega("pronta")}
                    >
                      Pronta entrega
                    </button>
                    <button
                      type="button"
                      className={`opcao-btn ${tipoEntrega === "encomenda" ? "ativo" : ""}`}
                      onClick={() => setTipoEntrega("encomenda")}
                    >
                      Encomenda
                    </button>
                  </div>
                  {tipoEntrega === "encomenda" && (
                    <p className="text-xs text-madeira-500 mt-1">
                      Item de encomenda — não será descontado do estoque.
                    </p>
                  )}
                </div>

                {formaRecebimento === "misto" && (
                  <div className="mb-3 bg-madeira-50 rounded p-3">
                    <span className="text-xs text-madeira-600 mb-1 block">Recebimento deste produto</span>
                    <div className="grid grid-cols-3 gap-2 mb-2">
                      <button
                        type="button"
                        className={`opcao-btn ${!dividirRecebimentoItem && qtdRetiradaItem === quantidade ? "ativo" : ""}`}
                        onClick={() => {
                          setDividirRecebimentoItem(false);
                          setQtdRetiradaItem(quantidade);
                          setQtdEntregaItem(0);
                        }}
                      >
                        Retirada
                      </button>
                      <button
                        type="button"
                        className={`opcao-btn ${!dividirRecebimentoItem && qtdEntregaItem === quantidade ? "ativo" : ""}`}
                        onClick={() => {
                          setDividirRecebimentoItem(false);
                          setQtdEntregaItem(quantidade);
                          setQtdRetiradaItem(0);
                        }}
                      >
                        Entrega
                      </button>
                      <button
                        type="button"
                        className={`opcao-btn ${dividirRecebimentoItem ? "ativo" : ""}`}
                        onClick={() => {
                          setDividirRecebimentoItem(true);
                          setQtdRetiradaItem(Math.ceil(quantidade / 2));
                          setQtdEntregaItem(Math.floor(quantidade / 2));
                        }}
                        disabled={quantidade < 2}
                      >
                        Dividir
                      </button>
                    </div>
                    {dividirRecebimentoItem && (
                      <div className="grid grid-cols-2 gap-2">
                        <label className="block">
                          <span className="text-xs text-madeira-600 mb-1 block">Qtd. retirada</span>
                          <input
                            className="input-base"
                            type="number"
                            min={0}
                            value={qtdRetiradaItem}
                            onChange={(e) => setQtdRetiradaItem(Math.max(0, Number(e.target.value) || 0))}
                          />
                        </label>
                        <label className="block">
                          <span className="text-xs text-madeira-600 mb-1 block">Qtd. entrega</span>
                          <input
                            className="input-base"
                            type="number"
                            min={0}
                            value={qtdEntregaItem}
                            onChange={(e) => setQtdEntregaItem(Math.max(0, Number(e.target.value) || 0))}
                          />
                        </label>
                        {qtdRetiradaItem + qtdEntregaItem !== quantidade && (
                          <p className="text-xs text-red-700 col-span-2">
                            A soma precisa ser igual à quantidade comprada ({quantidade}). Está em{" "}
                            {qtdRetiradaItem + qtdEntregaItem}.
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                )}

                {mostrarTecidoCor() && (
                  <div className="mb-3">
                    <label className="block mb-2">
                      <span className="text-xs text-madeira-600 mb-1 block">Cor</span>
                      <select
                        className="input-base"
                        value={corSel}
                        onChange={(e) => {
                          setCorSel(e.target.value);
                          setCorManual("");
                        }}
                      >
                        <option value="">Selecione...</option>
                        {tecidosCores
                          .filter((c) => c.tecido === tecidoSel && c.disponivel)
                          .map((c) => (
                            <option key={c.id} value={c.codigo}>
                              Cor {c.codigo} — {c.nome}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs text-madeira-600 mb-1 block">Ou digite uma cor manualmente</span>
                      <input
                        className="input-base"
                        value={corManual}
                        onChange={(e) => {
                          setCorManual(e.target.value);
                          if (e.target.value) setCorSel("");
                        }}
                        placeholder="Ex: Cinza personalizado"
                      />
                    </label>
                  </div>
                )}

                {precisaCorSimples() && (
                  <div className="mb-3">
                    <label className="block mb-2">
                      <span className="text-xs text-madeira-600 mb-1 block">Cor</span>
                      <select
                        className="input-base"
                        value={corSimplesSel}
                        onChange={(e) => {
                          setCorSimplesSel(e.target.value);
                          setCorSimplesManual("");
                        }}
                      >
                        <option value="">Selecione...</option>
                        {todasAsCores.map((c) => (
                          <option key={c.id} value={`${c.tecido}-${c.codigo}`}>
                            {c.nome} ({c.tecido})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className="text-xs text-madeira-600 mb-1 block">Ou digite uma cor manualmente</span>
                      <input
                        className="input-base"
                        value={corSimplesManual}
                        onChange={(e) => {
                          setCorSimplesManual(e.target.value);
                          if (e.target.value) setCorSimplesSel("");
                        }}
                        placeholder="Ex: Vermelho"
                      />
                    </label>
                  </div>
                )}

                {precisaModelo() && (
                  <label className="block mb-3">
                    <span className="text-xs text-madeira-600 mb-1 block">Modelo</span>
                    <select className="input-base" value={modeloSel} onChange={(e) => setModeloSel(e.target.value)}>
                      <option value="">Selecione...</option>
                      {MODELOS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </label>
                )}

                <div className="grid grid-cols-2 gap-3 mb-3">
                  <label className="block">
                    <span className="text-xs text-madeira-600 mb-1 block">Quantidade</span>
                    <input
                      className="input-base"
                      type="number"
                      min={1}
                      value={quantidade}
                      onChange={(e) => setQuantidade(Number(e.target.value) || 1)}
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs text-madeira-600 mb-1 block">Valor unitário (a prazo)</span>
                    <input
                      className="input-base bg-madeira-50"
                      type="text"
                      readOnly
                      value={formatarMoeda(valorUnitario)}
                      title="Preço definido pelo cadastro do produto — não pode ser alterado aqui"
                    />
                  </label>
                </div>

                <label className="block mb-3">
                  <span className="text-xs text-madeira-600 mb-1 block">Observação (opcional)</span>
                  <input
                    className="input-base"
                    value={observacaoItem}
                    onChange={(e) => setObservacaoItem(e.target.value)}
                    placeholder="Ex: cliente pediu pra reforçar a costura"
                  />
                </label>

                <p className="text-xs text-madeira-500 mb-3">
                  {estoqueDisponivel() > 0
                    ? `${estoqueDisponivel()} em estoque`
                    : "sem estoque (pronta entrega bloqueada)"}
                </p>

                <div className="bg-madeira-50 rounded p-3 flex justify-between items-center mb-3">
                  <span className="text-sm text-madeira-700">Total do item</span>
                  <span className="font-display text-lg">
                    {formatarMoeda(valorUnitario * quantidade)}
                  </span>
                </div>

                <button className="btn-primario w-full" onClick={adicionarAoCarrinho}>
                  + Adicionar produto
                </button>
              </>
            )}
          </div>

          <div className="card overflow-hidden flex flex-col">
            <div className="bg-madeira-800 text-madeira-100 px-5 py-3 text-sm">
              Consumidor <strong className="block font-display text-white">{nome || "—"}</strong>
            </div>
            <div className="flex-1 p-4 overflow-y-auto min-h-[160px]">
              {carrinho.length === 0 ? (
                <p className="text-madeira-400 text-sm text-center py-8">Nenhum produto adicionado ainda.</p>
              ) : (
                carrinho.map((item, idx) => (
                  <div key={idx} className="flex justify-between items-center border-b border-estofado-100 py-3">
                    <div>
                      <p className="text-sm text-madeira-800">
                        {item.quantidade}x {item.nome}
                        {item.tipoEntrega === "encomenda" && (
                          <span className="tag-encomenda ml-1">ENCOMENDA</span>
                        )}
                      </p>
                      <p className="text-xs text-madeira-500">
                        {formatarMoeda(item.valorUnitario)} un.{item.cor ? ` · ${item.cor}` : ""}
                      </p>
                      {item.observacao && (
                        <p className="text-xs text-madeira-700 mt-0.5">
                          Obs: <strong>{item.observacao}</strong>
                        </p>
                      )}
                    </div>
                    <div className="text-right">
                      <strong className="font-display block">
                        {formatarMoeda(item.valorUnitario * item.quantidade)}
                      </strong>
                      <button
                        className="text-xs text-red-700"
                        onClick={() => removerDoCarrinho(idx)}
                      >
                        remover
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
            <div className="bg-madeira-50 px-5 py-4 border-t border-estofado-100 flex justify-between font-display text-lg">
              <span>Total</span>
              <span>{formatarMoeda(subtotalCarrinho)}</span>
            </div>
          </div>

          <div className="md:col-span-2 flex gap-3">
            <button className="btn-secundario" onClick={() => setPasso(1)}>
              Voltar
            </button>
            <button
              className="btn-primario"
              onClick={() => {
                if (carrinho.length === 0) {
                  alert("Adicione pelo menos um produto ao carrinho.");
                  return;
                }
                irParaPagamento();
              }}
            >
              Continuar para pagamento
            </button>
          </div>
        </div>
      )}

      {/* PASSO 3: PAGAMENTO */}
      {passo === 3 && (
        <div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
            <div className="card p-5">
              <div className="flex justify-between items-center mb-4">
                <p className="font-display text-lg">Forma de pagamento</p>
                {pagamentos.length < 3 && (
                  <button className="text-xs text-madeira-700 font-semibold" onClick={adicionarFormaPagamento}>
                    + Dividir pagamento
                  </button>
                )}
              </div>

              <p className="text-xs text-madeira-500 mb-3">
                Preço à vista do carrinho: <strong>{formatarMoeda(subtotalAVista)}</strong> · Preço a prazo:{" "}
                <strong>{formatarMoeda(subtotalCarrinho)}</strong>
              </p>

              {pagamentos.map((p, idx) => (
                <div key={idx} className="border border-estofado-100 rounded p-3 mb-3">
                  {pagamentos.length > 1 && (
                    <div className="flex justify-between items-center mb-2">
                      <span className="text-xs font-semibold text-madeira-600">Pagamento {idx + 1}</span>
                      <button className="text-xs text-red-700" onClick={() => removerFormaPagamento(idx)}>
                        remover
                      </button>
                    </div>
                  )}
                  <select
                    className="input-base mb-2"
                    value={p.forma}
                    onChange={(e) =>
                      atualizarPagamento(idx, { forma: e.target.value as FormaPagamento, parcelas: 1 })
                    }
                  >
                    <option value="">Selecione a forma de pagamento</option>
                    <option value="Dinheiro">Dinheiro</option>
                    <option value="Pix">Pix</option>
                    <option value="Débito">Débito</option>
                    <option value="Crédito">Crédito</option>
                  </select>

                  {p.forma === "Crédito" && (
                    <label className="block mb-2">
                      <span className="text-xs text-madeira-600 mb-1 block">Parcelar em</span>
                      <select
                        className="input-base"
                        value={p.parcelas}
                        onChange={(e) => atualizarPagamento(idx, { parcelas: Number(e.target.value) })}
                      >
                        {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>
                            {n}x{n === 1 ? " (à vista)" : ""}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}

                  <label className="block">
                    <span className="text-xs text-madeira-600 mb-1 block">
                      Quanto o cliente vai pagar nessa forma
                    </span>
                    <input
                      className="input-base"
                      type="number"
                      step="0.01"
                      value={p.valor}
                      onChange={(e) => atualizarPagamento(idx, { valor: Number(e.target.value) || 0 })}
                    />
                  </label>
                </div>
              ))}

              {Math.abs(diferencaDoEsperado) > 0.5 && (
                <p className="text-xs text-madeira-500 mb-2">
                  {diferencaDoEsperado > 0
                    ? `O total digitado está ${formatarMoeda(diferencaDoEsperado)} acima do preço à vista (normal se tiver parte parcelada).`
                    : `O total digitado está ${formatarMoeda(Math.abs(diferencaDoEsperado))} abaixo do preço à vista — confira se não esqueceu de somar alguma parte.`}
                </p>
              )}

              {(carrinho.some((i) => i.tipoEntrega === "encomenda" || i.quantidadeEntrega > 0 || i.retirada)) && (
                <label className="block mt-3">
                  <span className="text-xs text-madeira-600 mb-1 block">
                    Prazo máximo de entrega
                    {precisaPrazoObrigatorio() ? " *" : " (deixe hoje se o cliente já vai levar agora)"}
                  </span>
                  <input
                    className="input-base"
                    type="date"
                    value={prazoEntregaMaximo}
                    onChange={(e) => setPrazoEntregaMaximo(e.target.value)}
                  />
                </label>
              )}
            </div>

            <div className="card p-5">
              <p className="font-display text-lg mb-4">Totais</p>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-madeira-600">Valor a prazo</span>
                  <span>{formatarMoeda(subtotalCarrinho)}</span>
                </div>
                <div className="flex justify-between text-green-700">
                  <span>Desconto à vista</span>
                  <span>
                    {subtotalCarrinho - subtotalAVista > 0
                      ? `− ${formatarMoeda(subtotalCarrinho - subtotalAVista)}`
                      : formatarMoeda(0)}
                  </span>
                </div>
                <div className="flex justify-between pb-2 border-b border-estofado-100">
                  <span className="text-madeira-600">Valor à vista</span>
                  <span className="font-semibold">{formatarMoeda(subtotalAVista)}</span>
                </div>
                {acrescimo > 0 && (
                  <div className="flex justify-between">
                    <span className="text-madeira-600">Acréscimo (parte parcelada)</span>
                    <span>+ {formatarMoeda(acrescimo)}</span>
                  </div>
                )}
                <div className="flex justify-between font-display text-lg pt-2 border-t border-estofado-100">
                  <span>Total a pagar</span>
                  <span>{formatarMoeda(total)}</span>
                </div>
              </div>

              {pagamentos.length > 1 && (
                <div className="mt-4 pt-4 border-t border-estofado-100 space-y-1">
                  <p className="text-xs font-semibold text-madeira-600 mb-1">Como fica dividido</p>
                  {pagamentos.map((p, idx) => (
                    <div key={idx} className="flex justify-between text-sm">
                      <span className="text-madeira-600">
                        {p.forma || "—"}
                        {p.forma === "Crédito" && p.parcelas > 1 ? ` ${p.parcelas}x` : ""}
                      </span>
                      <span>{formatarMoeda(p.valor)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          <p className="text-sm font-semibold text-madeira-700 mb-2">Itens da compra</p>
          <div className="card overflow-hidden mb-6">
            <table className="w-full text-sm">
              <thead className="bg-madeira-50 text-left">
                <tr>
                  <th className="px-4 py-2">Produto</th>
                  <th className="px-4 py-2">Qtd.</th>
                  <th className="px-4 py-2 text-right">Valor un.</th>
                  <th className="px-4 py-2 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {carrinho.map((item, idx) => (
                  <tr key={idx} className="border-t border-estofado-100">
                    <td className="px-4 py-2">
                      {item.nome}
                      {item.tipoEntrega === "encomenda" && (
                        <span className="tag-encomenda ml-1">ENCOMENDA</span>
                      )}
                      {item.cor && <span className="block text-xs text-madeira-500">{item.cor}</span>}
                      {item.observacao && (
                        <span className="block text-xs text-madeira-700">
                          Obs: <strong>{item.observacao}</strong>
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2">{item.quantidade}</td>
                    <td className="px-4 py-2 text-right">{formatarMoeda(item.valorUnitario)}</td>
                    <td className="px-4 py-2 text-right">
                      {formatarMoeda(item.valorUnitario * item.quantidade)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex gap-3">
            <button className="btn-secundario" onClick={() => setPasso(2)}>
              Voltar
            </button>
            <button
              className="btn-perigo"
              onClick={() => {
                if (confirm("Cancelar essa venda? Os produtos do carrinho serão perdidos.")) {
                  novaVenda();
                }
              }}
            >
              ✕ Cancelar
            </button>
            <button className="btn-primario" disabled={salvando} onClick={finalizarVenda}>
              {salvando ? "Salvando..." : "✓ Finalizar"}
            </button>
          </div>
        </div>
      )}

      {/* PASSO 4: CONCLUÍDA */}
      {passo === 4 && vendaConcluida && (
        <div className="card p-6 max-w-lg">
          <p className="font-display text-lg mb-1">✅ Venda concluída</p>
          <p className="text-sm text-madeira-500 mb-4">Pedido #{vendaConcluida.numeroPedido}</p>
          <div className="bg-madeira-50 rounded p-4 mb-4">
            <p className="text-xs text-madeira-500">Cliente</p>
            <p className="font-display">{nome}</p>
          </div>
          <p className="font-display text-2xl mb-6">{formatarMoeda(vendaConcluida.total)}</p>
          <div className="flex gap-3">
            <button className="btn-secundario" onClick={() => window.print()}>
              🖨 Imprimir comprovante
            </button>
            <button className="btn-primario" onClick={novaVenda}>
              Nova venda
            </button>
          </div>
        </div>
      )}

      {/* Área de impressão (via da loja + via do cliente) */}
      <div id="area-impressao">
        {vendaConcluida && (
          <ComprovanteImpressao
            numeroPedido={vendaConcluida.numeroPedido}
            cliente={{
              nome,
              cpf,
              telefone: celulares.filter((c) => c.numero.trim())[0]?.numero || null,
              endereco,
              numero: semNumero ? "S/N" : numero,
              complemento,
              cidade,
            }}
            loja={lojaInfo}
            total={vendaConcluida.total}
            formaPagamento={vendaConcluida.forma}
            pagamentos={vendaConcluida.pagamentos.map((p) => ({
              forma: p.forma || "—",
              parcelas: p.parcelas,
              valorAPagar: p.valor,
            }))}
            prazoEntregaMaximo={prazoEntregaMaximo || null}
            itens={carrinho.map((item, idx) => ({
              id: String(idx),
              venda_id: "",
              produto_id: item.produtoId,
              nome_produto: item.nome,
              variante: item.cor,
              quantidade: item.quantidade,
              valor_unitario: item.valorUnitario,
              total: item.valorUnitario * item.quantidade,
              tipo_entrega: item.tipoEntrega,
              status_entrega: item.tipoEntrega === "encomenda" ? "encomenda" : null,
              retirada: item.retirada,
              quantidade_retirada: item.quantidadeRetirada,
              quantidade_entrega: item.quantidadeEntrega,
              data_entregue: null,
              trocado: false,
              observacao: item.observacao,
            }))}
          />
        )}
      </div>
    </div>
  );
}
