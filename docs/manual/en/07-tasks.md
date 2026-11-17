# Jobs
Predictions, filtering, the training steps, and model testing run as tasks, one at a time, in queue order. The **Jobs** section shows the tasks of the active project.

The “Command” column shows the name of the orcAI command (`predict`, `train`, and so on), which makes it easier to match a task with the orcAI documentation.

## Task states

| State | Meaning |
|-------|---------|
| Queued | The task is waiting for earlier tasks to finish |
| Running | The task is running; the completion percentage is shown |
| Done | The task finished successfully |
| Error | The task failed; the cause is in the log |
| Canceled | The task was stopped manually |

## Console

The console at the bottom of the window shows details about the selected task. It has four tabs:

| Tab | Contents |
|-----|----------|
| **Log** | All orcAI messages received while the task ran |
| **Inspector** | The parameters the task was started with |
| **Errors** | Error messages only |
| **Command** | The exact orcAI command, which you can repeat in a terminal |

You can collapse the console to free up screen space.

## Managing tasks

| Action | Description |
|--------|-------------|
| **Cancel** | Interrupts a running task. If the task is part of a training plan, the remaining steps of the plan are removed as well |
| **Delete** | Removes a task that has not started yet from the queue. For a step in a plan, the following steps are removed too |
| **Retry** | Runs a failed task again |
| **Open** | Opens the result file of a completed task |
| **Export log** | Saves the log of the selected task |
| **Clear** | Deletes the task history. Running tasks are canceled |

Completed tasks are kept between application launches. Unfinished tasks are removed when you quit the application or click **Stop** on the **Home** page. Minimizing the window (on macOS also hiding with ⌘W) keeps the queue running; on Windows, minimize for background work — ✕ / Alt+F4 quit the application and clear unfinished tasks.
