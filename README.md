# typed-tasks

A type-safe task scheduling abstraction for Google Cloud Tasks with Firebase,
including automatic queue configuration and smart deduplication.

## Features

- **Type-safe task scheduling**: Full TypeScript support for schedulers and
  handlers
- **Runtime validation**: Schema validation using Zod prevents invalid payloads
- **Smart deduplication**: Multiple strategies for preventing duplicate task
  execution
- **Delayed execution**: Schedule tasks to run in the future with time windows
- **Individual queue configuration**: Each task gets its own dedicated queue
- **Global defaults**: Configure your own library-wide defaults with per-queue
  overrides
- **Automatic queue creation**: Queues are created automatically as needed
- **Simplified error handling**: Built-in validation and graceful error handling

## Quick Start

1. Define your task schemas with Zod
2. Create a Cloud Tasks client
3. Initialize the typed Tasks with your schemas
4. Create type-safe task handlers and schedulers

```typescript
import { CloudTasksClient } from "@google-cloud/tasks";
import { createTypedTasks } from "@repo/typed-tasks";
import { z } from "zod";

// 1. Define your task schemas
const taskDefinitions = {
  sendNotification: z.object({
    userId: z.string(),
    message: z.string(),
  }),
};

// 2. Create Cloud Tasks client
const tasksClient = new CloudTasksClient();

// 3. Initialize typed Tasks
const tasks = createTypedTasks({
  tasksClient,
  taskDefinitions,
  projectId: "your-gcp-project-id",
  region: "us-central1",
});

// 4a. Schedule a task
await tasks.createScheduler("sendNotification")({
  userId: "123",
  message: "Welcome to the platform!",
});

// 4b. Create a handler
export const handleSendNotification = tasks.createHandler({
  queueName: "sendNotification",
  handler: async (data) => {
    // data is fully typed based on the schema
    console.log(`Sending notification to ${data.userId}: ${data.message}`);
  },
});
```

## Installation

```bash
npm install @repo/typed-tasks
```

## Peer Dependencies

This package has the following peer dependencies:

- `@google-cloud/tasks`
- `firebase-functions`
- `zod`

## Usage

### Task Definition

First, define your task schemas and options in a centralized location:

```typescript
import { z } from "zod";

/**
 * Define task schemas with type safety
 *
 * At the moment, task definitions keys MUST be camelCase.
 *
 * - GCP Cloud Tasks does not allow underscores (_) in queue names
 * - JavaScript doesn't allow hyphens (-) in variable names
 *
 * Your exported handler function name determines the queue name in GCP, and we
 * need to link them to these definitions, so only camelCase is supported.
 *
 * Task definitions can take two forms:
 *
 * 1. A direct Zod schema
 * 2. An object with schema and optional scheduler options
 */
export const taskDefinitions = {
  // Option 1: Just provide the schema directly
  sendNotification: z.object({
    userId: z.string(),
    message: z.string(),
    type: z.enum(["info", "warning", "error"]),
  }),

  // Option 2: Provide an object with schema and scheduler options
  syncDeviceTokens: {
    schema: z.object({
      userId: z.string(),
      force: z.boolean().optional(),
    }),
    options: {
      // Configure a 30-seconds deduplication window
      deduplicationWindowSeconds: 30,
    },
  },

  // You can mix and match approaches
  processOrder: {
    schema: z.object({
      orderId: z.string(),
      userId: z.string(),
      amount: z.number(),
    }),
    options: options: {
        // Automatically generate taskName from payload if not given explicitly
        useDeduplication: true,
      }
  }
} as const;
```

### Creating the Typed Tasks Client

Next, create the typed tasks client:

```typescript
import { CloudTasksClient } from "@google-cloud/tasks";
import { createTypedTasks } from "@repo/typed-tasks";

// Create the Google Cloud Tasks client
const tasksClient = new CloudTasksClient();

// Create the typed tasks client
export const tasks = createTypedTasks({
  tasksClient,
  taskDefinitions,
  projectId: "your-gcp-project-id",
  region: "us-central1", // Region for all tasks
  options: {
    // Global defaults for all queues
    memory: "512MiB",
    timeoutSeconds: 60,
    vpcConnector: "redis-connector",
    rateLimits: {
      maxDispatchesPerSecond: 5,
      maxConcurrentDispatches: 10,
    },
    retryConfig: {
      maxAttempts: 5,
      minBackoffSeconds: 10,
      maxBackoffSeconds: 3600, // 1 hour
    },
  },
});
```

### Creating Task Handlers

Create handlers for your tasks using the `createHandler` function:

```typescript
import { tasks } from "./tasks-client";

/** Task handler with handler options */
export const handleSyncDeviceTokens = tasks.createHandler({
  queueName: "syncDeviceTokens",
  options: {
    // Handler-specific options
    memory: "1GiB",
    timeoutSeconds: 120,
    rateLimits: {
      maxDispatchesPerSecond: 10,
    },
  },
  handler: async (data) => {
    // data is fully typed: { userId: string, force?: boolean }
    console.log(`Syncing device tokens for user ${data.userId}`);

    // Implementation...
  },
});

/** Task handler without special options */
export const handleSendNotification = tasks.createHandler({
  queueName: "sendNotification",
  handler: async (data) => {
    // Implementation...
  },
});
```

Each exported handler function creates its own Cloud Tasks queue if it does not
exist yet. Function names must use camelCase, because the name also determines
the queue name, and underscores are not currently supported for GCP task queue
names.

### Scheduling Tasks

Use the `createScheduler` function to enqueue tasks in a type-safe way. The
scheduler function accepts an optional second argument, `taskName`, which
enables task deduplication.

Here the function is called inline without a specific task name (no
deduplication unless `deduplicationWindowSeconds` is set):

```typescript
// Schedule without a specific task name
await tasks.createScheduler("processOrder")({
  orderId: "order456",
  userId: "user789",
  amount: 99.99,
});
```

Schedule with a specific task name (e.g., the userId) for deduplication. Assumes
'userId' variable is available in scope.

```typescript
await tasks.createScheduler("syncDeviceTokens")(
  {
    userId,
    force: true,
  },
  userId // Use the userId also as the taskName for deduplication
);
```

If you call the scheduler in multiple places in the same file, assigning it to a
variable might be preferable:

```typescript
const scheduleDeviceTokenSync = tasks.createScheduler("syncDeviceTokens");

await scheduleDeviceTokenSync(
  { userId, force: true },
  userId // Provide the userId as the task name
);

/** Somewhere in a different branch you can then reuse the scheduler */
await scheduleDeviceTokenSync({ userId }, userId);
```

## Deduplication System

Typed Tasks includes a flexible deduplication system with both manual and
automatic options.

**How it works:**

1.  **Manual deduplication - Providing `taskName`:** When you provide a
    `taskName` string as the second argument to the scheduler function, Cloud
    Tasks will use this name. If a task with the _exact same name_ already
    exists in the queue (or has existed recently), the new task creation attempt
    will fail with an "ALREADY_EXISTS" error, which `typed-tasks` handles
    gracefully (logs an info message and does not throw). This provides basic
    deduplication for tasks, but note that
    [it can take up to 4 hours](https://cloud.google.com/tasks/docs/reference/rest/v2/projects.locations.queues.tasks/create#body.request_body.FIELDS.task)
    before an identical task name is accepted again.

2.  **Automatic deduplication - Using `useDeduplication`:** You can set
    `useDeduplication: true` in your task definition options to have taskNames
    automatically generated from the payload data using an MD5 hash. This
    eliminates the need to manually provide a taskName parameter when scheduling
    tasks:

    ```typescript
    // With useDeduplication enabled in the task definition:
    await tasks.createScheduler("syncDeviceTokens")({
      userId: "user123",
    });
    // A taskName is automatically generated from the payload data
    ```

3.  **Using `deduplicationWindowSeconds`:** If you configure
    `deduplicationWindowSeconds` (greater than 0) in your task definition:

    - The task will be scheduled to execute _after_ the specified number of
      seconds has passed (e.g., `deduplicationWindowSeconds: 30` schedules the
      task for 30 seconds in the future).
    - If `useDeduplication` is not explicitly set, it will be implicitly set to
      `true` when `deduplicationWindowSeconds` is greater than 0.
    - If you don't explicitly provide a taskName, one will be automatically
      generated from the payload data.
    - When a deduplication window is used, a time window boundary suffix is
      added to the task name (whether provided explicitly or generated). This
      prevents collisions across different time windows since GCP task IDs don't
      become available immediately after a task completes.
    - This combination allows you to prevent tasks with identical payloads from
      being scheduled more than once within a given time window _and_ delays
      their execution.

4.  **No deduplication:** If you don't provide a `taskName`, `useDeduplication`
    is `false`, and `deduplicationWindowSeconds` is not configured (or is 0),
    Cloud Tasks will automatically generate a unique name for each task. This
    effectively disables deduplication, allowing multiple instances of the same
    logical task to be queued simultaneously.

Using a deduplication window is somewhat comparable to a debounce, with the main
difference being that a task will be executed every x seconds and does not wait
for new input to stop before firing. The first scheduled task will always
execute after the time window has passed.

This type of deduplication can be useful when an incoming event kicks off an
expensive operation that should not execute in short intervals, and you have no
control over the rate of incoming events.

**Example Configuration:**

```typescript
// In your task definitions
export const taskDefinitions = {
  // Task with automatic deduplication and delayed execution
  syncDeviceTokens: {
    schema: z.object({ userId: z.string(), force: z.boolean().optional() }),
    options: {
      deduplicationWindowSeconds: 300, // 5 minutes
      // useDeduplication is implicitly true when deduplicationWindowSeconds > 0
    },
  },

  // Task with explicit automatic taskName generation
  generateInvoice: {
    schema: z.object({
      customerId: z.string(),
      amount: z.number(),
    }),
    options: {
      useDeduplication: true, // Will generate taskNames from payload
    },
  },

  // Task where deduplication is optional (only if taskName is manually provided)
  processOrder: z.object({
    orderId: z.string(),
    userId: z.string(),
    amount: z.number(),
  }), // No deduplication configuration
};
```

## Task Configuration

Each exported handler creates its own dedicated Cloud Tasks queue with the same
name, if it does not exist yet. You can configure tasks in two ways:

1. **Global defaults** for all queues in your typed-tasks instance
2. **Task-specific options**:
   - Scheduler options in the task definition
   - Handler options in the createHandler call

Configuration is merged in this order, with task-specific options taking
precedence over global defaults.

### Scheduler Options

These options affect how the task is scheduled:

```typescript
export type TaskSchedulerOptions = {
  // Deduplication window in seconds
  deduplicationWindowSeconds?: number;

  // When true, automatically generate task names from payload data
  // This is implicitly true when deduplicationWindowSeconds > 0
  useDeduplication?: boolean;
};
```

### Handler Options

The options available for the handler are the same as the `TaskQueueOptions`
from "firebase-functions/v2/tasks".

## Related Packages

If you need similarly typed message handling for Pub/Sub, check out
[typed-pubsub](https://github.com/0x80/typed-pubsub), which provides the same
convenient abstractions and type-safe approach for Google Cloud Pub/Sub.

## Error Handling

The task handler will automatically handle validation errors using Zod:

- If the task payload fails validation, the task will be rejected (not retried)
- For other errors, Cloud Tasks will retry the task based on the configured
  retry settings
