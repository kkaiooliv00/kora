mod api;
mod files;
mod pty;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(pty::Ptys::default())
        .setup(|app| {
            let api = api::start(app.handle().clone())?;
            app.manage(api);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            files::load_json,
            files::save_json,
            files::claude_settings,
            files::open_url
        ])
        .run(tauri::generate_context!())
        .expect("falha ao iniciar o Terminal Person");
}
