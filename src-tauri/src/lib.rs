mod api;
mod checkpoint;
mod explorer;
mod files;
mod git;
mod history;
mod hooks;
mod limits;
mod project;
mod pty;
mod stats;
mod tray;
mod usage;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
        .manage(pty::Ptys::default())
        .manage(stats::Stats::default())
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
            explorer::list_dir,
            explorer::read_file,
            explorer::changed_files,
            files::load_json,
            files::save_json,
            files::claude_settings,
            files::open_url,
            files::save_image,
            files::open_in_editor,
            git::git_worktree_add,
            git::git_worktree_remove,
            git::git_diff,
            git::git_branch,
            git::git_init,
            git::git_commit,
            git::git_merge,
            git::git_pr,
            git::git_discard,
            project::worktree_setup,
            project::free_port,
            tray::set_waiting,
            stats::pty_stats,
            checkpoint::checkpoints,
            checkpoint::restore_checkpoint,
            history::search_history,
            history::conversation_markdown,
            history::save_text,
            usage::usage_summary,
            limits::codex_limits
        ])
        .build(tauri::generate_context!())
        .expect("falha ao iniciar o Kora")
        .run(|app, event| {
            if let tauri::RunEvent::Exit = event {
                pty::kill_all(&app.state::<pty::Ptys>());
            }
        });
}
