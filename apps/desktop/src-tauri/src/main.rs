// SPDX-FileCopyrightText: 2026 La Agencia contributors
// SPDX-License-Identifier: MIT

//! Binary entry for the Tauri shell.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    la_agencia_lib::run();
}
