# Predictions
The model searches recordings for killer whale acoustic signals: whistles, echolocation click trains, pulsed calls, and other classes. The result for each recording is saved to a text file next to it.

Predictions run in three stages, each with its own tab: **Parameters** (start a run), **Analysis** (review the detected signals), and **Filtering** (exclude signals of unsuitable duration).

If the classes or spectrogram parameters of the selected model do not match the project’s parameters, the application shows a warning. You can still run recognition, but the **Test** button in the **Models** section is unavailable for that pair.

## Parameters {#parameters}

On this tab you choose the recordings and the recognition settings.

| Parameter | Description |
|-----------|-------------|
| **Model** | The model used for recognition. The built-in `orcai-isl-v1` is a good starting point |
| **Channel** | The channel to analyze for multichannel recordings. Default: 1 |
| **Threshold** | The minimum probability at which a signal is written to the label file. A higher threshold produces fewer false detections but raises the risk of missing weak signals. Default: 0.50 |
| **Files to recognize** | The list of all WAV files in the project. Only checked files are processed |
| **Overwrite existing results** | Replaces previously created result files |
| **Save probabilities** | Saves the probability of each detected signal |
| **Advanced** | The output path for label files, the label suffix, and the log verbosity level |

To start recognition, select your files and click **Start recognition**.

### Label suffix

The default suffix is `*`, so a class appears in the label file as `WHISTLE*`. If the suffix field is empty, no suffix is added. The **Type** column on the **Analysis** tab does not show the suffix; when you export to Audacity, the label text is taken from the file.

### Command and processing time

The bottom of the screen shows the orcAI command that will be run. You can copy it. Next to it is an estimated processing time; the actual time can differ from the estimate by a factor of about 1.5 in either direction. If no files are selected, a dash is shown instead of a time.

### Presets

Combinations of settings are stored in the **Project preset** list. The **Save** and **Save as…** buttons are next to the tabs:

- **Save** updates the selected preset. It does not link a shared preset to the open project.
- **Save as…** creates a new preset for the open project.

### Results

Results are saved to `*_predicted.txt` files. You can open these files in Audacity as a label track.

## Analysis {#results}

The **Analysis** tab shows the signals the model has detected. The spectrogram is rendered the same way as in orcAI (`display_kind=orcai`, frequency range 0–16 kHz), so the image matches the figures in the publications.

> **Note.** The colored bands mark a signal’s **class over time** (like Audacity label tracks), not its frequency. Frequency runs up the spectrogram (0–16 kHz), so a band may not line up with the visible energy of the call. orcAI label files (`*_predicted.txt`, annotations) store only start, stop, and class — no frequency bounds.

Elements of the tab:

| Element | Purpose |
|---------|---------|
| Playback bar | Plays the recording; controls label opacity and time zoom |
| Spectrogram | Detected signals are marked with colored class bands (by time, not by frequency); each class has its own color |
| **Classes** rail (right) | Hides individual classes and sets the minimum probability to display |
| Signal table (bottom) | Start and end time, duration, class (the code, for example `WHISTLE`), type (a readable name, often taken from the label synonym), and probability. Clicking a row moves the spectrogram to that signal |

All of these controls affect only what is displayed; result files are not changed. Spectrogram display and the mode for long recordings are set in **Settings → Runtime** (**Show spectrogram**, **Long recordings**).

> **Note.** Do not confuse the **Analysis** tab with the **Results** section in the sidebar. The **Results** section collects summary data for all recordings in the project.

## Filtering {#filter}

The model can flag signals that are too short or too long. On the **Filtering** tab you set an allowed duration range for each class, and signals outside the range are excluded. Filtering is performed by the orcAI `filter-predictions` command.

### Workflow

1. Select a class. The histogram shows the distribution of durations for the detected signals of that class.
2. Set the minimum and maximum: type values or select a range on the histogram. An empty minimum is treated as 0; an empty maximum means no upper limit.
3. Check the preview: how many signals will remain and how many will be excluded.
4. Click **Apply filter**.

The original `*_predicted.txt` file is not changed. The filtered result is written to a separate `*_predicted_filtered.txt` file.

### Duration limits table

The first row of the table is **default**. Its limits apply to every class that has no row of its own. If there is a row named after a class, orcAI uses that row’s limits, even if the minimum is 0 and the maximum is not set. Classes that are absent from the selected results file are not included in the table.

The histogram is shown in two cases:

- Only one class is left without its own row: the histogram shows that class’s signals.
- Several classes are left without their own rows: no combined chart is drawn. Select the class you need by clicking its row in the table, including the **default** row.

### Default values and the example

By default, every class has a minimum of 0 and no upper limit, so orcAI excludes nothing. Enter your own limits, or click **Example** to fill in the minimum values from the publication; the upper limit stays open. Classes for which the example defines no values are handled by the **default** row.
