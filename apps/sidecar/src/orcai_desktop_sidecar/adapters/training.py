"""Training pipeline command adapters (orcAI steps 5–12) — engine defaults pass-through."""

from __future__ import annotations

from orcai_desktop_sidecar.adapters.training_common import (
    _messenger,
    _read_json_dict,
    _reject_orcai_parameter,
    _run_with_artifacts,
)
from orcai_desktop_sidecar.adapters.training_dataset import (
    _drop_stale_dataset_shards,
    run_create_snippet_table,
    run_create_tvt_data,
    run_create_tvt_snippet_tables,
    run_hpsearch,
)
from orcai_desktop_sidecar.adapters.training_fit import (
    _calls_of,
    _check_test_class_layout,
    run_test,
    run_train,
)
from orcai_desktop_sidecar.adapters.training_hps import (
    _apply_best_hyperparameters_before_train,
    _find_best_hyperparameters_json,
    _merge_best_hyperparameters_into_doc,
    _rel_is_hidden,
)
from orcai_desktop_sidecar.adapters.training_labels import (
    _annotation_cell,
    _explicit_call_equivalences_fallback,
    _same_annotation_dir,
    annotation_table_skipping_missing_txt,
    resolve_call_equivalences_for_engine,
    run_create_label_arrays,
)
from orcai_desktop_sidecar.adapters.training_params import abs_str
from orcai_desktop_sidecar.adapters.training_snippet_prep import (
    _clamp_n_batches_to_snippets,
    _count_snippets_by_type,
    _counts_after_orcai_filter,
)
from orcai_desktop_sidecar.adapters.training_spectrograms import (
    _load_calls_for_spectrogram_preflight,
    count_spectrogram_eligible_rows,
    reject_empty_spectrogram_selection,
    run_create_spectrograms,
)

# Re-export for callers / tests that imported abs_str from this module.
__all__ = [
    "abs_str",
    "annotation_table_skipping_missing_txt",
    "count_spectrogram_eligible_rows",
    "reject_empty_spectrogram_selection",
    "resolve_call_equivalences_for_engine",
    "run_create_label_arrays",
    "run_create_snippet_table",
    "run_create_spectrograms",
    "run_create_tvt_data",
    "run_create_tvt_snippet_tables",
    "run_hpsearch",
    "run_test",
    "run_train",
]
