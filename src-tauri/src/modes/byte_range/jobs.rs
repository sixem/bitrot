// Job registry + cancellation for modulo mapping work.
use std::{
  collections::HashMap,
  sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex
  }
};

use tauri::State;

#[derive(Default)]
pub struct ModuloMappingJobs(Mutex<HashMap<String, Arc<AtomicBool>>>);

impl ModuloMappingJobs {
  pub fn register(&self, job_id: &str) -> Arc<AtomicBool> {
    let mut lock = self
      .0
      .lock()
      .unwrap_or_else(|error| error.into_inner());
    let flag = Arc::new(AtomicBool::new(false));
    lock.insert(job_id.to_string(), flag.clone());
    flag
  }

  pub fn cancel(&self, job_id: &str) -> bool {
    let lock = self
      .0
      .lock()
      .unwrap_or_else(|error| error.into_inner());
    if let Some(flag) = lock.get(job_id) {
      flag.store(true, Ordering::Relaxed);
      return true;
    }
    false
  }

  pub fn finish(&self, job_id: &str) {
    let mut lock = self
      .0
      .lock()
      .unwrap_or_else(|error| error.into_inner());
    lock.remove(job_id);
  }
}

pub(super) async fn modulo_mapping_cancel(
  job_id: String,
  state: State<'_, ModuloMappingJobs>
) -> Result<(), String> {
  if state.cancel(&job_id) {
    Ok(())
  } else {
    Err("Unknown modulo mapping job".into())
  }
}
