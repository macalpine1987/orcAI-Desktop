"""Pydantic request/response models for the sidecar HTTP API."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, Field

class CreateJobRequest(BaseModel):
    command: str = Field(..., description="orcAI CLI command name")
    params: dict[str, Any] = Field(default_factory=dict)
    priority: int = Field(0, description="Higher runs first; default 0")

class InitProjectParams(BaseModel):
    project_dir: str
    project_name: str
    verbosity: int = 2

class CreateRecordingTableParams(BaseModel):
    base_dir_recording: str
    output_path: str | None = None
    base_dir_annotation: str | None = None
    default_channel: int = 1
    remove_duplicate_filenames: bool = False
    exclude_patterns: str | None = None
    overwrite: bool = False
    # Desktop-only: fill class columns for annotated rows (default on for training).
    fill_call_possibility: bool = True
    verbosity: int = 2

class ExportAudacityParams(BaseModel):
    label_path: str
    wav_path: str | None = None
    output_path: str | None = None
    channel: int = 1
    orcai_parameter: str | None = None

class PredictJobParams(BaseModel):
    recording_path: str
    channel: int = 1
    threshold: float = 0.5
    model: str = "orcai-isl-v1"
    model_dir: str | None = None
    output_path: str = "default"
    overwrite: bool = False
    save_probabilities: bool = False
    base_dir_recording: str | None = None
    call_duration_limits: str | None = None
    label_suffix: str = "*"
    verbosity: int = 2
    project_dir: str | None = None
    # Desktop-only: subset of recording_table.csv rows (stems); omitted from orcAI CLI.
    recording_names: list[str] | None = None

class EngineStartRequest(BaseModel):
    compute_device: str = Field(default="cpu", description="cpu or gpu")

class CreateProjectRequest(BaseModel):
    parent_dir: str
    display_name: str
    description: str = ""
    orcai_name: str | None = None
    import_paths: list[str] = Field(default_factory=list)
    project_kind: str = "recognition"
    focus: str | None = Field(
        default=None,
        description="Soft focus (recognition | training | full); Desktop SQLite only",
    )

class RegisterProjectRequest(BaseModel):
    path: str
    display_name: str | None = None

class UpdateProjectRequest(BaseModel):
    display_name: str | None = None
    description: str | None = None
    focus: str | None = None
    auto_sync_recording_table: bool | None = None
    predict_model: str | None = None
    predict_model_dir: str | None = None
    spectrogram_colormap: str | None = None

class RecordingChannelRequest(BaseModel):
    channel: int = Field(..., ge=1, le=64)

class ParameterTextRequest(BaseModel):
    text: str

class ImportRecordingsRequest(BaseModel):
    paths: list[str] = Field(..., min_length=1)

class DeleteRecordingsRequest(BaseModel):
    filenames: list[str] = Field(default_factory=list)
    delete_all: bool = False

class SyncTableRequest(BaseModel):
    overwrite: bool = False
    update_table: bool = False
    default_channel: int | None = None
    remove_duplicate_filenames: bool = False
    exclude_patterns: str | None = None

class FsWriteTextRequest(BaseModel):
    path: str
    content: str

class FilterPreviewRequest(BaseModel):
    predicted_labels: list[str] = Field(default_factory=list)
    call_duration_limits: dict[str, Any] = Field(default_factory=dict)
    label_suffix: str = "*"

class ModelsCompatibilityBody(BaseModel):
    model_id: str
    project_dir: str

class ModelsImportBody(BaseModel):
    source_dir: str
    project_dir: str
    dest_name: str | None = None

class ModelsExportBody(BaseModel):
    model_id: str
    dest_parent: str
    project_dir: str | None = None
    dest_name: str | None = None

class JobsQueuePatch(BaseModel):
    max_concurrent: int = Field(1, ge=1, le=8)

class ClearJobsRequest(BaseModel):
    project_dir: str | None = None

class SnippetCalculatorRequest(BaseModel):
    calls: list[str] = Field(default_factory=list)
    equivalences: dict[str, str] = Field(default_factory=dict)
    snippets: dict[str, Any] = Field(default_factory=dict)
    batch_size: int = 64
    seed: int | None = None

