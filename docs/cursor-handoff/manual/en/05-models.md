# Models

This section lists every model you can use: the ones bundled with the app and the ones trained in your project.

## Bundled models

- **`orcai-isl-v1`** — the main model, trained on a large set of recordings of Icelandic killer whales feeding on herring. You can use it as is or fine-tune it on data from another population.
- **`orcai-nor-v1`** — `orcai-isl-v1` fine-tuned on recordings of Norwegian killer whales.

Models you train yourself are stored in the project's `models/` folder, each in its own subfolder.

## What you can do with a model

Select a model in the table to see its description on the right: sound classes, spectrogram parameters and test results, if a test has been run.

- **Use** — make this the current model for predictions.
- **Fine-tune** — open the training wizard with this model as the starting point.
- **Test** — measure the model's quality on the project's test set. The project must already have prepared training data.
- **Import** — add a model from another folder to the project, for example one you received from colleagues.
- **Export** — copy the model to another folder to share it or keep a backup.
- **Open folder** — show the model files in Finder.

## Test results

After a test, two scores are shown for each class:

- **Precision** — the share of signals detected by the model that really belong to this class. Low precision means many false detections.
- **Recall** — the share of the real signals of this class that were found. Low recall means the model misses a lot.

## Compatibility

A model can only be applied to data prepared the same way as the data it was trained on: the same sound classes and the same spectrogram parameters. The app checks this automatically and will not let you select an incompatible model without a warning.
