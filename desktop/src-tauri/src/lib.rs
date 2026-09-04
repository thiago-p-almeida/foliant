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
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
