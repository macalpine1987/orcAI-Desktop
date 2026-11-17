//! Tauri invoke command surface (split by domain).

mod shell_cmds;
mod sidecar_cmds;
mod window_cmds;

pub use shell_cmds::*;
pub use sidecar_cmds::*;
pub use window_cmds::*;
