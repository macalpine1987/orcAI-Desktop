# Training Pipeline
In the **Training Pipeline** section you create your own recognition models from your recordings, either from scratch or starting from an existing model. The sequence of steps matches the sequence of orcAI commands in the terminal.

The section is available if the active project has the goal “Model training” or “Full cycle”. With the goal “Predictions”, the **Training Pipeline** item in the sidebar is visible but unavailable.

> **Important.** Training takes a lot of time and disk space: on a typical computer, from a few hours to a day, and the prepared data takes tens of gigabytes. You can minimize the application window (on macOS also hide with ⌘W); training continues in the background. On Windows, minimize for background work — ✕ / Alt+F4 quit the application. If you quit the application completely, training is interrupted.

## Key concepts

| Term | Definition |
|------|------------|
| Annotation | Manual labeling of a recording: the intervals in which a given sound is heard. The model learns from annotations; the more high-quality annotations you have, the better the model |
| Class | The code of a sound in the model parameters and label files, for example `WHISTLE` or `BUZZ`. Do not confuse it with the type, the readable name in the detection table (often taken from the label synonym) |
| Spectrogram | An image of sound: time runs along the horizontal axis and frequency along the vertical axis. The model learns from spectrograms, not from the raw sound wave |
| Snippet | A fixed-length piece of a spectrogram (4 s by default). One snippet is one training example |
| Train / val / test sets | Three parts of the snippet collection. The training set (train) is used for learning, the validation set (val) for monitoring progress, and the test set (test) for the final quality assessment. The validation and test sets are not used for learning |
| Epoch | One full pass of training |
| Batch | A group of snippets that the model processes in one step |

A full list of terms is in the “Glossary” chapter.

## Choosing how to train

| Task | Tool |
|------|------|
| Train a new model on your own data | **Training wizard**, scenario “Train a model from scratch” |
| Improve an existing model or adapt it to another population | **Training wizard**, scenario “Fine-tune an existing model”, or the **Fine-tune** button in the **Models** section |
| Repeat a single step or resume interrupted work | The **Pipeline** board |

For your first training run, use the wizard: it checks your data, fills in recommended parameter values, and runs all the steps in the right order.

## Preparing the data

Before training, make sure that:

1. The runtime is running on the **Home** page.
2. The project contains WAV recordings and annotation files for them: Audacity label text files in the `annotations/` folder. An annotation file must have the same name as its recording (`clip.wav` and `clip.txt`). Files named `*_predicted.txt` and `*_predicted_filtered.txt` do not count as annotations.
3. The recording table `recording_table.csv` exists. The application creates it automatically when you add recordings.

> **Important.** Until the project has at least one annotation file whose name matches a recording (including in a project with no WAV files), the **Training wizard** button is unavailable, both in the **Projects** section and on the **Pipeline** board.

> **For command-line users.** The “Spectrograms” step fails if the recording table has no suitable rows: there are no annotations, and the `-en` / `-enp` flags that allow unannotated recordings to be processed are not available in the interface.

If your annotations label sounds differently from the way the model names its classes (for example, `Buzz3` instead of `BUZZ`), do not rename the files. Define label synonyms in step 2 of the wizard instead. The wizard saves them to the `call_equivalences.json` file. Without this file, the `create-label-arrays` step fails, just as the orcAI command does without the `-ce` parameter.

## Training wizard {#wizard}

The wizard has five steps. You can go back at any step and change your settings.

### Step 1. Choose a scenario

- **Train a model from scratch.** The model learns only from your data. This requires a large volume of annotated recordings.
- **Fine-tune an existing model.** An existing model is refined on your data. This scenario suits smaller datasets, because a pretrained model adapts to new recordings faster. See the section “Fine-tuning”.

### Step 2. Data and classes

In this step you set:

- **Recording table** and **annotations folder**: the application detects them automatically.
- **Model classes**: the codes of the sounds the model will recognize. For each class, the wizard shows the number of examples in the annotations and the number of recordings that contain them. If there are very few examples, the model cannot learn the class; turn that class off or add more annotations.
- **Label synonyms**: the mapping between the labels used in annotations and the model’s classes. For example, if some annotators used the label `Buzz` and others used `Buzz3`, specify that both labels stand for the class `BUZZ`.

The **Save draft** button writes your current settings to the project parameter file.

### Step 3. Spectrograms and snippets

The parameters in this step determine how sound is converted into training examples. The defaults come from orcAI and suit killer whale recordings. Change them only if you have specific requirements.

> **Important.** Spectrogram parameters become part of the trained model. The model can only recognize recordings that were processed with the same parameters.

| Parameter | Default | Description |
|-----------|---------|-------------|
| Sampling rate | 48,000 Hz | The rate to which all recordings are converted |
| Window size (`nfft`) | 512 | A larger value gives finer frequency resolution and coarser time resolution |
| Window step (`n_overlap`) | 256 | The window shift in samples. It can be larger than the window size |
| Frequency range | 0–16,000 Hz | The part of the frequency range that the model analyzes |
| Brightness quantiles | 0.01 and 0.999 | The limits for normalizing spectrogram brightness; they reduce the influence of very loud and very quiet parts |
| Snippet length | 4 s | The length of one training example |
| Snippets per second | 3 | How often examples are cut. A higher value gives more examples and takes more disk space |
| Segment length | 200 s | A recording is processed in segments of this length |
| Empty snippet fraction | 0.99 | The share of snippets without labels that is discarded. Recordings contain far more empty stretches than sounds; without discarding, training would focus mostly on them |
| Train / val / test shares | 0.8 / 0.1 / 0.1 | How examples are divided among the sets. The shares must add up to 1 |

> **Note.** The parameter is called `n_overlap` in the parameter file, but it sets the window step (hop), not the amount of overlap.

At the bottom of the step, the wizard shows an estimate: the number of snippets that will be produced, the disk space the spectrograms will take, and the approximate preparation time.

### Step 4. Model and training

In this step you configure the neural network and the training process. The defaults match the settings from the orcAI publication that the built-in models were trained with. For your first training run, we recommend leaving them unchanged.

The **Restore defaults** button resets all parameters to their defaults, except the model name.

#### Main parameters

| Parameter | Default | Description |
|-----------|---------|-------------|
| Model name | `orcai-model` | The name of the folder where the model is saved. Choose a meaningful name, for example one that includes the location and year of the recordings |
| Architecture | `ResNetLSTM` | The type of neural network. `ResNetLSTM` is better at capturing how sound changes over time; `ResNet1DConv` is simpler and faster |
| Epochs | 30 | The maximum number of epochs. Training can finish earlier if quality stops improving |
| Batch size | 64 | The number of examples processed in one step. If you run out of memory, reduce the value to 32 |
| Learning rate | `1e-4` | How much the model changes in one step. If it is too high, training becomes unstable; if it is too low, training is very slow |

#### Network architecture parameters

These parameters rarely need to be changed.

| Parameter | Default | Description |
|-----------|---------|-------------|
| Convolution filters | 30, 40, 50, 60 | The number of features extracted at each level of the network |
| Kernel size (`kernel_size`) | 5 | The size of the spectrogram region processed at one time |
| Dropout | 0.3 | The share of neurons randomly switched off during training. It lowers the risk of overfitting, where the model memorizes examples instead of learning general patterns |
| LSTM layer size | 128 | The size of the network’s internal state, which accounts for earlier moments of the sound (`ResNetLSTM` only) |
| Initializers | `he_normal`, `glorot_uniform` | The methods used to set the network’s initial weights |

#### Training control

| Parameter | Default | Description |
|-----------|---------|-------------|
| Monitored metric | `val_MBA` | The share of correct answers on the validation set; classes without annotations in a recording are not counted. Progress is judged by this value, and the model with the best value is saved |
| Early stopping | 10 epochs | Training stops if quality has not improved for this many epochs in a row |
| Learning rate reduction | 3 epochs, ×0.5 | If quality does not improve for 3 epochs, the learning rate is halved. This helps the model settle closer to the optimum |
| Minimum learning rate | `1e-7` | The lower limit to which the learning rate can be reduced |
| Class weights | not set | The value `balanced` gives more weight to rare classes. Use it if the numbers of examples differ greatly between classes |
| Seed | 0 | The starting value of the random number generator. With the same data and the same seed, training results are reproducible |

#### Number of batches

The parameters `n_batch_train`, `n_batch_val`, and `n_batch_test` set the number of batches drawn from each set in one epoch. The defaults are 3,750, 375, and 375.

Each set needs at least `n_batch × batch size` snippets. With the defaults, the training set needs 3,750 × 64 = 240,000 snippets. If there are fewer, orcAI stops with an error. To avoid this in orcAI Desktop, use the automatic adjustment and the snippet calculator described below.

#### If there are not enough snippets

orcAI does not reduce the number of batches to fit your data. For that reason, orcAI Desktop makes the adjustment before the run:

1. Before splitting into sets and before training, the application counts the actual number of snippets in the training, validation, and test sets. The count is done the same way as in orcAI: after empty snippets have been discarded.
2. For each set, the number of snippets is compared with the number required (`n_batch × batch size`).
3. If there are fewer snippets than required, the number of batches is reduced to the largest value that fits whole: the number of snippets is divided by the batch size and rounded down.
4. The adjusted values are written to a temporary copy of the parameter file that orcAI receives. The project’s own parameter file is not changed.

**Example.** The batch size is 64, and 3,750 training batches are set in the parameters (240,000 snippets required). After empty snippets are discarded, 3,400 snippets remain in the training set. The application sets 3,400 ÷ 64 = 53 (the remainder of 8 is dropped), so 53 batches. The validation and test sets are recalculated in the same way.

If any set has too few snippets even for one batch, there is nothing to reduce, and orcAI stops with an error.

**The yellow “Snippets” indicator.** The indicator compares the number of snippets with the values in the project parameters, not with the adjusted copy. Yellow means that the parameters ask for more batches than your data can provide, and the application reduced them automatically. This is not an error, but in each epoch the model sees fewer examples than specified, so epochs are shorter.

To turn the indicator green, do one of the following:

- enter in step 4 the number of batches from the task log, or a smaller number (see below);
- reduce the batch size;
- add more annotated recordings.

**Where to see the adjusted values.** In the **Jobs** section, open the `create-tvt-snippet-tables` or `train` task and go to the **Log** tab. The log contains a line `Clamped n_batch_* to fit filtered snippet table` with the new values, for example `n_batch_train: 3750→53`.

**Snippet calculator.** The **Calculate…** button next to the “Batches per epoch” field in step 4 opens the calculator. It analyzes the project’s recordings and annotations in the same way orcAI does and shows, for each set:

- how many snippets were cut and how many of them contain sounds;
- how many snippets remain after empty snippets are discarded;
- how many snippets are required with the current settings;
- the maximum and the recommended number of batches.

If the snippet table has already been created with the same settings, the values are taken from it and are exact. Otherwise, the calculator gives an estimate and recommends a value with a 10% margin, because orcAI selects snippets at random. The **Apply recommended** button copies the values into the wizard. The calculator also warns about recordings shorter than one segment: orcAI skips such recordings entirely.

### Step 5. Review and start

The wizard checks your settings once more and shows the plan: the list of steps and the order in which they run. There are two ways to start:

- **Start training**: data preparation, model training, and a quality assessment on the test set;
- **Prepare data only**: preparation without training. Use it to check in advance that you have enough examples.

All steps are added to the **Jobs** section and run one after another.

### Unfiltered test

Step 5 has an **Unfiltered test (-tu)** checkbox. It adds a second evaluation on top of the standard model check, using data that is as close as possible to field recordings.

During data preparation, orcAI discards almost all snippets without labels (the “Empty snippet fraction” parameter in step 3). In a field recording there are far more empty stretches than sounds. The standard test leaves them out, so the quality estimate can look better than the model’s real-world performance.

The unfiltered test uses snippets from the test portion of the recordings without this cleanup, empty ones included. It gives a more realistic picture of how the model behaves on ordinary recordings, above all how often it produces false detections.

When the checkbox is on:

- orcAI also creates an unfiltered test set when it splits the data;
- after training, the model is evaluated on both sets, and the results are saved separately.

The standard test always runs; the checkbox adds a second one. In the adjacent field you can set the size of the unfiltered set (`-n_uts`). If the field is empty, orcAI uses its own default: as many snippets as in the training table. If there are fewer test snippets, orcAI takes all that are available and notes it in the task log.

Preparation and testing with this option take noticeably more time and disk space. Turn it on if the model will be used on long recordings and you want an early estimate of the false detection rate. For a first trial run, you can leave it off.

## Pipeline {#pipeline}

The **Pipeline** board shows the eight orcAI training steps and the state of each one. The state is determined from the files in the project folder: if you delete a step’s output, the board shows that the step needs to be run again.

### Step states

| State | Meaning |
|-------|---------|
| Not run | The step has not been started |
| Queued / running | The step is waiting in the queue or is running |
| Done | The output has been created; the button opens the folder with it |
| Outdated | Data or parameters have changed; we recommend running the step again |
| No data | The output of the previous step or the files required to start are missing |
| Error | The step failed; the cause is in the task log |

### Pipeline steps

| # | Step | orcAI command | Purpose |
|---|------|---------------|---------|
| 1 | Spectrograms | `create-spectrograms` | Converts recordings into spectrograms. The step that uses the most disk space |
| 2 | Label arrays | `create-label-arrays` | Converts annotations into labels the model can use, applying label synonyms |
| 3 | Snippet table | `create-snippet-table` | Determines where in the recordings the training examples will be cut |
| 4 | TVT tables | `create-tvt-snippet-tables` | Divides examples into training, validation, and test sets (TVT stands for train / val / test). At this step orcAI checks whether there are enough examples for the specified number of batches |
| 5 | TVT datasets | `create-tvt-data` | Builds the data on which the model is trained |
| 6 | Hyperparameter search | `hpsearch` | Optional step (see the section “Hyperparameter search”) |
| 7 | Training | `train` | Trains the model |
| 8 | Test | `test` | Evaluates quality on the test set |

You can run any step on its own once the previous ones are complete.

### Data readiness indicators

Several indicators are on the left of the board. Two of them relate to annotations.

**Annotations.**

- Green: at least one annotation with the same name as a WAV file was found.
- Yellow with the label “0 of N”: there are no such files (N is the number of loaded WAV files). While the indicator is yellow, the wizard and all steps from “Label arrays” onward do not start. The “Spectrograms” step fails when there are no suitable rows (see the section “Preparing the data”).

**Recordings without annotations.**

- Green: every WAV file has a matching `.txt` file.
- Yellow: shows how many recordings will be skipped, that is, WAV files without a matching annotation file. As long as at least one recording is annotated, you can run the pipeline steps; recordings without a `.txt` file are not included in training.

## Hyperparameter search {#hpsearch}

Hyperparameters are the settings of the network architecture: the number of filters, kernel size, dropout, and LSTM layer size. Hyperparameter search tries combinations of values and picks the one with which the model trains best.

The search takes a long time, often longer than training itself. You do not need it for a first training run: the defaults were chosen by the orcAI authors.

You can start a search in two ways:

- on wizard step 5 (Review and start), turn on **Tune hyperparameters** when training from scratch;
- run the “Hyperparameter search” step on the pipeline board.

The values it finds are used in training only if you choose that in the wizard. The project parameters are not changed.

The search runs sequentially by default. The parallel multi-GPU flag (`-pl`) is hidden in the Desktop UI; pass it via the orcAI CLI if needed.

## Fine-tuning {#finetune}

In fine-tuning, the model is not trained from scratch but continues training from an existing model. For example, you can adapt the Icelandic model `orcai-isl-v1` to killer whale recordings from another region. This is how the Norwegian model `orcai-nor-v1` was produced.

The parameters built into the original model cannot be changed:

- the set of classes and the network architecture;
- the spectrogram parameters and the snippet length.

You can change the name of the new model, the number of epochs, the learning rate, the number of batches, the class weights, and the data and label synonyms.

The wizard shows how many new examples you have for each class of the original model. If a class has no examples, it stays in the model but does not improve. A model that shares no class with the project’s annotations remains in the list, but you cannot select it.

> **Important.** Give the new model a name different from the original’s. Otherwise, the original model’s folder is overwritten.

## Training monitor {#monitor}

The **Monitor** button on the pipeline board becomes available when the “Training” step starts, and stays available if a snapshot of the previous run has been saved. While training is running, a green indicator lights on the button; before the step starts and after it stops, the indicator is off.

The monitor opens in a separate window that is independent of the main one. You can minimize or hide the main window (on macOS: close button or ⌘W; on Windows: minimize to the taskbar). The monitor window stays on the desktop. Closing the monitor window does not stop training. Quitting the application completely (on macOS: ⌘Q; on Windows: ✕ / Alt+F4 on the main window or Quit from the menu) stops the runtime and interrupts training.

During training, the monitor shows:

- the current epoch number and progress within it;
- the main quality metrics;
- a chart of the metrics by epoch.

Rising metrics on the validation set indicate that the model is learning. If the metrics stop improving, the learning rate is reduced automatically, and then training stops.

The **Stop** button interrupts training. The best model saved up to that point stays on disk. The **Open folder** button opens the folder with the model files.

## Disk space

Spectrograms and prepared data can take tens of gigabytes. Before resource-intensive steps, the application estimates the available free space and shows a warning if it is not enough. In that case, delete results you no longer need on the **Projects → Artifacts** tab, or move the project to another drive.

## Quick checklist

1. Start the runtime on the **Home** page.
2. Make sure the project has recordings and annotations.
3. Open the wizard and choose the scenario “Train a model from scratch” or “Fine-tune an existing model”.
4. Select the classes and, if needed, define label synonyms.
5. In steps 3 and 4, leave the defaults. If there are too few snippets, the application adjusts the number of batches automatically (see the section “If there are not enough snippets”).
6. Start training and follow it in the monitor.
7. When it finishes, evaluate the model in the **Models** section and assign it for recognition.
