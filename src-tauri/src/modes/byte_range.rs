// Native modulo mapping pipeline for frame-level corruption.
// File name kept for now to avoid a wide rename across the repo.
mod jobs;
mod math;
mod pipeline;
mod preview;

pub use jobs::{modulo_mapping_cancel, ModuloMappingJobs};
pub use math::ModuloMappingConfig;
pub use pipeline::modulo_mapping_process;
pub use preview::{
  modulo_mapping_preview_append,
  modulo_mapping_preview_discard,
  modulo_mapping_preview_finish,
  modulo_mapping_preview_start,
  ModuloMappingPreviewResponse
};
