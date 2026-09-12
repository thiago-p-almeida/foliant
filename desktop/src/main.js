import { Command } from "@tauri-apps/plugin-shell";
import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { getCurrentWebview } from "@tauri-apps/api/webview";
import { getVersion } from "@tauri-apps/api/app";
import { documentDir, join } from "@tauri-apps/api/path";
import { criarIcone } from "./icons.js";

// Chrome persistente (fora de #tela, nunca substituído por
// transicionarPara — ver index.html): selo "100% local" e o menu
// "Sobre" ficam fixos em toda tela, por isso seus elementos podem
// continuar como consts de module scope com segurança.
const telaEl = document.getElementById("tela");
const versaoAppEl = document.getElementById("versao-app");
const statusAtualizacaoEl = document.getElementById("status-atualizacao");

// Título da janela por estado (melhoria opcional via document.title,
// não bloqueante — Tauri desenha o semáforo nativo, isto é só o texto).
const TITULOS_ESTADO = {
  selecionar: "Foliant",
  antes_de_converter: "Foliant",
  convertendo: "Foliant — convertendo",
  pronto: "Foliant — pronto",
  com_ressalva: "Foliant — pronto",
  falha: "Foliant — falha",
};

// Dados da conversão em curso — o único estado que sobrevive às trocas
// de tela. Resetado por completo só em irParaSelecionar(). `inspecao`
// guarda o resultado de --inspect para ser reaproveitado sem nova
// chamada ao sidecar quando o usuário cancela ou tenta de novo (mesmo
// arquivo, dados não mudam).
const sessao = {
  arquivo: null,
  inspecao: null,
  saida: null,
  titulo: "",
  autor: "",
  lang: "por",
};

let estadoAtual = null;

// Incrementado a cada nova inspeção (--inspect) ou conversão iniciada.
// Todo callback assíncrono do sidecar (stdout/close/error) captura o
// valor no início da operação e o compara contra este antes de tocar em
// DOM/sessao — cobre tanto uma inspeção superada por uma seleção mais
// recente quanto um "close" tardio do processo chegando depois que a
// tela já mudou (ex.: cancelar navega para antes_de_converter antes do
// SIGKILL do processo realmente surtir efeito).
let idInvocacaoAtual = 0;

/**
 * Troca de tela: remove por completo o conteúdo do estado anterior
 * (não é hidden/CSS) e injeta o <template> do novo estado dentro de
 * #tela. Todo o app deve navegar por aqui — nunca chamar os
 * renderizadores diretamente de um handler de evento.
 */
function transicionarPara(nome, opts) {
  const template = document.getElementById(`tpl-${nome}`);
  telaEl.replaceChildren(template.content.cloneNode(true));
  estadoAtual = nome;
  document.title = TITULOS_ESTADO[nome] || "Foliant";
  RENDERIZADORES[nome]?.(opts);
}

function nomeDoArquivo(caminho) {
  return caminho ? caminho.split(/[/\\]/).pop() : "";
}

// Trunca a STRING antes de renderizar (não via CSS/line-clamp): nomes de
// arquivo longos sem espaços cortariam de forma feia no meio da palavra
// se o corte dependesse só de quebra de linha do navegador.
function truncarCaminhoParaExibicao(caminho, max = 70) {
  if (caminho.length <= max) return caminho;
  return caminho.slice(0, max - 1) + "…";
}

async function calcularSaidaPadrao(caminhoPdf) {
  const nomeBase = nomeDoArquivo(caminhoPdf).replace(/\.pdf$/i, ".epub");
  const pasta = await documentDir();
  return join(pasta, nomeBase);
}

// Log acumulado da tentativa de conversão atual — sobrevive à troca de
// tela (convertendo -> pronto/falha) porque cada um desses templates
// tem seu próprio <pre id="log">, repopulado a partir daqui.
let logAtual = "";

function log(linha) {
  logAtual += linha + "\n";
  const logEl = telaEl.querySelector("#log");
  if (logEl) {
    logEl.textContent = logAtual;
    logEl.scrollTop = logEl.scrollHeight;
  }
}

function popularLogTemplate() {
  const logEl = telaEl.querySelector("#log");
  if (logEl) {
    logEl.textContent = logAtual;
    logEl.scrollTop = logEl.scrollHeight;
  }
}

// ---------------------------------------------------------------------
// Estado 1 — selecionar
// ---------------------------------------------------------------------

let avisoArquivoTimeoutId = null;

// Só tem efeito se a tela atual ainda for "selecionar" — usado tanto
// pelo drop de um arquivo inválido quanto por um erro de --inspect que
// devolve o usuário para cá.
function mostrarAvisoArquivo(texto) {
  if (estadoAtual !== "selecionar") return;
  const el = telaEl.querySelector("#aviso-arquivo");
  const textoEl = telaEl.querySelector("#aviso-arquivo-texto");
  if (!el || !textoEl) return;
  clearTimeout(avisoArquivoTimeoutId);
  textoEl.textContent = texto;
  el.hidden = false;
  avisoArquivoTimeoutId = setTimeout(() => {
    el.hidden = true;
  }, 5000);
}

function renderizarSelecionar() {
  telaEl.querySelector("#btn-selecionar-pdf").addEventListener("click", async () => {
    const escolhido = await open({
      multiple: false,
      filters: [{ name: "PDF", extensions: ["pdf"] }],
    });
    if (escolhido) selecionarArquivo(escolhido);
  });
}

function irParaSelecionar() {
  sessao.arquivo = null;
  sessao.inspecao = null;
  sessao.saida = null;
  sessao.titulo = "";
  sessao.autor = "";
  sessao.lang = "por";
  logAtual = "";
  idInvocacaoAtual++; // invalida qualquer inspeção/conversão em voo
  transicionarPara("selecionar");
}

function selecionarArquivo(caminho) {
  sessao.arquivo = caminho;
  sessao.inspecao = null;
  sessao.saida = null;
  sessao.titulo = "";
  sessao.autor = "";
  transicionarPara("antes_de_converter");
  iniciarInspecao(caminho);
}

// ---------------------------------------------------------------------
// Estado 2 — antes_de_converter
// ---------------------------------------------------------------------

function mensagemErroInspecao(dados) {
  if (dados.erro === "criptografado") {
    return "Este PDF está protegido por senha. Remova a proteção antes de converter.";
  }
  if (dados.erro === "sem_paginas") {
    return "Este PDF não tem páginas.";
  }
  return "Não foi possível ler este PDF. Verifique se o arquivo não está corrompido.";
}

async function iniciarInspecao(caminho) {
  const meuId = ++idInvocacaoAtual;
  try {
    const command = Command.sidecar("binaries/foliant-core-inspect", [caminho, "--inspect"]);
    let saidaBruta = "";
    command.stdout.on("data", (linha) => {
      saidaBruta += linha + "\n";
    });
    command.on("close", () => {
      if (meuId !== idInvocacaoAtual) return;
      const linhas = saidaBruta.split("\n");
      const linhaInspecao = linhas.find((l) => l.startsWith("INSPECAO:"));
      const linhaErro = linhas.find((l) => l.startsWith("INSPECAO_ERRO:"));
      if (linhaInspecao) {
        const dados = JSON.parse(linhaInspecao.slice("INSPECAO:".length));
        sessao.inspecao = dados;
        if (estadoAtual === "antes_de_converter") popularInspecaoNaTela(dados);
      } else {
        const motivo = linhaErro ? JSON.parse(linhaErro.slice("INSPECAO_ERRO:".length)) : null;
        irParaSelecionar();
        mostrarAvisoArquivo(motivo ? mensagemErroInspecao(motivo) : "Não foi possível ler este PDF.");
      }
    });
    command.on("error", () => {
      if (meuId !== idInvocacaoAtual) return;
      irParaSelecionar();
      mostrarAvisoArquivo("Não foi possível analisar o arquivo selecionado.");
    });
    await command.spawn();
  } catch {
    if (meuId !== idInvocacaoAtual) return;
    irParaSelecionar();
    mostrarAvisoArquivo("Não foi possível analisar o arquivo selecionado.");
  }
}

function popularInspecaoNaTela(dados) {
  const metaEl = telaEl.querySelector("#ac-meta");
  if (!metaEl) return; // tela já mudou

  const tagNativasEl = telaEl.querySelector("#ac-tag-nativas");
  const tagEscaneadasEl = telaEl.querySelector("#ac-tag-escaneadas");
  const explicacao1El = telaEl.querySelector("#ac-explicacao-1");
  const explicacao2El = telaEl.querySelector("#ac-explicacao-2");
  const tituloInput = telaEl.querySelector("#ac-titulo");
  const autorInput = telaEl.querySelector("#ac-autor");

  const tamanhoMb = (dados.tamanho_bytes / (1024 * 1024)).toFixed(1);
  metaEl.textContent = `${dados.paginas} página${dados.paginas === 1 ? "" : "s"} · ${tamanhoMb} MB`;

  if (dados.nativas > 0) {
    tagNativasEl.textContent = `${dados.nativas} página${dados.nativas === 1 ? "" : "s"} com texto`;
    tagNativasEl.hidden = false;
  }
  if (dados.escaneadas > 0) {
    tagEscaneadasEl.textContent = `${dados.escaneadas} página${dados.escaneadas === 1 ? "" : "s"} escaneada${dados.escaneadas === 1 ? "" : "s"}`;
    tagEscaneadasEl.hidden = false;
  }

  explicacao1El.textContent =
    `${dados.nativas} páginas já têm texto de verdade. As outras ${dados.escaneadas} são imagem ` +
    "escaneada — o Foliant vai reconhecer o texto delas letra por letra.";
  explicacao2El.textContent =
    "Dependendo do tamanho do arquivo, pode demorar. Mas no fim, o arquivo fica leve, com fonte ajustável e busca por palavra.";

  // Só pré-preenche se o usuário ainda não editou nada nesta sessão
  // (ex.: reentrando depois de "Tentar de novo", os campos já podem ter
  // sido customizados antes do erro).
  if (!sessao.titulo) {
    tituloInput.value = dados.titulo;
    sessao.titulo = dados.titulo;
  }
  if (!sessao.autor) {
    autorInput.value = dados.autor;
    sessao.autor = dados.autor;
  }
}

function renderizarAntesDeConverter(opts = {}) {
  const nomeEl = telaEl.querySelector("#ac-nome");
  const metaEl = telaEl.querySelector("#ac-meta");
  const salvoEmEl = telaEl.querySelector("#ac-salvo-em");
  const tituloInput = telaEl.querySelector("#ac-titulo");
  const autorInput = telaEl.querySelector("#ac-autor");
  const langInput = telaEl.querySelector("#ac-lang");
  const avisoCanceladoEl = telaEl.querySelector("#ac-aviso-cancelado");

  nomeEl.textContent = nomeDoArquivo(sessao.arquivo);
  langInput.value = sessao.lang || "por";
  tituloInput.value = sessao.titulo || "";
  autorInput.value = sessao.autor || "";

  const segmentadoIdiomaEl = telaEl.querySelector("#segmentado-idioma");
  const botoesIdioma = segmentadoIdiomaEl.querySelectorAll(".segmentado-idioma-item");
  botoesIdioma.forEach((botao) => {
    botao.classList.toggle("ativo", botao.dataset.lang === langInput.value);
    botao.addEventListener("click", () => {
      langInput.value = botao.dataset.lang;
      botoesIdioma.forEach((b) => b.classList.toggle("ativo", b === botao));
    });
  });

  if (sessao.inspecao) {
    popularInspecaoNaTela(sessao.inspecao);
  } else {
    metaEl.textContent = "Analisando arquivo…";
  }

  if (sessao.saida) {
    salvoEmEl.textContent = truncarCaminhoParaExibicao(sessao.saida);
    salvoEmEl.title = sessao.saida;
  } else {
    salvoEmEl.textContent = "calculando…";
    calcularSaidaPadrao(sessao.arquivo).then((caminho) => {
      if (!sessao.saida) sessao.saida = caminho;
      if (estadoAtual === "antes_de_converter") {
        const el = telaEl.querySelector("#ac-salvo-em");
        if (el) {
          el.textContent = truncarCaminhoParaExibicao(sessao.saida);
          el.title = sessao.saida;
        }
      }
    });
  }

  if (opts.avisoCancelamento) {
    avisoCanceladoEl.hidden = false;
    setTimeout(() => {
      if (estadoAtual === "antes_de_converter") avisoCanceladoEl.hidden = true;
    }, 5000);
  }

  telaEl.querySelector("#btn-trocar-arquivo").addEventListener("click", () => irParaSelecionar());

  telaEl.querySelector("#btn-alterar-saida").addEventListener("click", async () => {
    const escolhido = await save({
      filters: [{ name: "EPUB", extensions: ["epub"] }],
      defaultPath: sessao.saida || undefined,
    });
    if (escolhido) {
      sessao.saida = escolhido;
      const el = telaEl.querySelector("#ac-salvo-em");
      if (el) {
        el.textContent = truncarCaminhoParaExibicao(escolhido);
        el.title = escolhido;
      }
    }
  });

  telaEl.querySelector("#form-conversao").addEventListener("submit", (evento) => {
    evento.preventDefault();
    sessao.titulo = tituloInput.value;
    sessao.autor = autorInput.value;
    sessao.lang = langInput.value || "por";
    transicionarPara("convertendo");
  });
}

function irParaAntesDeConverter(opts) {
  transicionarPara("antes_de_converter", opts);
}

// ---------------------------------------------------------------------
// Estado 3 — convertendo
// ---------------------------------------------------------------------

const ORDEM_FASES = ["ocr", "html", "epub"];

// true enquanto um pedido de cancelamento está em voo, só para o
// handler de "close" do processo escolher a mensagem certa.
let cancelamentoSolicitado = false;

// true durante uma conversão em andamento — decide se uma atualização
// detectada pode ser instalada na hora ou se precisa esperar o "close"
// da conversão atual (ver aplicarAtualizacao/verificarAtualizacao).
let conversaoEmAndamento = false;

// Atualização detectada mas adiada por haver uma conversão em curso —
// aplicada assim que essa conversão terminar.
let atualizacaoPendente = null;

function resetarProgresso() {
  const progressoEl = telaEl.querySelector("#progresso");
  if (!progressoEl) return;
  for (const fase of ORDEM_FASES) {
    const el = progressoEl.querySelector(`[data-fase="${fase}"]`);
    el.classList.remove("ativa", "concluida", "indeterminada");
    el.querySelector(".barra-preenchimento").style.width = "0%";
    el.querySelector(".fase-contador").textContent = "";
  }
}

function atualizarProgresso(fase, atual, total) {
  const progressoEl = telaEl.querySelector("#progresso");
  if (!progressoEl) return; // tela já mudou (ex.: já saiu de "convertendo")
  const indiceAtual = ORDEM_FASES.indexOf(fase);
  if (indiceAtual === -1) return;

  for (let i = 0; i < ORDEM_FASES.length; i++) {
    const el = progressoEl.querySelector(`[data-fase="${ORDEM_FASES[i]}"]`);
    if (i < indiceAtual) {
      el.classList.remove("ativa", "indeterminada");
      el.classList.add("concluida");
      el.querySelector(".barra-preenchimento").style.width = "100%";
      const contadorAnteriorEl = el.querySelector(".fase-contador");
      if (contadorAnteriorEl.textContent === "processando…") {
        contadorAnteriorEl.textContent = "concluído";
      }
    } else if (i === indiceAtual) {
      el.classList.remove("concluida");
      el.classList.add("ativa");
    }
  }

  const elAtual = progressoEl.querySelector(`[data-fase="${fase}"]`);
  const contadorEl = elAtual.querySelector(".fase-contador");
  const barraEl = elAtual.querySelector(".barra-preenchimento");

  if (total === 0) {
    elAtual.classList.add("indeterminada");
    contadorEl.textContent = "processando…";
  } else {
    elAtual.classList.remove("indeterminada");
    const pct = Math.round((atual / total) * 100);
    barraEl.style.width = `${pct}%`;
    contadorEl.textContent = fase === "epub" ? `${pct}%` : `${atual}/${total}`;
    if (atual >= total) {
      elAtual.classList.remove("ativa");
      elAtual.classList.add("concluida");
    }
  }

  const statusAoVivoEl = telaEl.querySelector("#status-ao-vivo");
  const statusAoVivoTextoEl = telaEl.querySelector("#status-ao-vivo-texto");
  if (fase === "ocr" && atual > 0) {
    statusAoVivoTextoEl.textContent = `Até agora: ${atual} de ${total} páginas processadas. Nenhuma falha até agora.`;
    statusAoVivoEl.hidden = false;
  } else if (fase !== "ocr") {
    statusAoVivoEl.hidden = true;
  }
}

function processarLinha(linha, estadoLinhas) {
  if (linha.startsWith("PROGRESS:")) {
    try {
      const dados = JSON.parse(linha.slice("PROGRESS:".length));
      atualizarProgresso(dados.fase, dados.atual, dados.total);
    } catch {
      log(linha);
    }
    return;
  }
  // RESSALVA:/FALHA: (ver foliant.py, construir_html/main) — mesmo padrão
  // estrutural de PROGRESS:/INSPECAO:. Guardadas em estadoLinhas (por
  // invocação, mesmo padrão de saidaBruta em iniciarInspecao) para o
  // handler de "close" decidir entre pronto/com_ressalva/falha(motivo).
  // Linha mal-formada não impede a conversão de seguir — só não teremos
  // o detalhe extra, cai no log bruto como qualquer linha não reconhecida.
  if (linha.startsWith("RESSALVA:")) {
    try {
      estadoLinhas.ressalva = JSON.parse(linha.slice("RESSALVA:".length));
    } catch {
      /* mal-formada: segue sem o detalhe, log bruto abaixo */
    }
    log(linha);
    return;
  }
  if (linha.startsWith("FALHA:")) {
    try {
      estadoLinhas.falha = JSON.parse(linha.slice("FALHA:".length));
    } catch {
      /* mal-formada: segue sem o detalhe, log bruto abaixo */
    }
    log(linha);
    return;
  }
  // ANALISE: (emitido pelo pipeline real, ver foliant.py) não tem mais
  // UI própria em "convertendo" — a contagem nativas/escaneadas já foi
  // mostrada em "antes de converter" via --inspect. Cai no log bruto
  // como qualquer outra linha não reconhecida.
  log(linha);
}

async function aoClicarCancelar() {
  const btn = telaEl.querySelector("#btn-cancelar");
  cancelamentoSolicitado = true;
  if (btn) btn.disabled = true;
  log("Cancelando…");
  const havia = await invoke("cancelar_conversao");
  if (btn) btn.disabled = false;
  if (!havia) log("Nada para cancelar (nenhuma conversão em andamento).");
}

async function finalizarConversaoComSucesso(ressalva) {
  await invoke("registrar_epub_gerado", { caminho: sessao.saida });
  const paginas = ressalva?.paginas_sem_texto;
  if (paginas && paginas.length > 0) {
    transicionarPara("com_ressalva", { paginasSemTexto: paginas });
  } else {
    transicionarPara("pronto");
  }
}

async function iniciarConversao() {
  const meuId = ++idInvocacaoAtual;
  const args = [
    sessao.arquivo,
    sessao.saida,
    "--lang",
    sessao.lang || "por",
    "--autor",
    sessao.autor || "Desconhecido",
    "--titulo",
    sessao.titulo || "",
  ];

  cancelamentoSolicitado = false;
  conversaoEmAndamento = true;
  log(`Iniciando conversão: ${sessao.arquivo}`);

  const estadoLinhas = {};

  try {
    const command = Command.sidecar("binaries/foliant-core", args);
    command.stdout.on("data", (linha) => {
      if (meuId === idInvocacaoAtual) processarLinha(linha, estadoLinhas);
    });
    command.stderr.on("data", (linha) => {
      if (meuId === idInvocacaoAtual) log(linha);
    });
    command.on("close", async (dados) => {
      conversaoEmAndamento = false;
      await invoke("limpar_pid_sidecar");
      if (meuId !== idInvocacaoAtual) return; // tela já mudou por outra via

      if (cancelamentoSolicitado) {
        log("Cancelado pelo usuário.");
        irParaAntesDeConverter({ avisoCancelamento: true });
      } else if (dados.code === 0) {
        log("Processo concluído com sucesso.");
        await finalizarConversaoComSucesso(estadoLinhas.ressalva);
      } else {
        log(`Processo finalizado com erro (código ${dados.code}).`);
        transicionarPara("falha", { motivo: estadoLinhas.falha?.motivo });
      }

      if (atualizacaoPendente) {
        const atualizacao = atualizacaoPendente;
        atualizacaoPendente = null;
        await aplicarAtualizacao(atualizacao);
      }
    });
    command.on("error", (erro) => {
      conversaoEmAndamento = false;
      if (meuId !== idInvocacaoAtual) return;
      log(`Erro ao executar: ${erro}`);
      transicionarPara("falha");
    });
    const child = await command.spawn();
    // Registrado no lado Rust para que fechar a janela ou clicar em
    // "Cancelar" consiga matar o sidecar e seus processos filhos
    // (tesseract, ebook-convert) — Command.sidecar(...).kill() do plugin
    // shell só mata este pid (o stub do bootloader PyInstaller), não a
    // árvore inteira. Ver ARCHITECTURE.md.
    await invoke("registrar_pid_sidecar", { pid: child.pid });
  } catch (erro) {
    conversaoEmAndamento = false;
    if (meuId !== idInvocacaoAtual) return;
    log(`Falha ao iniciar: ${erro}`);
    transicionarPara("falha");
  }
}

function renderizarConvertendo() {
  logAtual = "";
  telaEl.querySelector("#cv-nome-arquivo").textContent = nomeDoArquivo(sessao.arquivo);
  const logDetalhesEl = telaEl.querySelector("#log-detalhes");
  if (logDetalhesEl) logDetalhesEl.open = true;
  telaEl.querySelector("#btn-cancelar").addEventListener("click", aoClicarCancelar);
  resetarProgresso();
  iniciarConversao();
}

// ---------------------------------------------------------------------
// Estado 4 — pronto / Estado 5 — com_ressalva (dispositivo/log comuns)
// ---------------------------------------------------------------------

// Mesmos guias de transferência do handoff do design system
// (ScreensResult.jsx) — conteúdo estático, não depende de nenhum dado
// do backend.
const GUIAS_DISPOSITIVO = {
  "Tablet Android": [
    "Suba o .epub para o Google Drive ou OneDrive.",
    "No tablet, abra o app do Drive e baixe o arquivo.",
    "Toque no arquivo e escolha Moon+ Reader ou Xodo.",
  ],
  Kindle: [
    "Conecte o Kindle ao computador pelo cabo USB.",
    "Copie o .epub para a pasta Documents do aparelho.",
    "Desconecte: o livro aparece na sua biblioteca.",
  ],
  iPad: [
    "Envie o .epub para você mesmo pelo AirDrop ou e-mail.",
    "Toque no arquivo e escolha Copiar para Livros.",
    "O livro fica na estante do app Livros.",
  ],
};

function mostrarGuiaAparelho(dispositivo) {
  const guiaListaEl = telaEl.querySelector("#guia-aparelho-lista");
  const segmentadoEl = telaEl.querySelector("#segmentado-dispositivo");
  if (!guiaListaEl || !segmentadoEl) return;
  guiaListaEl.textContent = "";
  for (const passo of GUIAS_DISPOSITIVO[dispositivo]) {
    const li = document.createElement("li");
    li.textContent = passo;
    guiaListaEl.appendChild(li);
  }
  for (const botao of segmentadoEl.querySelectorAll(".segmentado-item")) {
    botao.classList.toggle("ativo", botao.dataset.dispositivo === dispositivo);
  }
}

function ligarSegmentadoDispositivo() {
  telaEl.querySelector("#segmentado-dispositivo").addEventListener("click", (evento) => {
    const botao = evento.target.closest(".segmentado-item");
    if (botao) mostrarGuiaAparelho(botao.dataset.dispositivo);
  });
  mostrarGuiaAparelho("Tablet Android");
}

function renderizarPronto() {
  const sucessoEl = telaEl.querySelector("#sucesso");
  sucessoEl.textContent = "";

  const conteudo = document.createElement("div");
  const titulo = document.createElement("strong");
  titulo.className = "callout-titulo";
  titulo.textContent = "Pronto. Seu livro está convertido.";
  const caminho = document.createElement("p");
  caminho.className = "callout-corpo";
  caminho.textContent = "Salvo em: ";
  const codigo = document.createElement("code");
  codigo.textContent = sessao.saida;
  caminho.appendChild(codigo);

  const acoes = document.createElement("div");
  acoes.className = "callout-acoes";
  const caminhoDoArquivo = sessao.saida;

  const btnAbrir = document.createElement("button");
  btnAbrir.type = "button";
  btnAbrir.className = "btn-sucesso";
  btnAbrir.append(criarIcone("book-open", "icone-sm"), document.createTextNode("Abrir EPUB"));
  btnAbrir.addEventListener("click", async () => {
    try {
      await invoke("abrir_epub_gerado");
    } catch (erro) {
      log(`Não foi possível abrir o EPUB: ${erro}`);
    }
  });

  const btnPasta = document.createElement("button");
  btnPasta.type = "button";
  btnPasta.className = "btn-secundario";
  btnPasta.append(criarIcone("folder-open", "icone-sm"), document.createTextNode("Ver na Pasta"));
  btnPasta.addEventListener("click", async () => {
    try {
      await revealItemInDir(caminhoDoArquivo);
    } catch (erro) {
      log(`Não foi possível abrir a pasta: ${erro}`);
    }
  });

  acoes.append(btnAbrir, btnPasta);
  conteudo.append(titulo, caminho, acoes);
  sucessoEl.append(criarIcone("circle-check", "icone"), conteudo);

  popularLogTemplate();
  ligarSegmentadoDispositivo();
  telaEl.querySelector("#btn-reiniciar").addEventListener("click", () => irParaSelecionar());
}

// Disparado quando construir_html (foliant.py) reporta, via RESSALVA:,
// que algumas páginas (não todas — 100% cai em "falha") não produziram
// texto útil. `dados.paginasSemTexto` é a lista de páginas na numeração
// física do PDF original (mesma de `id="pg-N"` no EPUB), não um rótulo de
// numeração impressa que o PDF possa declarar via /PageLabels — ver
// ARCHITECTURE.md para a evidência dessa distinção.
function renderizarComRessalva(dados = {}) {
  const paginas = dados.paginasSemTexto || [];
  const totalPaginas = sessao.inspecao?.paginas;
  const textoEl = telaEl.querySelector("#ressalva-texto");
  textoEl.textContent =
    `${paginas.length} de ${totalPaginas ?? "?"} páginas não puderam ser transcritas ` +
    "e foram marcadas no livro. Confira o PDF original nessas páginas.";

  const listaEl = telaEl.querySelector("#ressalva-lista-paginas");
  if (listaEl) {
    listaEl.textContent = `Páginas: ${paginas.join(", ")}`;
    listaEl.hidden = true;
  }
  telaEl.querySelector("#btn-ver-paginas-ressalva").addEventListener("click", () => {
    if (listaEl) listaEl.hidden = !listaEl.hidden;
  });

  popularLogTemplate();
  ligarSegmentadoDispositivo();
  telaEl.querySelector("#btn-reiniciar").addEventListener("click", () => irParaSelecionar());
}

// ---------------------------------------------------------------------
// Estado 6 — falha
// ---------------------------------------------------------------------

// `motivo === "sem_texto_legivel"` vem de FALHA: (ver foliant.py, main) —
// nenhuma página do PDF produziu conteúdo reconhecível. Mensagem
// específica nesse caso; qualquer outro código de saída != 0 mantém o
// texto genérico já validado (crash real, sidecar não encontrado, etc.).
function renderizarFalha(opts = {}) {
  const corpoEl = telaEl.querySelector("#erro .callout-corpo");
  if (corpoEl && opts.motivo === "sem_texto_legivel") {
    corpoEl.textContent =
      "Não há texto legível neste PDF para converter — nenhuma página produziu " +
      "conteúdo reconhecível. Verifique se o arquivo não está corrompido, " +
      "protegido, ou se é só imagem sem texto.";
  }
  const logDetalhesEl = telaEl.querySelector("#log-detalhes");
  if (logDetalhesEl) logDetalhesEl.open = true; // erro real sempre mostra o log expandido
  popularLogTemplate();
  telaEl.querySelector("#btn-tentar-novo").addEventListener("click", () => irParaAntesDeConverter());
}

const RENDERIZADORES = {
  selecionar: renderizarSelecionar,
  antes_de_converter: renderizarAntesDeConverter,
  convertendo: renderizarConvertendo,
  pronto: renderizarPronto,
  com_ressalva: renderizarComRessalva,
  falha: renderizarFalha,
};

// ---------------------------------------------------------------------
// Chrome persistente: versão, updater, drag-and-drop
// ---------------------------------------------------------------------

getVersion().then((versao) => {
  versaoAppEl.textContent = `v${versao}`;
});

async function aplicarAtualizacao(atualizacao) {
  log(`Atualização v${atualizacao.version} disponível — baixando…`);
  try {
    await atualizacao.downloadAndInstall((evento) => {
      if (evento.event === "Started") {
        log(`Download iniciado (${evento.data.contentLength ?? "tamanho desconhecido"} bytes).`);
      } else if (evento.event === "Finished") {
        log("Download concluído, instalando…");
      }
    });
    log("Atualização instalada. Reiniciando…");
    await relaunch();
  } catch (erro) {
    // Assinatura inválida, rede indisponível etc. — nunca falha
    // silenciosamente, e a versão atual continua rodando normalmente.
    log(`Falha ao aplicar atualização: ${erro}`);
  }
}

let statusAtualizacaoTimeoutId = null;

function mostrarStatusAtualizacao(texto) {
  clearTimeout(statusAtualizacaoTimeoutId);
  statusAtualizacaoEl.textContent = texto;
  statusAtualizacaoTimeoutId = setTimeout(() => {
    statusAtualizacaoEl.textContent = "";
  }, 5000);
}

async function verificarAtualizacao(manual = false) {
  try {
    const atualizacao = await check();
    if (!atualizacao) {
      if (manual) mostrarStatusAtualizacao("Você já está na versão mais recente.");
      return;
    }
    if (conversaoEmAndamento) {
      log(`Atualização v${atualizacao.version} disponível — será instalada ao final da conversão em andamento.`);
      atualizacaoPendente = atualizacao;
      return;
    }
    await aplicarAtualizacao(atualizacao);
  } catch (erro) {
    log(`Falha ao verificar atualizações: ${erro}`);
    if (manual) mostrarStatusAtualizacao("Não foi possível verificar atualizações agora.");
  }
}

document.getElementById("btn-verificar-atualizacao").addEventListener("click", () => {
  verificarAtualizacao(true);
});

// Checagem automática e silenciosa ao abrir o app — ver nota original
// preservada: atualizar o próprio app não é uma ação destrutiva de
// dados do usuário, diferente das ações de conversão.
verificarAtualizacao();

// Drag-and-drop em qualquer lugar da janela — module scope porque o
// Tauri intercepta o drop no nível do webview, independente de qual
// tela está montada em #tela no momento. Só tem efeito quando a tela
// atual é "selecionar": soltar um arquivo durante "convertendo", por
// exemplo, não deve colidir com a sessão em andamento.
getCurrentWebview().onDragDropEvent((evento) => {
  if (evento.payload.type === "over") {
    document.body.classList.add("arrastando-arquivo");
    if (estadoAtual === "selecionar") {
      const tituloEl = telaEl.querySelector("#dropzone-titulo");
      if (tituloEl) tituloEl.textContent = "Solte para começar";
    }
    return;
  }

  document.body.classList.remove("arrastando-arquivo");
  if (estadoAtual === "selecionar") {
    const tituloEl = telaEl.querySelector("#dropzone-titulo");
    if (tituloEl) tituloEl.textContent = "Arraste um PDF aqui";
  }

  if (evento.payload.type !== "drop") return;
  if (estadoAtual !== "selecionar") return;

  const caminho = evento.payload.paths[0];
  if (!caminho || !caminho.toLowerCase().endsWith(".pdf")) {
    mostrarAvisoArquivo("Apenas arquivos PDF são aceitos.");
    log(`Arquivo solto não é um PDF, ignorado: ${caminho ?? "(nenhum caminho)"}`);
    return;
  }
  selecionarArquivo(caminho);
});

transicionarPara("selecionar");
