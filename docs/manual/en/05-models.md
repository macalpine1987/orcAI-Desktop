# Models

This section lists every model you can use: the ones bundled with the app and the ones trained in your project.

## Bundled models

- **`orcai-isl-v1`** — the main model, trained on a large set of recordings of Icelandic killer whales feeding on herring. You can use it as is or fine-tune it on data from another population.
- **`orcai-nor-v1`** — `orcai-isl-v1` fine-tuned on recordings of Norwegian killer whales.

Models you train yourself are stored in the project's `models/` folder, each in its own subfolder.

## What you can do with a model

Select a model in the table to see its description on the right: sound classes, spectrogram parameters and test results, if a test has been run.

- **Use** — assign the model for predictions and open the **Settings** tab there.
- **Fine-tune** — open the training wizard with this model as the starting point. The button is available when the project goal is **Model training** or **Full cycle** and the project has at least one annotation.
- **Test** — measure the model's quality on the project's test set. The project must already have TVT datasets. If the project parameters do not match the model, Test is unavailable.
- **Import** — add a model from another folder to the project, for example one you received from colleagues.
- **Export** — copy a model trained in the project to another folder. Bundled models are already in the app and are not exported.
- **Open folder** — show the project model's files. The folder of a bundled model inside the app does not open.

## Test results

After a test, two scores are shown for each class:

- **Precision** — the share of signals detected by the model that really belong to this class. Low precision means many false detections.
- **Recall** — the share of the real signals of this class that were found. Low recall means the model misses a lot.

## Compatibility

A model expects the same classes and the same spectrogram parameters it was trained with. If they differ from the project, the app warns you. You can still assign the model for predictions. Only **Test** is blocked: it reads the project parameters.
