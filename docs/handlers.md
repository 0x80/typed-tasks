# Handlers

Handlers process incoming tasks. Each handler is a Firebase task queue function that automatically creates its own Cloud Tasks queue if it doesn't exist yet.

## Creating a Handler

```typescript
import { tasks } from "./tasks";

export const handleSendNotification = tasks.createHandler({
  queueName: "sendNotification",
  handler: async (data) => {
    // data is fully typed based on the Zod schema
    console.log(`Sending to ${data.userId}: ${data.message}`);
  },
});
```

## Handler Options

You can configure per-handler options that override [global defaults](./configuration):

```typescript
export const handleSyncDeviceTokens = tasks.createHandler({
  queueName: "syncDeviceTokens",
  options: {
    memory: "1GiB",
    timeoutSeconds: 120,
    rateLimits: {
      maxDispatchesPerSecond: 10,
      maxConcurrentDispatches: 5,
    },
    retryConfig: {
      maxAttempts: 5,
      minBackoffSeconds: 10,
      maxBackoffSeconds: 3600,
    },
  },
  handler: async (data) => {
    // Implementation...
  },
});
```

The available options match the `TaskQueueOptions` from `firebase-functions/v2/tasks`:

| Option | Type | Description |
|--------|------|-------------|
| `memory` | `string` | Memory allocation (e.g. `"512MiB"`, `"1GiB"`, `"4GiB"`) |
| `timeoutSeconds` | `number` | Maximum execution time |
| `rateLimits` | `object` | `maxDispatchesPerSecond` and `maxConcurrentDispatches` |
| `retryConfig` | `object` | `maxAttempts`, `minBackoffSeconds`, `maxBackoffSeconds` |
| `secrets` | `string[]` | Secret Manager secrets to make available |

## Using Secrets

For handlers that need access to external services:

```typescript
export const handleSendEmail = tasks.createHandler({
  queueName: "sendEmail",
  options: {
    secrets: ["SENDGRID_API_KEY"],
    rateLimits: {
      maxDispatchesPerSecond: 10,
      maxConcurrentDispatches: 10,
    },
    retryConfig: {
      maxAttempts: 10,
      minBackoffSeconds: 1,
      maxBackoffSeconds: 3600,
    },
  },
  handler: async (data) => {
    // process.env.SENDGRID_API_KEY is available here
  },
});
```

## Error Handling

The handler automatically validates incoming payloads against the Zod schema:

- **Validation errors**: The task is rejected and will **not** be retried, since retrying with the same invalid payload would always fail.
- **Other errors**: The task follows the configured retry behavior from Cloud Tasks.

This prevents wasting resources on tasks that can never succeed due to invalid data.
