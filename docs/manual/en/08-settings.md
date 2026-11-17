# Settings

Settings are split into two tabs: **Runtime** and **Interface**. The application version is shown in **Help & About → About**.

## Runtime

| Setting | Description | Default |
|---------|-------------|---------|
| **Start engine on launch** | Starts the runtime when the application opens, so you do not need to click **Start** on the **Home** page | Off |
| **Show spectrogram** | When this is off, the **Analysis** tab shows the detection table at full height instead of the spectrogram, with no playback bar. The class filter is still opened with the **Classes** button | On |
| **Long recordings** | For recordings longer than 20 minutes, the spectrogram is rendered only for the visible section. Recognition results are not affected. Available only when **Show spectrogram** is on | Off |
| **Neural network device** | The computing device: central processor (CPU) or graphics card (GPU). The runtime restarts automatically after you change the device | CPU |

> **Note.** **Show spectrogram** and **Long recordings** are on the **Runtime** tab (not **Interface**), even though they affect how the **Analysis** tab is displayed.

### Data

| Setting | Description |
|---------|-------------|
| **Projects directory** | The folder offered by default when you create a project. If it is not set, the user’s home folder is used |
| **Application data**, **Sidecar log** | Internal application files |
| **Spectrogram cache** | Saved pieces of spectrogram images. The **Clear** button deletes the cache; recordings and projects are not affected |
| **Reset application** | Deletes the task history, the application’s list of projects, caches, the settings file, and the Sidecar log. Project folders on disk, including recordings and trained models, are not deleted. After a reset, open your project again from its folder |

> **Important.** **Reset application** cannot be undone for the data listed above. Before you reset, make sure you no longer need your task history.

## Interface

| Setting | Description | Default |
|---------|-------------|---------|
| **Language** | Russian or English. The help language switches together with the interface language | English |
| **Show tips** | Tips in the window header: not enough recordings or annotations, the recording table is out of date, not enough snippets for training | Off |
| **Interface scale** | 100% or 125% | 100% |
| **Full screen** | Opens the application in full screen. You can toggle full screen at any time with the F11 shortcut | Off |
| **Default console state** | The console state when the application opens: **Collapsed** or **Expanded**. The same choice is saved when you toggle the console itself | Collapsed |

A mini layout on the right shows how the selected scale looks on the Jobs screen.
