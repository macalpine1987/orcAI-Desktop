# Getting started

## What is orcAI Desktop

orcAI Desktop is a graphical interface for orcAI 3.0.4, a system that automatically detects killer whale sounds. From here you can create a project, run detection on recordings, review the results on a spectrogram and train your own model.

The original, unmodified orcAI runs underneath, so you get the same results as you would from the command line. If you need to repeat an action in the terminal or cite it in a paper, open the job's **Command** tab: it shows the exact `orcai` command the app ran.

## First launch

1. Open the app. The computing components are off at startup, so the app does not use memory until you need it.
2. On **Home**, click **Start**. The app turns on two parts: the Sidecar, an internal service the interface uses to talk to orcAI, and the orcAI engine — the neural network itself.
3. Wait until both lamps in the Runtime panel turn green. This usually takes from a few seconds to a minute.
4. Go to **Projects** and create a new project or open an existing one.

To start the components every time the app opens, turn on **Start engine on launch** under **Settings → Runtime**. The switch is off by default.

The ready-made models `orcai-isl-v1` and `orcai-nor-v1` are included with the app — there is nothing to download.

## Where to start

Most work follows one of two paths.

**Detect sounds in your recordings:**

1. **Projects** — add your WAV files.
2. **Predictions** — choose a model and start processing.
3. **Analysis** tab — review the detected signals on the spectrogram.
4. If needed, remove signals that are too short or too long on the **Filter** tab.

**Train your own model:**

1. **Projects** — create a project with the goal **Model training** or **Full cycle**, then add WAV files and `.txt` annotations whose names match the recordings.
2. **Training** — open the wizard and go through its five steps. Until there is at least one annotation, the wizard is unavailable; spectrograms on the board can be built before that.
3. **Models** — test the new model and start using it for predictions.

The **Results** section summarises the whole project, and **Tasks** keeps the history of every run.

## Language

Switch the interface and help language in **Settings → Interface**. Sound class names (`WHISTLE`, `BUZZ` and others), file names and orcAI commands are never translated, so they always match the orcAI documentation and scientific papers.

## The Help button

Every section has a **Help** button in the top-right corner. It opens the manual chapter for the screen you are on.

## License and authors

License information (CC BY-SA 4.0) and credits for orcAI Desktop and orcAI are on the **About** and **License** tabs. Third-party components are listed in the `THIRD_PARTY_LICENSES` file inside the app package.

## The Help section {#help-section}

The **Help** section in the sidebar has three tabs: **Manual** (this documentation), **About** and **License**.
