# Predictions

In this section a model listens to your recordings and finds killer whale sounds in them: whistles, buzzes, pulsed calls and other classes. The result for each recording is saved to a text file next to it.

The section has three tabs, usually used in order: **Parameters** → **Analysis** → **Filtering**.

Before a run, the app checks that the selected model suits the project — that the sound classes and spectrogram settings match. If they do not, you will see a warning.

## Parameters {#parameters}

Choose the recordings and the prediction settings here.

- **Model** — which neural network to use. The bundled `orcai-isl-v1` is a good place to start.
- **Channel** — for multichannel recordings, which channel to analyse.
- **Threshold** — the minimum model confidence for a signal to be included in the results. A higher threshold gives fewer false detections but may miss faint signals. If unsure, keep the default.
- **File queue** — which recordings to process. You can pick individual files or all recordings from the project table.
- **Advanced options** — overwrite existing results, save spectrograms, choose the output folder and the log detail level.

The bottom of the screen shows the orcAI command that will be run; you can copy it. It also shows an estimated processing time. Treat it as a guide: the actual time may be up to about one and a half times shorter or longer. If no files are selected, a dash is shown instead.

Setting combinations you use often can be saved as a preset.

Results are saved to `*_predicted.txt` files, which you can open in Audacity as a label track.

## Results (Analysis studio) {#results}

The **Analysis** tab lets you examine in detail what the model found. The spectrogram is drawn exactly as orcAI draws it (`display_kind=orcai` mode, 0–16 kHz), so the picture matches the figures in the publications.

On screen:

- **playback bar** — play the recording, adjust label opacity and time zoom;
- **spectrogram** — detected signals are shown as coloured bars, one colour per class;
- **class panel** on the right — hide individual classes and set the minimum confidence to display;
- **signals table** at the bottom — start and end time, duration, class, sound type and model confidence. Clicking a row jumps to that spot on the spectrogram.

All toggles affect only what you see; the result files stay unchanged.

Do not confuse this tab with the **Results** section in the sidebar, which summarises all recordings in the project at once.

## Filtering {#filter}

The model sometimes marks very short fragments or implausibly long signals. On the **Filtering** tab you set an allowed duration range for each class, and anything outside it is discarded. This is done by the orcAI command `filter-predictions`.

How to use it:

1. Choose a class. The histogram shows the durations of the signals of that class the model found.
2. Set the minimum and maximum — type the values or select a range directly on the histogram. An empty field means "no limit".
3. Check the preview: how many signals will stay and how many will be removed.
4. Run the filter.

The original `*_predicted.txt` file is not changed. The filtered result is written to a separate `*_predicted_filtered.txt` file, so you can always go back to the original data.

Note that the standard orcAI limits remove almost nothing — for most classes they only set a minimum of 0. For the filter to have any effect, set your own limits or apply the values recommended in the orcAI publication.
