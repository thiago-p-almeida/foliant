use std::path::PathBuf;
use std::process::Command as StdCommand;
use std::sync::Mutex;
use std::time::Duration;

use tauri::Manager;
use tauri_plugin_opener::OpenerExt;

/// PID do processo raiz do sidecar (o stub do bootloader PyInstaller
/// --onefile, ver ARCHITECTURE.md) atualmente em execução, se houver.
/// Rastreado para permitir matar a árvore de processos inteira (stub +
/// processo Python real + tesseract/ebook-convert filhos) tanto ao fechar
/// a janela quanto pelo botão "Cancelar" da UI.
struct SidecarPid(Mutex<Option<u32>>);

/// Caminho do último EPUB gerado com sucesso nesta sessão do app, se
/// houver. `opener:allow-open-path` exigiria um glob estático amplo o
/// bastante para cobrir qualquer pasta que o usuário escolha em "Salvar
/// EPUB em" (destino livre, não conhecido em tempo de build) — em vez
/// disso, o comando de "Abrir EPUB" da UI não recebe caminho nenhum da
/// JS; só abre exatamente o arquivo que o próprio backend acabou de
/// gerar e registrou aqui, verificado no lado Rust. Escopo mínimo real
/// (um único arquivo, o que o app mesmo produziu), não uma permissão de
/// sistema de arquivos ampla.
struct EpubGerado(Mutex<Option<PathBuf>>);

/// Lista pid/ppid de todos os processos do sistema via `ps`, em vez de
/// adicionar uma dependência nova (sysinfo/libc) só para isso — projeto é
/// macOS-only nesta fase e `ps`/`kill` já são usados para toda a validação
/// manual documentada em ARCHITECTURE.md, então essa é a mesma ferramenta,
/// só automatizada.
fn listar_pid_ppid() -> Vec<(u32, u32)> {
    let saida = match StdCommand::new("ps").args(["-axo", "pid=,ppid="]).output() {
        Ok(o) => o,
        Err(_) => return Vec::new(),
    };
    let texto = String::from_utf8_lossy(&saida.stdout);
    texto
        .lines()
        .filter_map(|linha| {
            let mut partes = linha.split_whitespace();
            let pid: u32 = partes.next()?.parse().ok()?;
            let ppid: u32 = partes.next()?.parse().ok()?;
            Some((pid, ppid))
        })
        .collect()
}

/// Retorna `raiz` + todos os seus descendentes (qualquer profundidade) —
/// cobre o caso real confirmado por teste manual: stub do PyInstaller ->
/// processo Python real -> tesseract/ebook-convert (3 níveis).
fn arvore_de_pids(raiz: u32) -> Vec<u32> {
    let todos = listar_pid_ppid();
    let mut resultado = vec![raiz];
    let mut fronteira = vec![raiz];
    while !fronteira.is_empty() {
        let mut proxima = Vec::new();
        for (pid, ppid) in &todos {
            if fronteira.contains(ppid) && !resultado.contains(pid) {
                resultado.push(*pid);
                proxima.push(*pid);
            }
        }
        fronteira = proxima;
    }
    resultado
}

fn matar_pid(pid: u32, sinal: &str) {
    let _ = StdCommand::new("kill").args([sinal, &pid.to_string()]).status();
}

/// Mata a árvore de processos inteira a partir de `raiz`: SIGTERM em todos
/// primeiro (dá chance ao foliant.py de limpar o TemporaryDirectory no
/// handler de SIGTERM, ver foliant.py:main), espera um pouco, e manda
/// SIGKILL em quem sobreviver (cobre o caso do stub do PyInstaller, que não
/// tem lógica própria de limpeza no handler de SIGTERM).
fn matar_arvore(raiz: u32) -> Vec<u32> {
    let pids = arvore_de_pids(raiz);
    for pid in &pids {
        matar_pid(*pid, "-TERM");
    }
    // 1.5s: testado com dado real (samples/001-080.pdf) que o handler de
    // SIGTERM do foliant.py (raise KeyboardInterrupt -> limpeza do
    // TemporaryDirectory) completa em ~600ms depois do sinal chegar — a
    // margem aqui é para não fazer SIGKILL no meio da limpeza graciosa em
    // páginas maiores/mais lentas, sem deixar o cancelamento lento demais
    // do ponto de vista do usuário.
    std::thread::sleep(Duration::from_millis(1500));
    let vivos: Vec<u32> = listar_pid_ppid().into_iter().map(|(pid, _)| pid).collect();
    for pid in &pids {
        if vivos.contains(pid) {
            matar_pid(*pid, "-KILL");
        }
    }
    pids
}

#[tauri::command]
fn registrar_pid_sidecar(pid: u32, state: tauri::State<SidecarPid>) {
    *state.0.lock().unwrap() = Some(pid);
}

#[tauri::command]
fn limpar_pid_sidecar(state: tauri::State<SidecarPid>) {
    *state.0.lock().unwrap() = None;
}

#[tauri::command]
fn cancelar_conversao(state: tauri::State<SidecarPid>) -> bool {
    let pid = state.0.lock().unwrap().take();
    match pid {
        Some(pid) => {
            matar_arvore(pid);
            true
        }
        None => false,
    }
}

#[tauri::command]
fn registrar_epub_gerado(caminho: String, state: tauri::State<EpubGerado>) {
    *state.0.lock().unwrap() = Some(PathBuf::from(caminho));
}

#[tauri::command]
fn abrir_epub_gerado(app: tauri::AppHandle, state: tauri::State<EpubGerado>) -> Result<(), String> {
    let caminho = state.0.lock().unwrap().clone();
    match caminho {
        Some(caminho) => app
            .opener()
            .open_path(caminho.to_string_lossy().to_string(), None::<&str>)
            .map_err(|erro| erro.to_string()),
        None => Err("Nenhum EPUB gerado nesta sessão.".to_string()),
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    // Apps GUI no macOS/Linux são iniciados pelo launchd com um PATH mínimo,
    // não o do shell interativo do usuário (.zshrc) — o sidecar foliant-core,
    // como processo filho deste app, herda esse PATH reduzido e não acha
    // tesseract/ebook-convert nem TESSDATA_PREFIX. fix_all_vars() (não só
    // fix(), que cobre só PATH) resolve o login shell do usuário e aplica
    // todas as variáveis exportadas (.zshrc) neste processo, cobrindo PATH
    // e TESSDATA_PREFIX com o mesmo mecanismo, sem hardcodar caminhos aqui.
    let _ = fix_path_env::fix_all_vars();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .manage(SidecarPid(Mutex::new(None)))
        .manage(EpubGerado(Mutex::new(None)))
        .invoke_handler(tauri::generate_handler![
            registrar_pid_sidecar,
            limpar_pid_sidecar,
            cancelar_conversao,
            registrar_epub_gerado,
            abrir_epub_gerado
        ])
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                // Fechar a janela não deve deixar o sidecar (nem
                // tesseract/ebook-convert filhos) rodando em background —
                // ver ARCHITECTURE.md, gerenciamento de ciclo de vida do
                // sidecar, para o teste real que confirmou o problema
                // (ps aux mostrando foliant-core minutos depois do app
                // fechado). Mata de forma síncrona antes de deixar a janela
                // fechar; kill() é rápido o bastante (chamadas de sistema)
                // para não precisar de api.prevent_close() + fluxo async.
                let state = window.state::<SidecarPid>();
                let pid = state.0.lock().unwrap().take();
                if let Some(pid) = pid {
                    matar_arvore(pid);
                }
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
