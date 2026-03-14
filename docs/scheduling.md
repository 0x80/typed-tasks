# Scheduling

The `createScheduler` function returns a type-safe function for enqueuing tasks. The payload is validated against the Zod schema at both compile time and runtime.

## Basic Scheduling

Schedule a task immediately:

```typescript
await tasks.createScheduler("sendNotification")({
  userId: "123",
  message: "Welcome to the platform!",
});
```

## Scheduling with Delays

Use `delaySeconds` to schedule tasks for future execution:

```typescript
// Run in 30 seconds
await tasks.createScheduler("sendNotification")(
  { userId: "123", message: "Your order is ready!" },
  { delaySeconds: 30 },
);

// Run in 5 minutes
await tasks.createScheduler("processOrder")(
  { orderId: "order456", userId: "user789", amount: 99.99 },
  { delaySeconds: 300 },
);
```

This is useful for cleanup operations or throttled updates. For example, scheduling a user data deletion 7 days after account closure:

```typescript
const DAY_SECONDS = 86400;

await tasks.createScheduler("deleteUserCollections")(
  { userId },
  { delaySeconds: 7 * DAY_SECONDS },
);
```

## Scheduling with Deduplication

Provide a `taskName` to prevent duplicate tasks:

```typescript
await tasks.createScheduler("syncDeviceTokens")(
  { userId, force: true },
  { taskName: userId },
);
```

## Combining Delays and Deduplication

Both options can be combined:

```typescript
await tasks.createScheduler("syncDeviceTokens")(
  { userId, force: true },
  { taskName: `user-${userId}-sync`, delaySeconds: 60 },
);
```

## Reusing Schedulers

If you call the scheduler in multiple places, assign it to a variable:

```typescript
const scheduleDeviceTokenSync = tasks.createScheduler("syncDeviceTokens");

// In one place
await scheduleDeviceTokenSync({ userId, force: true }, { taskName: userId });

// Somewhere else
await scheduleDeviceTokenSync(
  { userId },
  { taskName: userId, delaySeconds: 120 },
);
```

See the [Deduplication](./deduplication) page for an in-depth explanation of the deduplication system.
