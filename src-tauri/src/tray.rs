use tauri::{
    image::Image,
    menu::{Menu, MenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    App, AppHandle, Emitter, Manager, Runtime, UserAttentionType,
};

const TRAY_ID: &str = "main";

/// Tamanhos desenhados no handoff (16 = 100%, 20 = 125%, 24 = 150% e Linux, 32 = 200%…).
/// Cada um tem desenho próprio: escolhe o certo para a escala, nunca redimensiona.
const SIZES: [u32; 6] = [16, 20, 24, 32, 40, 48];
const NORMAL: [&[u8]; 6] = [
    include_bytes!("../icons/tray/kora-tray-16.png"),
    include_bytes!("../icons/tray/kora-tray-20.png"),
    include_bytes!("../icons/tray/kora-tray-24.png"),
    include_bytes!("../icons/tray/kora-tray-32.png"),
    include_bytes!("../icons/tray/kora-tray-40.png"),
    include_bytes!("../icons/tray/kora-tray-48.png"),
];
const WAITING: [&[u8]; 6] = [
    include_bytes!("../icons/tray/kora-tray-16-aguardando.png"),
    include_bytes!("../icons/tray/kora-tray-20-aguardando.png"),
    include_bytes!("../icons/tray/kora-tray-24-aguardando.png"),
    include_bytes!("../icons/tray/kora-tray-32-aguardando.png"),
    include_bytes!("../icons/tray/kora-tray-40-aguardando.png"),
    include_bytes!("../icons/tray/kora-tray-48-aguardando.png"),
];
const LINUX_SIZE: u32 = 24;
const BASE_SIZE: f64 = 16.0;

/// Índice do menor tamanho desenhado que cobre a escala da tela.
fn size_index(scale: f64, linux: bool) -> usize {
    let wanted = if linux { LINUX_SIZE } else { (BASE_SIZE * scale).round() as u32 };
    SIZES.iter().position(|&s| s >= wanted).unwrap_or(SIZES.len() - 1)
}

fn icon<R: Runtime, M: Manager<R>>(manager: &M, waiting: bool) -> Option<Image<'static>> {
    let scale = manager.get_webview_window("main").and_then(|w| w.scale_factor().ok()).unwrap_or(1.0);
    let index = size_index(scale, cfg!(target_os = "linux"));
    Image::from_bytes(if waiting { WAITING[index] } else { NORMAL[index] }).ok()
}

fn show_main(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

pub fn setup(app: &App) -> tauri::Result<()> {
    let show = MenuItem::with_id(app, "show", "Mostrar Kora", true, None::<&str>)?;
    let quit = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show, &quit])?;
    let mut tray = TrayIconBuilder::with_id(TRAY_ID)
        .tooltip("kora")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
                // A interface abre o chat que espera você há mais tempo (se houver).
                let _ = tray.app_handle().emit("tray-open", ());
            }
        });
    if let Some(image) = icon(app, false) {
        tray = tray.icon(image);
    }
    tray.build(app)?;
    Ok(())
}

/// Texto da bandeja e do título: "kora · 1 chat aguardando você (migrations)" / "(1) kora — projeto / grupo".
fn labels(waiting: &[String], context: Option<&str>) -> (String, String) {
    let count = waiting.len();
    let tooltip = match count {
        0 => "kora".to_string(),
        1 => format!("kora · 1 chat aguardando você ({})", waiting[0]),
        n => format!("kora · {n} chats aguardando você ({})", waiting.join(", ")),
    };
    let base = context.filter(|c| !c.is_empty()).map_or("kora".to_string(), |c| format!("kora — {c}"));
    let title = if count == 0 { base } else { format!("({count}) {base}") };
    (tooltip, title)
}

/// Ponto âmbar na bandeja só quando algum chat espera você; erros não mudam o ícone.
/// `attention` pisca a barra de tarefas se a janela estiver fora de foco.
#[tauri::command]
pub fn set_waiting(app: AppHandle, waiting: Vec<String>, context: Option<String>, attention: bool) {
    let (tooltip, title) = labels(&waiting, context.as_deref());
    if let Some(tray) = app.tray_by_id(TRAY_ID) {
        let _ = tray.set_tooltip(Some(&tooltip));
        let _ = tray.set_icon(icon(&app, !waiting.is_empty()));
    }
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_title(&title);
        if attention && !window.is_focused().unwrap_or(true) {
            let _ = window.request_user_attention(Some(UserAttentionType::Informational));
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{labels, size_index, SIZES};

    #[test]
    fn size_index_picks_the_drawn_size_for_each_scale() {
        let size = |scale, linux| SIZES[size_index(scale, linux)];
        assert_eq!(size(1.0, false), 16);
        assert_eq!(size(1.25, false), 20);
        assert_eq!(size(1.5, false), 24);
        assert_eq!(size(1.75, false), 32);
        assert_eq!(size(3.5, false), 48);
        assert_eq!(size(2.0, true), 24);
    }

    #[test]
    fn labels_follow_the_design() {
        let (tooltip, title) = labels(&["migrations".into()], Some("kora-app / Backend"));
        assert_eq!(tooltip, "kora · 1 chat aguardando você (migrations)");
        assert_eq!(title, "(1) kora — kora-app / Backend");
        assert_eq!(labels(&[], None), ("kora".into(), "kora".into()));
    }
}
