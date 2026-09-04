import { Command } from "@tauri-apps/plugin-shell";
import { open, save } from "@tauri-apps/plugin-dialog";

const pdfInput = document.getElementById("pdf-entrada");
const saidaInput = document.getElementById("saida");
const tituloInput = document.getElementById("titulo");
const autorInput = document.getElementById("autor");
const langInput = document.getElementById("lang");
const logEl = document.getElementById("log");
const btnConverter = document.getElementById("btn-converter");
const progressoEl = document.getElementById("progresso");

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

document.getElementById("btn-selecionar-pdf").addEventListener("click", async () => {
  const escolhido = await open({
    multiple: false,
    filters: [{ name: "PDF", extensions: ["pdf"] }],
  });
  if (escolhido) {
    pdfInput.value = escolhido;
    if (!saidaInput.value) {
      saidaInput.value = escolhido.replace(/\.pdf$/i, ".epub");
    }
  }
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
  logEl.textContent = "";
  resetarProgresso();
  log(`Iniciando conversão: ${pdfInput.value}`);

  try {
    const command = Command.sidecar("binaries/foliant-core", args);
    command.stdout.on("data", (linha) => processarLinha(linha));
    command.stderr.on("data", (linha) => log(linha));
    command.on("close", (dados) => {
      log(`Processo finalizado (código ${dados.code}).`);
      btnConverter.disabled = false;
    });
    command.on("error", (erro) => {
      log(`Erro ao executar: ${erro}`);
      btnConverter.disabled = false;
    });
    await command.spawn();
  } catch (erro) {
    log(`Falha ao iniciar: ${erro}`);
    btnConverter.disabled = false;
  }
});
