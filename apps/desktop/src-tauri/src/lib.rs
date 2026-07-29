// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

//! Desktop launcher and supervisor for La Agencia.
//!
//! The Tauri process owns the local runtime lifecycle. It launches exactly one
//! loopback-only sidecar, waits for its health check, navigates the webview to
//! an authenticated URL and restarts the sidecar after bounded failures.

use rand::RngCore;
use std::{
    io::{Read, Write},
    net::{SocketAddr, TcpListener, TcpStream},
    sync::{
        atomic::{AtomicBool, Ordering},
        Mutex,
    },
    time::Duration,
};
use tauri::{Manager, RunEvent, Url};
use tauri_plugin_shell::{
    process::{CommandChild, CommandEvent},
    ShellExt,
};
use tauri_plugin_updater::UpdaterExt;

const MAX_RESTARTS: usize = 5;

struct RuntimeState {
    child: Mutex<Option<CommandChild>>,
    stopping: AtomicBool,
    navigated: AtomicBool,
}

fn session_token() -> String {
    let mut bytes = [0_u8; 32];
    rand::rng().fill_bytes(&mut bytes);
    bytes.iter().map(|byte| format!("{byte:02x}")).collect()
}

fn available_port() -> std::io::Result<u16> {
    let listener = TcpListener::bind(("127.0.0.1", 0))?;
    Ok(listener.local_addr()?.port())
}

fn runtime_healthy(port: u16) -> bool {
    let address = SocketAddr::from(([127, 0, 0, 1], port));
    let Ok(mut stream) = TcpStream::connect_timeout(&address, Duration::from_millis(250)) else {
        return false;
    };
    let _ = stream.set_read_timeout(Some(Duration::from_millis(500)));
    let _ = stream.set_write_timeout(Some(Duration::from_millis(500)));
    if stream
        .write_all(b"GET /api/health HTTP/1.1\r\nHost: 127.0.0.1\r\nConnection: close\r\n\r\n")
        .is_err()
    {
        return false;
    }
    let mut response = String::new();
    stream.read_to_string(&mut response).is_ok()
        && response.contains("200 OK")
        && response.contains("\"name\":\"La Agencia\"")
}

async fn wait_for_runtime(port: u16) -> bool {
    for _ in 0..150 {
        if runtime_healthy(port) {
            return true;
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
    false
}

fn stop_runtime(app: &tauri::AppHandle) {
    let state = app.state::<RuntimeState>();
    state.stopping.store(true, Ordering::SeqCst);
    if let Ok(mut child) = state.child.lock() {
        if let Some(process) = child.take() {
            let _ = process.kill();
        }
    };
}

fn show_startup_failure(app: &tauri::AppHandle, message: &str) {
    eprintln!("{message}");
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_title("La Agencia — no se pudo iniciar");
        let _ = window.show();
        let _ = window.set_focus();
    }
}

async fn install_verified_update(app: tauri::AppHandle) {
    let updater = match app.updater() {
        Ok(updater) => updater,
        Err(error) => {
            eprintln!("Unable to initialize updater: {error}");
            return;
        }
    };
    let update = match updater.check().await {
        Ok(update) => update,
        Err(error) => {
            eprintln!("Unable to check for updates: {error}");
            return;
        }
    };
    let Some(update) = update else {
        return;
    };
    if let Err(error) = update.download_and_install(|_, _| {}, || {}).await {
        eprintln!("Unable to install verified update: {error}");
        return;
    }
    app.restart();
}

async fn supervise_runtime(app: tauri::AppHandle, token: String, port: u16) {
    let mut failures = 0_usize;
    loop {
        let state = app.state::<RuntimeState>();
        if state.stopping.load(Ordering::SeqCst) {
            return;
        }

        let resource_dir = match app.path().resource_dir() {
            Ok(path) => path,
            Err(error) => {
                show_startup_failure(
                    &app,
                    &format!("Unable to resolve resource directory: {error}"),
                );
                return;
            }
        };
        let agents_root = resource_dir.join("resources").join("agents");
        let web_root = resource_dir.join("resources").join("web");
        let command = match app.shell().sidecar("agency-runtime") {
            Ok(command) => command
                .env("PORT", port.to_string())
                .env("AGENCY_SESSION_TOKEN", &token)
                .env("LA_AGENCIA_RESOURCE_ROOT", &resource_dir)
                .env("LA_AGENCIA_AGENTS_ROOT", agents_root)
                .env("LA_AGENCIA_WEB_ROOT", web_root)
                .env("LA_AGENCIA_PARENT_PID", std::process::id().to_string()),
            Err(error) => {
                show_startup_failure(&app, &format!("Unable to create runtime command: {error}"));
                return;
            }
        };

        let (mut events, child) = match command.spawn() {
            Ok(process) => process,
            Err(error) => {
                failures += 1;
                eprintln!("Unable to start runtime ({failures}/{MAX_RESTARTS}): {error}");
                if failures >= MAX_RESTARTS {
                    show_startup_failure(&app, "Runtime startup limit reached.");
                    return;
                }
                tokio::time::sleep(Duration::from_millis(
                    500_u64.saturating_mul(2_u64.pow((failures - 1) as u32)),
                ))
                .await;
                continue;
            }
        };

        if let Ok(mut slot) = state.child.lock() {
            *slot = Some(child);
        }

        if wait_for_runtime(port).await {
            failures = 0;
            if !state.navigated.swap(true, Ordering::SeqCst) {
                if let Some(window) = app.get_webview_window("main") {
                    let target = format!("http://127.0.0.1:{port}/#session={token}");
                    if let Ok(url) = Url::parse(&target) {
                        let _ = window.navigate(url);
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            }
        } else if let Ok(mut slot) = state.child.lock() {
            if let Some(process) = slot.take() {
                let _ = process.kill();
            }
        }

        while let Some(event) = events.recv().await {
            match event {
                CommandEvent::Stdout(line) => {
                    println!("[runtime] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Stderr(line) => {
                    eprintln!("[runtime] {}", String::from_utf8_lossy(&line));
                }
                CommandEvent::Terminated(_) | CommandEvent::Error(_) => break,
                _ => {}
            }
        }
        if let Ok(mut slot) = state.child.lock() {
            slot.take();
        }
        if state.stopping.load(Ordering::SeqCst) {
            return;
        }
        failures += 1;
        if failures >= MAX_RESTARTS {
            show_startup_failure(&app, "Runtime restart limit reached.");
            return;
        }
        tokio::time::sleep(Duration::from_millis(
            500_u64.saturating_mul(2_u64.pow((failures - 1) as u32)),
        ))
        .await;
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let application = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }))
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(RuntimeState {
            child: Mutex::new(None),
            stopping: AtomicBool::new(false),
            navigated: AtomicBool::new(false),
        })
        .setup(|app| {
            let handle = app.handle().clone();
            let updater_handle = handle.clone();
            let token = session_token();
            let port = available_port()?;
            tauri::async_runtime::spawn(supervise_runtime(handle, token, port));
            tauri::async_runtime::spawn(install_verified_update(updater_handle));
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building La Agencia");

    application.run(|app, event| {
        if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
            stop_runtime(app);
        }
    });
}
