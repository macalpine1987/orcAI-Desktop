# Home

Home is the app's start screen. This is where you turn on the computing components, see the state of the current project and jump straight to common tasks.

## Runtime

Before you can run predictions or train models, two parts of the app need to be running:

- **Sidecar (API)** — an internal service that passes commands from the interface to orcAI. It runs only on your computer and does not connect to the internet.
- **orcAI engine** — the neural network that does the computing, on the processor (CPU) or the graphics card (GPU).

Buttons:

- **Start** — turns both parts on.
- **Restart** — turns them fully off and on again. Useful if something stops responding.
- **Stop** — stops computing and drops unfinished jobs from the queue. Finished jobs stay in the list. The app window stays open.

When everything is ready, the lamps are green.

On macOS, closing the window (or pressing ⌘W) only hides the app: any running work continues in the background. To quit completely, press ⌘Q.

The choice between CPU and GPU is in **Settings → Runtime**. The engine restarts automatically when you change it.

## Current project

This card shows what the open project contains: how many recordings and annotations it has, how many recordings already have prediction results, and which model is selected. **Open folder** reveals the folder in Finder. **Go** opens **Projects** and does not change any files.

## Quick actions and recent jobs

Four cards open the current project: **Recognize recordings**, **Train Model**, **Filter predictions** and **View results**. Recent jobs are listed below; the full list is in **Tasks**.

## Data health warnings

The app can point out problems with project data: missing recordings or annotations, an outdated recordings table, or too few examples for training. These tips appear at the top of the window and never block anything.

They are off by default. Turn them on in **Settings → Interface → Data health warnings**.
