# Task Definitions

Task definitions are the foundation of typed-tasks. They map queue names to Zod schemas, providing type safety for both scheduling and handling.

## Definition Forms

Definitions support two forms that can be mixed and matched:

### Direct Schema

The simplest form — just provide a Zod schema:

```typescript
export const definitions = {
  sendNotification: z.object({
    userId: z.string(),
    message: z.string(),
    type: z.enum(["info", "warning", "error"]),
  }),
};
```

### Object with Options

For tasks that need scheduler options like deduplication:

```typescript
export const definitions = {
  syncDeviceTokens: {
    schema: z.object({
      userId: z.string(),
      force: z.boolean().optional(),
    }),
    options: {
      deduplicationWindowSeconds: 30,
    },
  },
};
```

### Mixed Definitions

Both forms can coexist in the same definitions object:

```typescript
export const definitions = {
  // Direct schema
  sendEmail: z.object({
    to: z.string(),
    subject: z.string(),
    body: z.string(),
  }),

  // Object with deduplication window
  recalculatePendingUpdates: {
    schema: z.object({
      reviewId: z.string(),
    }),
    options: {
      deduplicationWindowSeconds: 10,
    },
  },

  // Object with automatic deduplication
  collectFlightData: {
    schema: z.object({
      flightId: z.string(),
    }),
    options: {
      useDeduplication: true,
    },
  },
} as const;
```

## Naming Convention

Task definition keys **must be camelCase**. This is because:

- GCP Cloud Tasks does not allow underscores (`_`) in queue names
- JavaScript doesn't allow hyphens (`-`) in variable names

Since the exported handler function name determines the queue name in GCP, only camelCase is supported.

## Scheduler Options

When using the object form, the `options` field accepts:

| Option | Type | Description |
|--------|------|-------------|
| `deduplicationWindowSeconds` | `number` | Time window for deduplication. Also delays execution by this amount. Implicitly enables `useDeduplication`. |
| `useDeduplication` | `boolean` | When `true`, automatically generates task names from the payload using an MD5 hash. |

See the [Deduplication](./deduplication) page for details on how these options work together.
