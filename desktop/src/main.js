import { Command } from "@tauri-apps/plugin-shell";
import { open, save } from "@tauri-apps/plugin-dialog";

const pdfInput = document.getElementById("pdf-entrada");
const saidaInput = document.getElementById("saida");
const tituloInput = document.getElementById("titulo");
const autorInput = document.getElementById("autor");
const langInput = document.getElementById("lang");
const logEl = document.getElementById("log");
const btnConverter = document.getElementById("btn-converter");

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
  log(`Iniciando conversão: ${pdfInput.value}`);

  try {
    const command = Command.sidecar("binaries/foliant-core", args);
    command.stdout.on("data", (linha) => log(linha));
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
