# Configuration

Typed Tasks supports configuration at two levels: global defaults and per-task overrides.

## Global Defaults

Set defaults for all queues when creating the typed tasks client:

```typescript
export const tasks = createTypedTasks({
  client,
  definitions,
  projectId: "your-gcp-project-id",
  region: "us-central1",
  options: {
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
      maxBackoffSeconds: 3600,
    },
  },
});
```

## Per-Task Overrides

Override global defaults for specific handlers:

```typescript
export const handleRecalculate = tasks.createHandler({
  queueName: "recalculatePendingUpdates",
  options: {
    memory: "4GiB",
    timeoutSeconds: 540,
  },
  handler: async (data) => {
    // Expensive operation that needs more resources
  },
});
```

Handler-specific options are merged with global defaults, with handler options taking precedence.

## Merge Order

Configuration is resolved in this order (later overrides earlier):

1. **Global defaults** — set in `createTypedTasks({ options })`
2. **Handler options** — set in `createHandler({ options })`

## Factory Parameters

The `createTypedTasks` function accepts:

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `client` | `CloudTasksClient` | Yes | Google Cloud Tasks client instance |
| `definitions` | `TaskDefinitionRecord` | Yes | Task name to schema/options mapping |
| `projectId` | `string` | Yes | GCP project ID |
| `region` | `string` | Yes | GCP region for all task queues |
| `options` | `TaskHandlerOptions` | No | Global defaults for all handlers |
