# Tasks

Every action that involves computing — predictions, filtering, training steps, model tests — becomes a job. Jobs run one after another, and all of them are listed in this section.

The Command column shows the orcAI command name (`predict`, `train` and so on), which makes it easy to match with the orcAI documentation.

## Job states

- **Queued** — the job is waiting for earlier jobs to finish.
- **Running** — the job is in progress; you can see how far along it is.
- **Done** — the job finished successfully.
- **Error** — the job failed. See the log for the reason.
- **Cancelled** — the job was stopped by hand.

## Console

The console at the bottom of the window shows details of the selected job. It has four tabs:

- **Log** — everything orcAI reported while it was running;
- **Inspector** — the parameters the job was started with;
- **Errors** — error messages only;
- **Command** — the exact orcAI command, which you can repeat in a terminal.

You can collapse the console when you do not need it.

## Managing jobs

- **Restart** — run the job again with the same parameters.
- **Stop** — interrupt a running job or remove a job from the queue. If the job belongs to a training plan, the following steps of that plan are cancelled too.
- You can save a job's log to a file.

By default, job history is kept between app sessions. You can turn this off in **Settings**.
