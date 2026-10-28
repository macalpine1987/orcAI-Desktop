# Troubleshooting

## The runtime does not start

1. On **Home**, click **Restart**.
2. Wait up to a minute: loading the neural network takes longer the first time.
3. If the lamps still do not turn green, open **Tasks** and check the **Errors** tab in the console.
4. If you moved the app to another computer, copy it in full. Everything it needs, including Python, is already inside; nothing else has to be installed.

## A prediction job failed

The most common causes are:

- the WAV file was moved or deleted after it was added to the project;
- the selected channel does not exist in the recording;
- the model does not match the project parameters;
- the disk is full.

Open the job in **Tasks**: the **Log** tab describes the error.

## The Snippets indicator is yellow

This means there are fewer snippets than the training settings require: each set needs the number of batches × the batch size.

If there are enough examples for at least one batch, training still starts — the app reduces the number of batches to what is available. The actual values are shown in the job log. For details, see the Training chapter, section "When there are not enough snippets".

To turn the indicator green:

- in step 4 of the wizard, enter the number of batches from the job log, or smaller;
- reduce the batch size;
- add more annotated recordings.

## Not enough disk space

Spectrograms and prepared training data take a lot of space. Delete unneeded outputs on the **Projects → Artifacts** tab or move the project to a drive with more free space.

## Training was interrupted

The best model saved before the stop remains in the project's `models/` folder. If you start training again with the same model name, that folder will be overwritten. To keep the result, give the new model a different name.

## Filtering removes almost nothing

The standard orcAI limits remove almost nothing. On the **Filtering** tab, set your own minimum and maximum durations or apply the values recommended in the orcAI publication.

## Parts of the interface do not fit on screen

Try a smaller scale in **Settings → Interface** or maximise the window. If controls are still cut off, let the developer know which section and scale it happens in.
