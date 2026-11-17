# Models

The **Models** section lists every model available in the project: the built-in ones and those you have trained.

## Built-in models

| Model | Description |
|-------|-------------|
| `orcai-isl-v1` | The primary model, trained on a large set of recordings of Icelandic killer whales hunting herring. Use it as is, or fine-tune it on data from another population |
| `orcai-nor-v1` | The `orcai-isl-v1` model, fine-tuned on recordings of Norwegian killer whales |

Models you train are stored in the project’s `models/` folder, each in its own subfolder.

## Working with a model

When you select a model in the table, its description appears on the right: the sound classes, the spectrogram parameters, and the test results (if a test has been run).

| Action | Description |
|--------|-------------|
| **Use** | Assigns the model for recognition and opens the **Parameters** tab |
| **Fine-tune** | Opens the training wizard with the selected model as the starting point. Available when the project goal is “Model training” or “Full cycle” and the project has at least one annotation |
| **Test** | Measures the model’s quality on the project’s test set. Requires TVT datasets to be ready. Unavailable if the project parameters do not match the model’s parameters |
| **Import** | Adds a model from another folder to the project, for example one you received from colleagues |
| **Export** | Copies a trained project model to another folder. Built-in models are part of the application and cannot be exported |
| **Open folder** | Opens the folder with the files of a project model. The folder of a built-in model cannot be opened |

## Test results

After a test, two measures are shown for each class:

- **Precision**: the share of the signals the model found that really belong to that class. Low precision means many false detections.
- **Recall**: the share of the real signals of the class that the model found. Low recall means the model misses many signals.

## Compatibility

A model is built for the classes and spectrogram parameters used when it was trained. If they differ from the project’s parameters, the application shows a warning. You can still assign such a model for recognition; only **Test** is unavailable, because it uses the project’s parameters.
