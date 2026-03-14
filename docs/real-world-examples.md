# Real-World Examples

This page shows patterns from production systems using typed-tasks.

## Centralized Task Definitions

In practice, all task definitions live in a single file in a shared package, making them available to both schedulers and handlers:

```typescript
// packages/core/src/tasks.ts
import { CloudTasksClient } from "@google-cloud/tasks";
import { createTypedTasks } from "typed-tasks";
import { z } from "zod";

export const tasks = createTypedTasks({
  client: new CloudTasksClient(),
  definitions: {
    syncDeviceTokens: {
      schema: z.object({ userId: z.string() }),
      options: { deduplicationWindowSeconds: 10 },
    },
    sendEmail: z.any(),
    recalculateMetricsForUser: z.object({ userId: z.string() }),
    syncWithTypesense: z.object({
      collection: z.string(),
      documentId: z.string(),
      operation: z.enum(["upsert", "delete"]),
      typesenseData: z.any().optional(),
      checksum: z.string().optional(),
    }),
    deleteUserCollections: z.object({ userId: z.string() }),
  },
  projectId: "my-project",
  region: "europe-west1",
  options: {
    memory: "512MiB",
    vpcConnector: "redis-connector",
  },
});
```

## Handlers in Feature Modules

Handlers are defined in feature-specific files, keeping the task processing logic close to the domain it belongs to:

```typescript
// services/functions/src/notifications/sync-device-tokens.ts
import { tasks } from "@my-org/core/tasks";

export const handleSyncDeviceTokens = tasks.createHandler({
  queueName: "syncDeviceTokens",
  options: {
    rateLimits: {
      maxDispatchesPerSecond: 5,
      maxConcurrentDispatches: 10,
    },
  },
  handler: async ({ userId }) => {
    // Sync device tokens to Redis for push notifications
  },
});
```

## Deduplication Windows for Expensive Operations

When a Firestore trigger fires on every document change but you only want to recalculate once per time window:

```typescript
const definitions = {
  recalculatePendingUpdates: {
    schema: z.object({ reviewId: z.string() }),
    options: { deduplicationWindowSeconds: 10 },
  },
};
```

Even if 50 documents change within 10 seconds, only one recalculation task runs. This is especially valuable for memory-intensive operations (4GiB+) where running them in parallel would be wasteful.

## Delayed Execution for Cleanup

Schedule destructive operations with a delay to allow for cancellation or undo:

```typescript
const DAY_SECONDS = 86400;

// Delete user data 7 days after account closure
await tasks.createScheduler("deleteUserCollections")(
  { userId },
  { delaySeconds: 7 * DAY_SECONDS },
);
```

## Rate Limiting for External APIs

Different tasks can have wildly different rate limit requirements depending on the external service they interact with:

```typescript
// Email sending — respect SendGrid rate limits
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
    // Send email via SendGrid
  },
});

// User metrics — high throughput for bulk operations
export const handleRecalculateMetrics = tasks.createHandler({
  queueName: "recalculateMetricsForUser",
  options: {
    rateLimits: {
      maxDispatchesPerSecond: 500,
      maxConcurrentDispatches: 5000,
    },
  },
  handler: async ({ userId }) => {
    // Recalculate all metrics for this user
  },
});
```

## Scheduling from Handlers

Handlers can schedule other tasks, enabling task chains:

```typescript
export const handleApplySilentUpdates = tasks.createHandler({
  queueName: "applySilentUpdates",
  options: { memory: "1GiB" },
  handler: async (data) => {
    const { compatible, incompatible } = categorizeUpdates(data);

    // Apply compatible updates immediately
    await applyUpdates(compatible);

    // Re-schedule incompatible updates with a delay
    for (const update of incompatible) {
      await tasks.createScheduler("createReviewUpdate")(update, {
        delaySeconds: 600, // retry in 10 minutes
      });
    }

    // Trigger a recalculation
    await tasks.createScheduler("recalculatePendingUpdates")({
      reviewId: data.reviewId,
    });
  },
});
```

## Search Index Synchronization

Keep a search index in sync with your database by scheduling upsert/delete tasks:

```typescript
// Schedule from a Firestore trigger or business logic
await tasks.createScheduler("syncWithTypesense")({
  collection: "airlines",
  documentId: airlineId,
  operation: "upsert",
  typesenseData: {
    id: airlineId,
    name: airline.name,
    iata: airline.iata,
  },
  checksum: computeChecksum(airline),
});
```

The handler can then check the checksum to skip unnecessary updates, reducing write load on the search cluster.
