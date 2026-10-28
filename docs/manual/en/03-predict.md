# Predictions

In this section a model searches your recordings for killer whale sounds: whistles, buzzes, pulsed calls and other classes. The result for each recording is saved to a text file next to it.

The section has three tabs, usually used in order: **Settings** → **Analysis** → **Filter**.

If the selected model's classes or spectrogram parameters do not match the project, the app shows a warning. You can still run predictions. **Test** in **Models** is unavailable for that pair.

## Settings {#parameters}

Choose the recordings and the prediction settings here.

- **Model** — which neural network to use. The bundled `orcai-isl-v1` is a good place to start.
- **Channel** — for multichannel recordings, which channel to analyse.
- **Threshold** — the minimum probability for a signal to be written to the label file. A higher threshold gives fewer false detections and may miss faint signals. If unsure, keep the default.
- **Files to recognize** — every WAV in the project. Only checked files are run.
- **Overwrite existing output** and **Save probabilities** — on the same panel.
- **Advanced** — the label output path, the label suffix and the log detail. The default suffix is `*`: the label file writes the class as `WHISTLE*`. An empty field adds no suffix. The **Type** column on the **Analysis** tab does not show it; Audacity export takes the label from the file.

The bottom of the screen shows the orcAI command that will be run; you can copy it. It also shows an estimated processing time. Treat it as a guide: the actual time may be up to about one and a half times shorter or longer. If no files are selected, a dash is shown instead.

Setting combinations are kept in the **Project preset** list. The **Save** and **Save as…** buttons sit next to the tabs. **Save** updates the selected preset and does not bind a shared preset to the open project. **Save as…** creates a preset for the open project.

Results are saved to `*_predicted.txt` files, which you can open in Audacity as a label track.

## Analysis {#results}

The **Analysis** tab lets you examine in detail what the model found. The spectrogram is drawn exactly as orcAI draws it (`display_kind=orcai` mode, 0–16 kHz), so the picture matches the figures in the publications.

On screen:

- **playback bar** — play the recording, adjust label opacity and time zoom;
- **spectrogram** — detected signals are shown as coloured bars, one colour per class;
- the **Classes** rail on the right — hide individual classes and set the minimum probability to display;
- **signals table** at the bottom — start and end time, duration, class, sound type and probability. Clicking a row jumps to that spot on the spectrogram.

All toggles affect only what you see; the result files stay unchanged.

Do not confuse this tab with the **Results** section in the sidebar, which summarises all recordings in the project at once.

## Filter {#filter}

The model sometimes marks signals that are too short or too long. On the **Filter** tab you set an allowed duration range for each class, and anything outside it is discarded. This is done by the orcAI command `filter-predictions`.

How to use it:

1. Choose a class. The histogram shows the durations of the signals of that class the model found.
2. Set the minimum and maximum — type the values or select a range directly on the histogram. An empty minimum is treated as zero; an empty maximum means no upper bound.
3. Check the preview: how many signals will stay and how many will be removed.
4. Click **Apply filter**.

The first row of the duration limits table is **default**. orcAI uses it for classes that have no row of their own. A class with its own limits uses that row, even when the minimum is 0 and the maximum is empty. With **default** selected, the histogram shows the durations of signals from all classes.

The original `*_predicted.txt` file is not changed. The filtered result is written to a separate `*_predicted_filtered.txt` file, so you can always go back to the original data.

The default set is a minimum of 0 and no maximum for every class, so orcAI discards nothing. Set your own limits, or click **orcAI-v1 example**: that fills in the publication minima and leaves the upper bound open. Classes the example does not set follow the **default** row.
