# Projects

A project is a folder on disk that holds all the material for one study: audio recordings, annotations, recognition results, intermediate training files, and trained models. The folder structure is identical to that of orcAI projects created on the command line, so the same project can be opened both in the application and in a terminal.

The runtime must be running on the **Home** page before you can work with projects.

Until a project is created or selected, the **Predictions**, **Training Pipeline**, **Models**, **Results**, and **Jobs** menu items are visible but unavailable. **Home**, **Projects**, **Settings**, and **Help & About** are always available.

## Opening a project and adding files

Three actions are easy to confuse:

1. **Project list**: open a project or switch to another one from the list of projects the application knows about.
2. **Open project folder** for the active project: show its folder in the file manager (Finder on macOS, File Explorer on Windows). This button does not connect a different folder.
3. **Open project folder** in the empty state of the **Projects** section (no project selected): choose an existing orcAI folder on disk, including one created in a terminal, to add it to the application’s list. The label is the same, but here the action connects the folder instead of showing it in the file manager. No conversion is needed.

To start a new project, click **Create project**. Do not create a new project with the same name on top of an existing folder; connect the folder itself instead (action 3).

- To add recordings, click **Add WAV** on the **Recordings** tab, or drag WAV files into the “Drop WAV files here” area.
- To add annotations, click **Add annotations** on the **Annotations** tab, or drag `.txt` files into the “Drop .txt files here or click ‘Add annotations’” area.

## Creating a project

1. Click **Create project**.
2. Enter a project name and choose a folder.
3. Select the project goal (see the section “Project goal”).

The application creates the folder structure and a parameter file. This is equivalent to the `orcai init` command. After the project is created, add your recordings.

## Project tabs

| Tab | Purpose |
|-----|---------|
| **Recordings** | The list of the project’s WAV files. New recordings are added here. PCM files with 16–32 bit depth are accepted; the sampling rate is read from the file header. The application maintains the `recording_table.csv` table, which orcAI uses to determine which files to process |
| **Annotations** | Annotation files in which you have marked by hand where and which sound is heard. The format is Audacity label text (`.txt`). Annotations are required for training models and are not needed for recognition. Until the project has at least one annotation file, the **Training wizard** button on this tab is unavailable |
| **Artifacts** | Files created by the processing steps: spectrograms, training datasets, recognition results. Here you can see what is already done and delete files you no longer need to free up space |
| **Parameters** | Project parameters used by orcAI and the training wizard |

## Project goal {#focus}

You set a goal when you create a project. It determines which tips appear and whether the **Training Pipeline** section is available:

| Goal | “Training” section |
|------|--------------------|
| Predictions | The menu item is visible but unavailable. All other sections work as usual |
| Model training | Available |
| Full cycle | Available |

You can change the goal at any time with the goal switches in the header of the project card.

## Project readiness {#readiness}

The readiness panel analyzes the contents of the project folder and suggests the next step, for example “Add annotations” or “Ready to start training”. These suggestions are advisory.

The exception is operations that require annotations: the training wizard and the pipeline steps do not start until the project has at least one annotation (see the “Training” chapter).

After you add recordings, the application does not switch tabs for you. Instead, the **Annotations** tab and the entry in the **Next step** block are highlighted.

## Recording table and sound classes

The `recording_table.csv` table contains the paths to recordings and annotations, plus one column for each sound class (`WHISTLE`, `BUZZ`, and others). A value in a column indicates whether the class is present in the recording. Without these columns, orcAI cannot build the label arrays in the next training step.

> **Important.** When the application creates or updates the table, it marks every class as present for each recording that has an annotation. The terminal command `orcai create-recording-table` fills these columns differently. If certain classes are known to be absent from some recordings, correct the table manually.

### Updating the table

When you update the table manually, the dialog lets you set:

| Parameter | orcAI flag | Purpose |
|-----------|------------|---------|
| Default channel | `-dc` | The channel used for multichannel recordings |
| Remove duplicate names | `-rdf` | Excludes duplicate file names |
| Exclusion path | `-ep` | Files that are left out of the table |

Automatic synchronization after WAV files are added or removed runs with `-dc 1` and without `-rdf` and `-ep`. An update from the **Projects** section uses `-ut` (`update_table`: append to the existing table) and `-up` (`update_paths`: update file paths). These modes do not necessarily rebuild the table from scratch; a full rebuild happens in overwrite mode.
