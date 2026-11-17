# Getting Started

## About the application

orcAI Desktop is a graphical interface for orcAI 3.0.4, a tool for automatic recognition of killer whale acoustic signals. With the application you can:

- create projects and add audio recordings to them;
- recognize signals in recordings using pretrained models;
- review results on a spectrogram and export them for further analysis;
- train and fine-tune your own models.

The computations are performed by the same orcAI that you use on the command line. Projects created in the application can be opened in a terminal, and the other way around. To see the exact command behind any run, open the **Command** tab in the console of the **Jobs** section.

## System requirements and installation

Application version: orcAI Desktop 1.0.4. The primary release targets macOS (Apple silicon); this build runs on Windows.

Computations run on the central processor (CPU) by default. You can switch to the graphics processor (GPU; Metal on macOS) in **Settings → Runtime**. There is no fixed minimum for memory (RAM). Training a model takes from a few hours to a day and requires tens of gigabytes of free disk space (see the “Training” chapter).

The application is distributed as a self-contained package: Python and all other components are included. On macOS, copy the whole application package (`.app`), for example to your Applications folder. On Windows, install or copy this build’s distribution as a whole (no separate system Python).

## Conventions

| Formatting | Meaning |
|------------|---------|
| **Bold** | Names of sections, tabs, buttons, and interface fields |
| `Monospace` | File and folder names, orcAI commands and parameters, class codes |
| “Quotation marks” | Chapter titles and values you select from a list |

> **Note.** Additional information. You can complete the procedure without it.

> **Important.** A condition without which the procedure fails or causes data loss.

## First launch

When the application opens, the Sidecar service and the orcAI engine are stopped, so no heavy computation is running. To get started:

1. On the **Home** page, click **Start**. This launches the Sidecar service (the intermediary between the interface and orcAI) and the orcAI engine (the process that performs the computations).
2. Wait until the indicators in the “Runtime” block turn green. This usually takes from a few seconds to a minute.
3. Go to the **Projects** section and create a new project or open an existing one.

To start the runtime automatically when the application opens, turn on **Start engine on launch** (**Settings → Runtime**). This option is off by default.

The built-in models `orcai-isl-v1` and `orcai-nor-v1` are part of the application; you do not need to download them separately.

## Main workflows

### Recognizing signals in recordings

1. In the **Projects** section, add your WAV files.
2. In the **Predictions** section, on the **Parameters** tab, select a model and files, then click **Start recognition**.
3. On the **Analysis** tab, review the detected signals on the spectrogram.
4. If needed, remove signals that are too short or too long on the **Filtering** tab.

### Training your own model

1. In the **Projects** section, create a project with the goal “Model training” or “Full cycle”. Add WAV files and `.txt` annotation files; each annotation file must have the same name as its recording.
2. In the **Training Pipeline** section, open the training wizard and complete its five steps.
3. In the **Models** section, evaluate the model and assign it for recognition.

> **Important.** The training wizard and the pipeline steps that need annotations are unavailable until the project contains at least one annotation whose name matches a recording. See the “Training” chapter, section “Preparing the data”.

A summary across all recordings in the project is available in the **Results** section. The history of runs is in the **Jobs** section.

## Interface language

Select the interface and help language in **Settings → Interface**. Class codes (`WHISTLE`, `BUZZ`, and others), file names, and orcAI commands are not translated, so that you can match them with the orcAI documentation and scientific publications.

## Help & About {#help-section}
The **Help & About** section in the sidebar has three tabs:

- **Manual**: this document;
- **About**: version and authors;
- **License**: terms of use.

The **Help** button in the top right corner of every section opens the manual chapter for the current screen.

The application is distributed under the CC BY-SA 4.0 license. Information about third-party components is in the `THIRD_PARTY_LICENSES` file in the application package.
