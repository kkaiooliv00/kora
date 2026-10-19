mod api;
mod files;
mod git;
mod pty;
mod tray;
mod usage;

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
            tray::setup(app)?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            api::cli_reply,
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill,
            files::load_json,
            files::save_json,
            files::claude_settings,
            files::open_url,
            files::save_image,
            files::open_in_editor,
            git::git_worktree_add,
            git::git_worktree_remove,
            git::git_diff,
            tray::set_waiting,
            usage::usage_summary
        ])
        .run(tauri::generate_context!())
        .expect("falha ao iniciar o Kora");
}
