import { Command } from "@tauri-apps/plugin-shell";
import { open, save } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { getCurrentWebview } from "@tauri-apps/api/webview";

const pdfInput = document.getElementById("pdf-entrada");
const saidaInput = document.getElementById("saida");
const tituloInput = document.getElementById("titulo");
const autorInput = document.getElementById("autor");
const langInput = document.getElementById("lang");
const logEl = document.getElementById("log");
const logDetalhesEl = document.getElementById("log-detalhes");
const sucessoEl = document.getElementById("sucesso");
const avisoEl = document.getElementById("aviso");
const btnConverter = document.getElementById("btn-converter");
const btnCancelar = document.getElementById("btn-cancelar");
const progressoEl = document.getElementById("progresso");
const statusAtualizacaoEl = document.getElementById("status-atualizacao");

// true enquanto um pedido de cancelamento está em voo, só para o handler de
// "close" do processo escolher a mensagem certa (cancelado vs. concluído vs.
// erro) — o processo sempre acaba emitindo "close" (código != 0, matado por
// SIGTERM/SIGKILL), não existe um evento distinto de "cancelado" vindo do
// sidecar em si.
let cancelamentoSolicitado = false;

// true durante uma conversão em andamento — usado pra decidir se uma
// atualização detectada pode ser instalada na hora (relaunch() mataria o
// sidecar sem o encerramento gracioso da Fase 4.7) ou se precisa esperar
// o handler de "close" da conversão atual.
let conversaoEmAndamento = false;

// Atualização já detectada e pronta pra instalar, mas adiada porque
// havia uma conversão em andamento no momento da checagem — aplicada
// pelo handler de "close" assim que a conversão em curso termina.
let atualizacaoPendente = null;

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

// Mensagem curta e amigável perto do botão "Verificar atualizações" — só
// usada na checagem manual (clique do usuário). A checagem automática ao
// abrir o app permanece silenciosa quando não há nada de novo ou quando a
// checagem falha, para não incomodar o usuário toda vez que o app abre;
// só fica visível de verdade quando uma atualização é encontrada (nesse
// caso o próprio fluxo de download já loga no painel).
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
    // Cobre tanto falha de rede quanto a situação atual (nenhum Release
    // publicado ainda, endpoint responde 404) — o erro técnico bruto vai
    // só para o log detalhado (depuração), nunca para a mensagem visível.
    log(`Falha ao verificar atualizações: ${erro}`);
    if (manual) mostrarStatusAtualizacao("Não foi possível verificar atualizações agora.");
  }
}

// Ordem fixa das fases reais do pipeline (ver foliant.py: primeira_passada
// -> construir_html -> convert_to_ebook). "html" não tem contador granular
// (montagem é quase instantânea mesmo em livros de centenas de páginas,
// medido em produção — ver ARCHITECTURE.md Fase 4.6), por isso fica
// indeterminada (spinner) em vez de 0-100%.
const ORDEM_FASES = ["ocr", "html", "epub"];
const NOMES_FASE = { ocr: "OCR + análise", html: "Montagem do HTML", epub: "Compilação EPUB" };

function resetarProgresso() {
  progressoEl.hidden = true;
  for (const fase of ORDEM_FASES) {
    const el = progressoEl.querySelector(`[data-fase="${fase}"]`);
    el.classList.remove("ativa", "concluida", "indeterminada");
    el.querySelector(".barra-preenchimento").style.width = "0%";
    el.querySelector(".fase-contador").textContent = "";
  }
}

function atualizarProgresso(fase, atual, total) {
  progressoEl.hidden = false;
  const indiceAtual = ORDEM_FASES.indexOf(fase);
  if (indiceAtual === -1) return;

  for (let i = 0; i < ORDEM_FASES.length; i++) {
    const el = progressoEl.querySelector(`[data-fase="${ORDEM_FASES[i]}"]`);
    if (i < indiceAtual) {
      el.classList.remove("ativa", "indeterminada");
      el.classList.add("concluida");
      el.querySelector(".barra-preenchimento").style.width = "100%";
      // Fases sem contador granular (ex.: "html") só têm sua conclusão
      // detectada aqui, quando a fase seguinte começa — nunca emitem um
      // evento próprio de término, então o texto precisa ser fixado agora.
      // Fases com contador (ex.: "210/210") já mostram seu texto final
      // sozinhas e não devem ser sobrescritas.
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
}

function processarLinha(linha) {
  if (linha.startsWith("PROGRESS:")) {
    try {
      const dados = JSON.parse(linha.slice("PROGRESS:".length));
      atualizarProgresso(dados.fase, dados.atual, dados.total);
    } catch (erro) {
      // linha estruturada malformada não deve derrubar a UI — cai para o
      // log bruto como qualquer outra linha não reconhecida.
      log(linha);
    }
    return;
  }
  log(linha);
}

function definirPdfSelecionado(caminho) {
  pdfInput.value = caminho;
  if (!saidaInput.value) {
    saidaInput.value = caminho.replace(/\.pdf$/i, ".epub");
  }
}

document.getElementById("btn-selecionar-pdf").addEventListener("click", async () => {
  const escolhido = await open({
    multiple: false,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (escolhido) definirPdfSelecionado(escolhido);
});

document.getElementById("btn-selecionar-saida").addEventListener("click", async () => {
  const escolhido = await save({
    filters: [{ name: "EPUB", extensions: ["epub"] }],
    defaultPath: saidaInput.value || "saida.epub",
  });
  if (escolhido) saidaInput.value = escolhido;
});

function log(linha) {
  logEl.textContent += linha + "\n";
  logEl.scrollTop = logEl.scrollHeight;
}

let avisoTimeoutId = null;

// Aviso visível na interface principal (não só no log, que fica
// colapsado por padrão) — usado para rejeições que o usuário precisa
// ver na hora, sem precisar expandir "Ver log detalhado".
function mostrarAviso(texto) {
  clearTimeout(avisoTimeoutId);
  avisoEl.textContent = texto;
  avisoEl.hidden = false;
  avisoTimeoutId = setTimeout(() => {
    avisoEl.hidden = true;
  }, 5000);
}

document.getElementById("form-conversao").addEventListener("submit", async (evento) => {
  evento.preventDefault();
  if (!pdfInput.value || !saidaInput.value) {
    log("Selecione o PDF de entrada e o destino do EPUB antes de converter.");
    return;
  }

  const args = [
    pdfInput.value,
    saidaInput.value,
    "--lang",
    langInput.value || "por",
    "--autor",
    autorInput.value || "Desconhecido",
    "--titulo",
    tituloInput.value || "",
  ];

  btnConverter.disabled = true;
  btnCancelar.hidden = false;
  cancelamentoSolicitado = false;
  conversaoEmAndamento = true;
  logEl.textContent = "";
  logDetalhesEl.open = true;
  sucessoEl.hidden = true;
  avisoEl.hidden = true;
  resetarProgresso();
  log(`Iniciando conversão: ${pdfInput.value}`);

  try {
    const command = Command.sidecar("binaries/foliant-core", args);
    command.stdout.on("data", (linha) => processarLinha(linha));
    command.stderr.on("data", (linha) => log(linha));
    command.on("close", async (dados) => {
      if (cancelamentoSolicitado) {
        log("Cancelado pelo usuário.");
      } else if (dados.code === 0) {
        log("Processo concluído com sucesso.");
        // Caminho feliz: recolhe o log (continua acessível via "Ver log
        // detalhado") e mostra um aviso simples com o destino do arquivo —
        // o log bruto é ruído para o uso comum, mas é informação primária
        // em caso de erro, por isso só recolhe aqui, nunca no ramo de erro.
        logDetalhesEl.open = false;
        sucessoEl.textContent = "";
        const titulo = document.createElement("strong");
        titulo.textContent = "EPUB gerado com sucesso";
        const caminho = document.createElement("span");
        caminho.textContent = "Salvo em: ";
        const codigo = document.createElement("code");
        codigo.textContent = saidaInput.value;
        caminho.appendChild(codigo);

        const acoes = document.createElement("div");
        acoes.className = "acoes-sucesso";
        const caminhoDoArquivo = saidaInput.value;
        // O caminho é registrado no lado Rust (não confiado de volta pela
        // JS ao clicar) para que "Abrir EPUB" só possa abrir exatamente o
        // arquivo que o próprio backend gerou — ver EpubGerado em lib.rs.
        await invoke("registrar_epub_gerado", { caminho: caminhoDoArquivo });

        const btnAbrir = document.createElement("button");
        btnAbrir.type = "button";
        btnAbrir.textContent = "Abrir EPUB";
        btnAbrir.addEventListener("click", async () => {
          try {
            await invoke("abrir_epub_gerado");
          } catch (erro) {
            log(`Não foi possível abrir o EPUB: ${erro}`);
          }
        });

        const btnPasta = document.createElement("button");
        btnPasta.type = "button";
        btnPasta.textContent = "Ver na Pasta";
        btnPasta.addEventListener("click", async () => {
          try {
            await revealItemInDir(caminhoDoArquivo);
          } catch (erro) {
            log(`Não foi possível abrir a pasta: ${erro}`);
          }
        });

        acoes.append(btnAbrir, btnPasta);
        sucessoEl.append(titulo, caminho, acoes);
        sucessoEl.hidden = false;
      } else {
        log(`Processo finalizado com erro (código ${dados.code}).`);
      }
      await invoke("limpar_pid_sidecar");
      btnConverter.disabled = false;
      btnCancelar.hidden = true;
      conversaoEmAndamento = false;
      if (atualizacaoPendente) {
        const atualizacao = atualizacaoPendente;
        atualizacaoPendente = null;
        await aplicarAtualizacao(atualizacao);
      }
    });
    command.on("error", (erro) => {
      log(`Erro ao executar: ${erro}`);
      btnConverter.disabled = false;
      btnCancelar.hidden = true;
      conversaoEmAndamento = false;
    });
    const child = await command.spawn();
    // Registrado no lado Rust para que fechar a janela ou clicar em
    // "Cancelar" consiga matar o sidecar e seus processos filhos
    // (tesseract, ebook-convert) — Command.sidecar(...).kill() do plugin
    // shell só mata este pid (o stub do bootloader PyInstaller), não a
    // árvore inteira. Ver ARCHITECTURE.md.
    await invoke("registrar_pid_sidecar", { pid: child.pid });
  } catch (erro) {
    log(`Falha ao iniciar: ${erro}`);
    btnConverter.disabled = false;
    btnCancelar.hidden = true;
    conversaoEmAndamento = false;
  }
});

btnCancelar.addEventListener("click", async () => {
  cancelamentoSolicitado = true;
  btnCancelar.disabled = true;
  log("Cancelando…");
  const havia = await invoke("cancelar_conversao");
  btnCancelar.disabled = false;
  if (!havia) {
    log("Nada para cancelar (nenhuma conversão em andamento).");
  }
});

document.getElementById("btn-verificar-atualizacao").addEventListener("click", () => {
  verificarAtualizacao(true);
});

// Checagem automática e silenciosa ao abrir o app — sem diálogo de
// confirmação antes de baixar/instalar (padrão recomendado pela doc do
// plugin: atualizar o próprio app não é uma ação destrutiva de dados do
// usuário, diferente das ações de conversão, que continuam 100%
// explícitas). Se houver uma conversão em andamento no momento em que o
// usuário clicar em "Verificar atualizações" logo ao abrir, o guard em
// verificarAtualizacao() adia a instalação.
verificarAtualizacao();

// Drag-and-drop em qualquer lugar da janela — o Tauri intercepta o drop
// no nível do webview (dragDropEnabled é true por padrão), então usa a
// API própria (getCurrentWebview().onDragDropEvent) em vez dos eventos
// HTML5 padrão de drag/drop, que não disparam com essa opção ativa.
getCurrentWebview().onDragDropEvent((evento) => {
  if (evento.payload.type === "over") {
    document.body.classList.add("arrastando-arquivo");
    return;
  }
  document.body.classList.remove("arrastando-arquivo");
  if (evento.payload.type !== "drop") return;

  const caminho = evento.payload.paths[0];
  if (!caminho || !caminho.toLowerCase().endsWith(".pdf")) {
    mostrarAviso("Apenas arquivos PDF são aceitos.");
    log(`Arquivo solto não é um PDF, ignorado: ${caminho ?? "(nenhum caminho)"}`);
    return;
  }
  definirPdfSelecionado(caminho);
});
