# Projects

A project is a folder on disk that holds everything for one study: audio recordings, annotations, prediction results, intermediate training files and trained models. The folder layout is the same as for orcAI projects created on the command line, so you can open the same project both in the app and in a terminal.

Projects can be managed once the runtime is running on **Home**.

## Creating a project

Click **Create project**, enter a name and choose a folder. The app creates the project structure and a parameter file — the same thing the `orcai init` command does. Then add your recordings.

## Project tabs

- **Recordings** — the project's WAV files. You can add new recordings here. PCM files from 16 to 32 bits are accepted; the sample rate in the table is read from the file header. The app maintains the recordings table `recording_table.csv` for you; orcAI uses it to know which files to process.
- **Annotations** — label files in which you have marked by hand where each sound occurs. The format is Audacity label text (`.txt`). Annotations are needed for training models; they are optional for plain predictions. Until at least one such file is added, the **Training wizard** button on this tab cannot be pressed.
- **Artifacts** — files produced by processing steps: spectrograms, training datasets, prediction results. Check what is ready here, and delete files you no longer need when disk space runs low.
- **Parameters** — project settings used by orcAI and the training wizard.

## Project goal {#focus}

When you create a project, the wizard asks what you plan to do: run predictions only, train a model, or both. Your answer affects hints and whether the **Training** section opens.

- **Predictions** — the **Training** item stays in the sidebar but cannot be pressed. Predictions and the other sections work as usual.
- **Model training** and **Full cycle** — the **Training** section opens.

You can change the goal at any time.

## Project readiness {#readiness}

The readiness panel checks which files already exist in the project folder and suggests the next step — for example, "add annotations" or "ready to train". The cards themselves do not block work. The training wizard and the pipeline steps that need labels still will not start until there is at least one annotation. See the Training chapter.

## Recordings table and sound classes

Besides the paths to recordings and annotations, `recording_table.csv` has a column for each sound class (`WHISTLE`, `BUZZ` and so on). It records whether that class can occur in the recording.

If a recording has an annotation, the app marks all classes for it by default. Without this, orcAI could not build the labels in the next training step. If you know that certain classes definitely do not occur in some recordings, you can record that by editing the table by hand.
