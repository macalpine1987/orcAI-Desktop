# Results

The **Results** section combines the signals from all recordings in the project in a single table. Use it to search across the project and to export data for analysis in other tools.

To view the signals of a single recording on the spectrogram, use the **Predictions → Analysis** tab.

## Data sources

At the top of the section, choose a data source:

| Source | Files |
|--------|-------|
| **Predicted** | Prediction results (`*_predicted.txt`) |
| **Filtered** | Results after filtering by duration (`*_predicted_filtered.txt`) |
| **Annotations** | Manual annotations (`annotations/*.txt`). Lets you compare the annotations with the model’s results |

The application only reads these files and never changes them.

## Summary figures

Above the table you see:

- the number of detected signals and the number of files they were found in;
- the total duration of the signals;
- the mean probability;
- the threshold used for recognition.

If a file cannot be read, the application shows a message.

## Table

You can filter the table by file, class, and minimum probability, and search for a recording by name. The probability filter does not apply to annotations, because manual annotations have no probabilities.

Clicking a row, or the **Open** button, takes you to the **Predictions → Analysis** tab at the selected signal on the spectrogram.

## Export

| Action | Result |
|--------|--------|
| **Export CSV** | Saves the visible table rows to a CSV file for Excel, R, or Python |
| **Export to Audacity** | Saves the visible rows as Audacity label tracks, one per recording |
