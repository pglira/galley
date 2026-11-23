#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    // The DMA-BUF renderer of WebKitGTK can hang the web process in a GPU
    // sync wait with the NVIDIA driver. Use the fallback renderer, unless the
    // environment sets the variable.
    #[cfg(target_os = "linux")]
    if std::env::var_os("WEBKIT_DISABLE_DMABUF_RENDERER").is_none() {
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }
    galley_lib::run()
}
