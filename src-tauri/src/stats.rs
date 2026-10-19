//! CPU e memória de cada terminal: o processo raiz e todos os descendentes (agente → node → …).

use crate::pty::{self, Ptys};
use serde::Serialize;
use std::{
    collections::{HashMap, HashSet},
    sync::Mutex,
};
use sysinfo::{Pid, ProcessRefreshKind, ProcessesToUpdate, System};
use tauri::State;

/// O `System` fica guardado: o uso de CPU é a diferença entre duas leituras seguidas.
#[derive(Default)]
pub struct Stats {
    sys: Mutex<System>,
}

#[derive(Serialize)]
pub struct Usage {
    /// Percentual da máquina inteira (0–100).
    cpu: f32,
    /// Bytes de memória residente.
    memory: u64,
}

/// Soma `value` do processo `root` e de toda a árvore abaixo dele.
fn tree_sum<T: std::ops::AddAssign + Default>(root: Pid, children: &HashMap<Pid, Vec<Pid>>, value: impl Fn(Pid) -> Option<T>) -> T {
    let mut total = T::default();
    let mut seen = HashSet::new();
    let mut stack = vec![root];
    while let Some(pid) = stack.pop() {
        if !seen.insert(pid) {
            continue;
        }
        if let Some(v) = value(pid) {
            total += v;
        }
        stack.extend(children.get(&pid).into_iter().flatten());
    }
    total
}

#[tauri::command]
pub async fn pty_stats(ptys: State<'_, Ptys>, stats: State<'_, Stats>, ids: Vec<u32>) -> Result<HashMap<u32, Usage>, String> {
    let roots = pty::pids(&ptys, &ids);
    let mut sys = stats.sys.lock().map_err(|e| e.to_string())?;
    sys.refresh_processes_specifics(ProcessesToUpdate::All, true, ProcessRefreshKind::nothing().with_cpu().with_memory());
    let mut children: HashMap<Pid, Vec<Pid>> = HashMap::new();
    for (pid, process) in sys.processes() {
        if let Some(parent) = process.parent() {
            children.entry(parent).or_default().push(*pid);
        }
    }
    let cores = std::thread::available_parallelism().map(|n| n.get()).unwrap_or(1) as f32;
    Ok(roots
        .into_iter()
        .map(|(id, root)| {
            let root = Pid::from_u32(root);
            let cpu = tree_sum(root, &children, |p| sys.process(p).map(|p| p.cpu_usage()));
            let memory = tree_sum(root, &children, |p| sys.process(p).map(|p| p.memory()));
            (id, Usage { cpu: cpu / cores, memory })
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tree_sum_walks_descendants_once() {
        let (a, b, c) = (Pid::from_u32(1), Pid::from_u32(2), Pid::from_u32(3));
        // 1 → 2 → 3, e um ciclo 3 → 1 (pid reaproveitado) que não pode travar.
        let children = HashMap::from([(a, vec![b]), (b, vec![c]), (c, vec![a])]);
        assert_eq!(tree_sum(a, &children, |p| Some(p.as_u32())), 6);
        assert_eq!(tree_sum(b, &children, |p| Some(p.as_u32())), 6);
    }
}
