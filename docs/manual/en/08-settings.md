# Settings

Settings are split into two tabs: **Runtime** and **Interface**. Version information is under **Help → About**.

## Runtime

- **Start engine on launch** — start the runtime as soon as the app opens, without clicking **Start** on Home. Off by default.
- **Show spectrogram** — when off, the **Analysis** tab shows the detections table in place of the plot, with no playback bar. The class filter still opens from the **Classes** button.
- **Long recordings** — for recordings longer than 20 minutes the spectrogram is built only for the visible stretch. Prediction results are unchanged. The switch is available only while the spectrogram is on.
- **Neural network device** — processor (CPU) or graphics card (GPU). CPU is selected on first launch. The runtime restarts itself after a change.

The **Data** block:

- **Projects folder** — the folder the create wizard suggests by default. If none is set, the home folder is used.
- **Application data** and **Sidecar log** — the app's own files.
- **Spectrogram cache** — spectrogram tiles. **Clear** deletes them; recordings and projects are left as they are.
- **Reset application** — deletes the job history, the in-app project list, caches, the settings file and the sidecar log. Recording folders on disk, including trained models inside them, are not deleted. After a reset, open the project from its folder again.

## Interface

- **Language** — Russian or English. English is the default. Help switches along with the interface.
- **Data health warnings** — tips at the top of the window when the project is missing recordings or annotations, the recordings table is outdated, or there are too few snippets for training. Off by default.
- **Interface scale** — 100% or 125%.
- **Full screen** — open the app full screen. F11 toggles it at any time.
- **Default console** — **Collapsed** or **Expanded**. The console's own toggle saves the same choice.

A small layout on the right shows how the chosen scale looks on the Tasks screen.
