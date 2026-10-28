# Glossary

## Terms

| Term | Meaning |
|------|---------|
| Annotation | A manual label for a recording: where each sound occurs. Stored as an Audacity label text file |
| Batch | The group of training examples the model processes in one step |
| Call equivalences | A mapping between the labels in your annotations and the model classes |
| Class | A type of sound the model detects, such as `WHISTLE` |
| Epoch | One full training cycle |
| Fine-tuning | Continuing to train an existing model on new data |
| Hyperparameters | Settings of the network design: number of filters, kernel size, dropout and others |
| Pipeline | The sequence of eight steps the data goes through during training |
| Snippet | A short, fixed-length piece of a spectrogram — one training example |
| Spectrogram | A picture of sound: time horizontally, frequency vertically, brightness for loudness |
| Threshold | The minimum model confidence for a signal to be included in the results |
| Train / val / test sets | Three parts of the data: for learning, for monitoring during training, and for the final evaluation |

## App sections and orcAI commands

| App section | orcAI command | Files |
|-------------|---------------|-------|
| Predictions | `predict` | `*_predicted.txt` |
| Filtering | `filter-predictions` | `*_predicted_filtered.txt`, `call_duration_limits.json` |
| Training | `train` and the preparation steps | `models/<name>/` |
| Fine-tuning | `train` with a base model | `models/<name>/` |
| Model test | `test` | test results in the model folder |
| Creating a project | `init` | `*_orcai_parameter.json` |
| Recordings table | `create-recording-table` | `recording_table.csv` |
| Call equivalences | used by `create-label-arrays` | `call_equivalences.json` |

## Sound classes

Class names are not translated, so they are easy to match with the publications. The app's tables show a plain-language name next to each class.

| Class | Name in the app | Sound |
|-------|-----------------|-------|
| `WHISTLE` | whistles | whistles |
| `BUZZ` | buzzing | buzzes — series of very rapid clicks |
| `PHS` | prey handling sounds | sounds made while handling prey |
| `SS` | pulsed calls | pulsed calls |
| `BR` | breathing | breathing |
| `HERDING` | herding calls | calls made while herding prey |
| `TAILSLAP` | tail slaps | tail slaps on the water |

The exact set of classes depends on the model — you can see it in the model description in **Models**.
