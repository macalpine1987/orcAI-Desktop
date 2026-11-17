# Glossary

## Terms

| Term | Definition |
|------|------------|
| Annotation | Manual labeling of a recording: where and which sound is heard. Stored in an Audacity label text file |
| Batch | A group of training examples that the model processes in one step |
| Class | The code of a sound in the model parameters and label files, for example `WHISTLE`. Not to be confused with the type |
| Epoch | One full pass of model training |
| Fine-tuning | Continuing the training of an existing model on new data |
| Hyperparameters | Settings of the neural network architecture: the number of filters, kernel size, dropout, and others |
| Label synonyms | The mapping between the labels in annotations (`.txt`) and the model’s classes. Stored in the `call_equivalences.json` file |
| Pipeline | The sequence of eight steps that data passes through during training |
| Snippet | A fixed-length piece of a spectrogram; one training example |
| Spectrogram | An image of sound: time on the horizontal axis, frequency on the vertical axis, and brightness corresponding to loudness |
| Threshold | The minimum probability at which a signal is written to the label file |
| Train / val / test sets (TVT) | Three parts of a dataset: training (train), validation (val, used to monitor progress during training), and test (test, used for the final assessment) |
| Type | The readable name of a signal in the detection table (often taken from the label synonym). Not to be confused with the class |
| Window step (`n_overlap`) | The number of samples by which the FFT window advances. In the parameter file the name is `n_overlap`, but it is a hop (step), not a share of overlap. It can be larger than the window size (`nfft`) |
| `val_MBA` | The share of correct answers on the validation set. Classes without annotations in a recording are not counted. Training progress is tracked with this metric, and the best model is saved by it |

## Application sections and orcAI commands

| Application section | orcAI command | Files |
|---------------------|---------------|-------|
| Predictions | `predict` | `*_predicted.txt` |
| Filtering | `filter-predictions` | `*_predicted_filtered.txt`, `*_call_duration_limits.json` |
| Training Pipeline | `train` and the preparation steps | `models/<name>/` |
| Fine-tuning | `train` with the original model | `models/<name>/` |
| Model test | `test` | Test results in the model folder |
| Project creation | `init` | `*_orcai_parameter.json` |
| Recording table | `create-recording-table` | `recording_table.csv` |
| Label synonyms | Used by the `create-label-arrays` step | `call_equivalences.json` |

## Sound classes

Class names are not translated, so that you can match them with the publications. In the application’s tables, the type, a readable label, is shown next to the class.

| Class | Type in the application | Sound |
|-------|-------------------------|-------|
| `WHISTLE` | whistles | Whistles |
| `BUZZ` | buzzing | Echolocation click trains |
| `PHS` | prey handling sounds | Sounds made while eating prey |
| `SS` | pulsed calls | Discrete (pulsed) calls |
| `BR` | breathing | Breathing at the surface |
| `HERDING` | herding calls | Low-frequency call made before striking a school of fish |
| `TAILSLAP` | tail slaps | Underwater tail slaps |

The exact set of classes depends on the model. You can see it in the model description in the **Models** section.
