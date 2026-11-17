# Home

The **Home** page is the start screen of the application. From here you start the runtime, check the state of the current project, and jump to the main operations.

## Runtime

Two components are required to recognize recordings and train models:

- **Sidecar (API)**: a helper process through which the interface sends commands to orcAI. It runs only on your computer and does not connect to the internet.
- **orcAI engine**: the process in which orcAI performs its computations on the central processor (CPU) or the graphics processor (GPU).

Buttons in the “Runtime” block:

| Button | Action |
|--------|--------|
| **Start** | Starts both components |
| **Restart** | Stops both components and starts them again. Use it if the runtime stops responding |
| **Stop** | Stops computations and removes unfinished tasks from the queue. Completed tasks stay in the list. The application window stays open |

Green indicators mean the runtime is ready.

> **Note (shell).** On macOS, the close button or ⌘W only hides the window: computations keep running in the background; quit fully with ⌘Q. On Windows, minimize the window to keep computations running; closing the window (✕ or Alt+F4) quits the application and stops the runtime.

Select the computing device (CPU or GPU) in **Settings → Runtime**. The engine restarts automatically after you change the device.

## Current project

The current project card shows:

- the number of recordings and annotations;
- the number of recordings that have recognition results;
- the selected model.

The **Open folder** button opens the project folder in your file manager (Finder on macOS, File Explorer on Windows). The **Go to project** button opens the **Projects** section; it does not change any project files.

## Quick actions and recent tasks

Four quick-action cards lead to operations on the current project:

- **Recognize recordings**;
- **Train a model**;
- **Filter**;
- **View results**.

The cards are unavailable when no project is selected. Recent tasks are listed below the cards. The full list is in the **Jobs** section, which also requires a selected project.

## Tips

The application can show tips in the window header when project data is incomplete or out of date:

- not enough recordings or annotations;
- the recording table is out of date;
- not enough snippets for training.

Tips are informational and do not restrict your work. They are off by default; to turn them on, go to **Settings → Interface → Show tips**.
