// Prevents additional console window on Windows in release, DO NOT REMOVE!!
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use clap::Parser;
use silkscribe_app_lib::CliArgs;

fn main() {
    let cli_args = CliArgs::parse();

    // An AI app starts `silkscribe --mcp` to read the library; it never
    // shows a window or touches the running app.
    if cli_args.mcp {
        std::process::exit(silkscribe_app_lib::serve_mcp());
    }

    #[cfg(target_os = "linux")]
    {
        // DMABUF renderer causes crashes on various GPU/display server configurations
        // See: https://github.com/tauri-apps/tauri/issues/9394
        std::env::set_var("WEBKIT_DISABLE_DMABUF_RENDERER", "1");
    }

    silkscribe_app_lib::run(cli_args)
}
