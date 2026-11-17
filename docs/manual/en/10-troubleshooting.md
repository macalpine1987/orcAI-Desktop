# Troubleshooting

## The runtime does not start

1. On the **Home** page, click **Restart**.
2. Wait up to a minute: on the first launch, loading the neural network takes longer.
3. If the indicators do not turn green, open the **Jobs** section and check the **Errors** tab in the console.
4. If you move the application to another computer, copy the whole application. Python and the other components are included, so you do not need to install anything separately.

## A recording cannot be added to a project

The application accepts WAV files in PCM format with a bit depth of 16 to 32 bits. Floating-point files and files with any other bit depth are rejected. A recording is also not added to the table if the file is damaged or its header does not specify a sampling rate: the application does not guess the rate.

## Predictions ended with an error

The most likely causes are:

- the WAV file was moved or deleted after it was added to the project;
- the selected channel does not exist in the recording;
- the model does not match the project parameters;
- the disk is out of free space.

The description of the error is on the **Log** tab in the **Jobs** section.

## The “Snippets” indicator is yellow

There are fewer snippets than the training settings require: each set needs at least `n_batch × batch size` snippets.

If there are enough examples for at least one batch, training will start: the application reduces the number of batches automatically. The adjusted values are shown in the task log. For details, see the “Training” chapter, section “If there are not enough snippets”.

To turn the indicator green, do one of the following:

- enter in wizard step 4 the number of batches from the task log, or a smaller number;
- reduce the batch size;
- add more annotated recordings.

## Not enough disk space

Spectrograms and prepared data take up a lot of space. Delete results you no longer need on the **Projects → Artifacts** tab, or move the project to a drive with more free space.

## Training was interrupted

The best model saved so far stays in the project’s `models/` folder. If you start training again with the same model name, that folder will be overwritten. To keep the result, give the new model a different name.

## Filtering excludes almost nothing

By default, the minimum is 0 and there is no maximum, so nothing is excluded. A row named after a class takes priority over the **default** row, even if the limits are the same. Set the durations you need on the **Filtering** tab. The **Example** button fills in the minimum values from the publication, and only for the classes of the built-in model.

## Interface elements do not fit on the screen

Reduce the scale in **Settings → Interface** or enlarge the window. If elements are still cut off, open an issue (see the section “Reporting a problem”) and say in which section and at which scale the problem occurs.

## Reporting a problem

Report problems with the application in the [Issues](https://github.com/macalpine1987/orcAI-Desktop/issues) section of the [orcAI Desktop](https://github.com/macalpine1987/orcAI-Desktop) repository on GitHub. In your report, include:

- the application version (**Help & About → About**) and your operating system;
- the section and the sequence of actions that led to the problem;
- for a problem in a task: the task log (**Export log** in the **Jobs** section) and the command from the **Command** tab.
