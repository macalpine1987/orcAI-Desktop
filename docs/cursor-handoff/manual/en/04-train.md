# Training

In this section you can train your own detection model on your recordings — either from scratch or starting from an existing model. The app runs the same steps as orcAI on the command line, but spares you editing configuration files by hand and helps you avoid mistakes with the parameters.

Training takes time and disk space: on an ordinary computer it can last from several hours to a day. The app must stay open the whole time.

## Key concepts

A few terms used throughout this section:

- **Annotations** — your manual labels: where in a recording each sound occurs. The model learns from them. The more good-quality annotations you have, the better the result.
- **Classes** — the types of sound the model should tell apart, such as `WHISTLE` or `BUZZ`.
- **Spectrogram** — a picture of sound: time runs horizontally and frequency vertically. The model "looks" at spectrograms rather than at the raw audio.
- **Snippet** — a short, fixed-length piece of a spectrogram (4 seconds by default). One snippet is one training example.
- **Training, validation and test sets** (train / val / test) — the snippets are split into three parts. The model learns from the first, the app tracks progress on the second, and the third is used at the end to measure quality. The model never sees validation and test examples during training, so the evaluation is fair.
- **Epoch** — one full training cycle.
- **Batch** — the group of snippets the model processes in one step.

## Where to start

There are three ways to start training:

| Goal | What to use |
|------|-------------|
| Train a new model on your own data | **Training wizard**, "Train from scratch" |
| Improve an existing model or adapt it to another population | **Training wizard**, "Fine-tune existing model", or **Fine-tune** in **Models** |
| Repeat a single step or continue interrupted work | The **Pipeline** board |

If this is your first time, start with the wizard. It checks your data, fills in proven parameter values and runs all the steps in the right order.

## Preparing your data

Before you start, make sure that:

1. The runtime is running on **Home**.
2. The project contains WAV recordings and their annotation files (Audacity label text files in the `annotations/` folder).
3. The recordings table `recording_table.csv` exists — the app creates it automatically when you add recordings.

If your annotations name the sounds differently from the model classes (for example `Buzz3` instead of `BUZZ`), do not rename anything by hand — set up **call equivalences** in step 2 of the wizard.

## Training wizard {#wizard}

The wizard has five steps. You can go back to any step and change its settings.

### Step 1 · What we do

Choose a scenario:

- **Train from scratch** — the model learns only from your data. This requires a large amount of annotated recordings.
- **Fine-tune existing model** — an existing model is used as the starting point and your data refines it. This works well when you have less data: the trained model already "knows" a lot and adapts faster. See "Fine-tuning" below.

### Step 2 · Data and classes

Here you specify:

- **Recordings table** and **annotations folder** — the app usually finds them on its own.
- **Model classes** — which sound types the model will detect. For each class you can see how many examples were found in the annotations and in how many recordings. If a class has very few examples, the model will not be able to learn it — disable the class or add more annotations.
- **Call equivalences** — how the labels in your annotations map to the model classes. For example, if some annotators wrote `Buzz` and others `Buzz3`, specify that both mean `BUZZ`.

**Save draft** writes the current settings to the project parameter file, which is handy if you want to continue later.

### Step 3 · Spectrograms and snippets

These parameters define how sound is turned into training examples. The defaults come from orcAI and suit killer whale recordings. Change them only if you know why.

Important: after training, these settings become part of the model. The model can then only be used on recordings processed with the same parameters.

| Parameter | Default | What it means |
|-----------|---------|---------------|
| Sampling rate | 48,000 Hz | All recordings are converted to this rate |
| Window size (`nfft`) | 512 | Larger values separate frequencies better but blur moments in time |
| Window overlap | 256 | Usually half the window size |
| Frequency range | 0–16,000 Hz | Which part of the audio range the model analyses |
| Brightness quantiles | 0.01 and 0.999 | How spectrogram brightness is normalised; protects against very loud and very quiet passages |
| Snippet duration | 4 s | Length of one training example |
| Snippets per second | 3 | How often examples are cut; more means more examples but also more disk space |
| Segment duration | 200 s | Recordings are processed in chunks of this length |
| Fraction of empty snippets to remove | 0.99 | How many fragments without any sound to discard. Recordings are usually mostly silence, and without this setting the model would learn mainly from it |
| Train / val / test shares | 0.8 / 0.1 / 0.1 | How examples are split between the sets; they must add up to 1 |

At the bottom of the step the wizard estimates how many snippets you will get, how much space the spectrograms will take and roughly how long preparation will last.

### Step 4 · Model and training

This step configures the neural network and the training process. The defaults match the settings from the orcAI publication that were used to train the bundled models, including a kernel size (`kernel_size`) of 5 and a dropout of 0.3. For your first training, it is best to leave them as they are.

**Restore defaults** resets all values to their defaults without touching the model name.

**Main parameters:**

| Parameter | Default | What it means and when to change it |
|-----------|---------|-------------------------------------|
| Model name | `orcai-model` | The name of the folder the model is saved to. Choose something meaningful, such as the location and year of the recordings |
| Architecture | `ResNetLSTM` | The network design. `ResNetLSTM` better captures how sound changes over time; `ResNet1DConv` is simpler and faster |
| Epochs | 30 | The maximum number of training cycles. Training may stop earlier if quality stops improving |
| Batch size | 64 | How many examples are processed in one step. If you run out of memory, reduce it to 32 |
| Learning rate | `1e-4` | How much the model changes per step. Too high makes training unstable, too low makes it very slow |

**Network design parameters** (no need to change them without a reason):

| Parameter | Default | What it means |
|-----------|---------|---------------|
| Convolution filters | 30, 40, 50, 60 | How many features the network extracts at each level |
| Kernel size (`kernel_size`) | 5 | The size of the spectrogram patch the network looks at in one go |
| Dropout | 0.3 | The share of neurons randomly switched off during training. It keeps the model from memorising examples instead of generalising |
| LSTM units | 128 | How much "memory" the network has of earlier moments in the sound (`ResNetLSTM` only) |
| Initialisers | `he_normal`, `glorot_uniform` | The starting values of the network weights |

**Controlling the training run:**

| Parameter | Default | What it means |
|-----------|---------|---------------|
| Monitored metric | `val_MBA` | The validation-set score used to judge progress. The best model by this score is saved |
| Early stopping | 10 epochs | If quality has not improved for this many epochs, training stops |
| Learning-rate reduction | 3 epochs, ×0.5 | If quality has not improved for 3 epochs, the learning rate is halved. This helps fine-tune the model more precisely |
| Minimum learning rate | `1e-7` | The learning rate never drops below this value |
| Class weights | none | If some sounds are far more common in your data than others, choose `balanced` so rare classes get more weight |
| Seed | 0 | With the same seed and data, training results can be reproduced |

**Number of batches** (`n_batch_train`, `n_batch_val`, `n_batch_test`) — how many batches are taken from each set per epoch. The defaults are 3,750, 375 and 375.

This is the most common source of problems. Each set needs roughly `n_batch × batch_size` snippets: with the defaults that is 240,000 training examples. If you have less data, orcAI stops with an error. To avoid this:

- watch the Snippets indicator on the pipeline board: yellow means there are not enough examples;
- reduce the number of batches — for example, tenfold if you have few recordings;
- add more annotated recordings.

If you have fewer examples than requested, the app can often adjust the settings on its own — see the next section.

### When there are not enough snippets

orcAI itself cannot adapt the number of batches to the amount of data: if there are fewer snippets than requested, it stops with an error. That is why orcAI Desktop does it for you.

**How it works:**

1. Before splitting into sets and before training, the app counts how many snippets each set actually has — training, validation and test. It counts the same way orcAI does: after empty fragments have been discarded.
2. For each set it compares that stock with what was requested: number of batches × batch size.
3. If there are fewer snippets, the number of batches is reduced to the largest whole number that fits: the stock divided by the batch size, rounded down.
4. The reduced values are written to a temporary copy of the parameter file, and orcAI receives that copy. The project parameter file is not changed.

**Example.** The batch size is 64 and 3,750 training batches are requested, so 240,000 snippets are needed. If 3,392 snippets remain in the training set after empty fragments are discarded, the app sets 3,392 ÷ 64 = 53 batches. The validation and test sets are recalculated the same way.

If a set does not have enough snippets for even one batch, there is nothing left to reduce, and orcAI stops with an error.

**Why the Snippets indicator is yellow while training runs.** The indicator compares the stock with the values in the project parameters, not with the reduced copy. Yellow means that more was requested than is available and the app adjusted the settings itself. This is not an error. But the model sees fewer examples per epoch than you specified, so epochs are short.

**How to see the actual values.** In **Tasks**, open the split job (`create-tvt-snippet-tables`) or the training job (`train`) and go to the **Log** tab. It contains the line `Clamped n_batch_* to fit filtered snippet table` with the new values, for example `n_batch_train: 3750→53`.

**Snippet calculator.** Rather than choosing the number of batches by hand, click **Calculate…** next to the "Batches per epoch" field in step 4. The calculator goes through the project's recordings and annotations the same way orcAI does and shows, for each set:

- how many snippets will be cut and how many of them contain sounds;
- how many will remain after empty fragments are discarded;
- how many the current settings require;
- the maximum and the suggested number of batches.

If the snippet table has already been created with the same settings, the numbers come straight from it and are exact. Otherwise the calculator gives an estimate and suggests a value with a 10% margin, because orcAI picks fragments at random. **Apply suggested** fills the values into the wizard. The calculator also warns about recordings shorter than one segment — orcAI skips them entirely.

**How to turn the indicator green:**

- use the calculator, or enter the values from the job log (or smaller ones) as the number of batches in step 4 of the wizard;
- or add more annotated recordings — you will then have more real examples and the model will train better.

### Step 5 · Review and launch

The wizard checks the settings once more and shows the plan: which steps will run and in what order.

- **Start training** — prepares the data, trains the model and evaluates it on the test set.
- **Data preparation only** — prepares the data without training. Useful if you first want to make sure there are enough examples.

All steps go to **Tasks** and run one after another.

### Unfiltered test

This step has an **Unfiltered test (-tu)** checkbox. It adds a second evaluation of the model, on data closer to real recordings.

Why it matters. When preparing data, orcAI discards almost all fragments without killer whale sounds (the "fraction of empty snippets to remove" parameter in step 3). As a result, the regular test set contains far more sounds than real recordings, which are full of silence and noise. On such "convenient" data the model can look better than it will perform in practice.

The unfiltered test takes fragments from the test part of the recordings without this clean-up, with their natural share of silence. It gives a more accurate picture of how the model will behave on ordinary recordings — especially how often it detects a sound where there is none.

What happens when the checkbox is on:

- when the sets are split, orcAI also creates an unfiltered test set;
- after training, the model is evaluated on both sets, and the results are saved separately.

The regular test always runs; the checkbox only adds a second one. By default the unfiltered set is the same size as the training set, so preparation and testing take noticeably more time and disk space. If there are fewer test fragments than that, orcAI uses as many as are available and notes this in the job log.

Turn the checkbox on if you plan to apply the model to long recordings and want to estimate false detections in advance. For a first trial run you can leave it off.

## Pipeline {#pipeline}

The pipeline board shows all eight orcAI training steps and their current state. The state is determined from the files in the project folder, so if you delete the output of a step, the board notices and offers to run the step again.

Step states:

| State | Meaning |
|-------|---------|
| Not run | The step has not been run yet |
| Queued / running | The step is waiting for its turn or running right now |
| Done | The output exists; the button opens its folder |
| Outdated | The data or parameters have changed; the step should be run again |
| Error | The step failed; the reason is in the job log |

The steps in order:

1. **Spectrograms** (`create-spectrograms`) — turns recordings into spectrograms. This step needs the most disk space.
2. **Label arrays** (`create-label-arrays`) — converts annotations into labels the model understands, taking call equivalences into account.
3. **Snippet table** (`create-snippet-table`) — decides where training examples will be cut from the recordings.
4. **Train / val / test split** (`create-tvt-snippet-tables`) — divides the examples into training, validation and test sets. At this step orcAI checks that there are enough examples for the requested number of batches.
5. **Datasets** (`create-tvt-data`) — prepares the data in the format the model trains from.
6. **Hyperparameter search** (`hpsearch`) — an optional step, see below.
7. **Training** (`train`) — the model training itself.
8. **Test** (`test`) — measures quality on the test set.

You can run each step on its own, but only after the previous steps are done.

## Hyperparameter search {#hpsearch}

Hyperparameters are the settings of the network design: the number of filters, kernel size, dropout and LSTM size. The search tries different combinations and finds the one with which the model learns best.

The search takes a long time — often longer than training itself. You do not need it for your first model: the defaults have already been chosen by the orcAI authors.

You can run the search in two ways: enable it in the wizard when training from scratch, or run the **Hyperparameter search** step on the pipeline board. The values found are applied to training only if you chose this in the wizard. The saved project parameters are not overwritten.

## Fine-tuning {#finetune}

In fine-tuning, the model does not start from zero but continues learning from an already trained one. This way you can, for example, adapt the Icelandic model `orcai-isl-v1` to recordings of killer whales from another region. The Norwegian model `orcai-nor-v1` was made exactly like this.

What cannot be changed, because it is built into the original model:

- the set of classes and the network architecture;
- the spectrogram parameters and snippet duration.

What you can change: the new model's name, number of epochs, learning rate, number of batches, class weights, as well as the data and call equivalences.

The wizard shows how many new examples there are for each class of the original model. A class with no new examples stays in the model but will not improve.

Give the new model a different name from the original one, otherwise the original model's folder will be overwritten.

## Training monitor {#monitor}

During training, the monitor shows how things are going:

- the current epoch and progress within it;
- the main quality scores;
- a chart of the scores over the epochs.

If the validation scores are going up, the model is learning. If they stop improving, the app first lowers the learning rate and then stops training.

**Stop** interrupts training. The best model saved up to that point stays on disk. **Open folder** shows the model files.

## Disk space

Spectrograms and prepared datasets can take tens of gigabytes. Before heavy steps the app estimates whether there is enough space and warns you if there is not. If space is short, delete unneeded outputs on the **Projects → Artifacts** tab or move the project to another drive.

## Quick checklist

1. Start the runtime on **Home**.
2. Check that the project has recordings and annotations.
3. Open the wizard and choose "Train from scratch" or "Fine-tune existing model".
4. Select the classes and set up call equivalences if needed.
5. Keep the defaults in steps 3 and 4. If you have little data, reduce the number of batches.
6. Start training and follow it in the monitor.
7. When it finishes, test the model in **Models** and start using it in **Predictions**.
