# Results

This section gathers every signal found in every recording of the project into a single table. Search signals across the project here and export them for further analysis.

## Data sources

Choose what to show at the top:

- **Predicted** — prediction results (`*_predicted.txt` files);
- **Filtered** — results after duration filtering (`*_predicted_filtered.txt`);
- **Annotations** — your manual labels (`annotations/*.txt`). You can compare them with what the model found.

The app only reads these files and never changes them.

## Summary

The figures above the table show how many signals were found and in how many files, their total duration, the mean probability and the threshold used for prediction. If a file could not be read, the app tells you.

## Table

You can filter the table by file, class and minimum probability, and search for a recording by name. The probability filter does not apply to annotations, since manual labels have none.

Clicking a row or **Open** takes you to **Predictions → Analysis**, right to that signal on the spectrogram.

## Export

- **Export CSV** — saves the rows currently visible in the table to a file for Excel, R or Python.
- **Export to Audacity** — saves the visible rows as Audacity label tracks, one per recording.
