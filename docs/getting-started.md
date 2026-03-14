# Getting Started

## Installation

```bash
pnpm install typed-tasks
```

## Peer Dependencies

This package requires the following peer dependencies:

- `@google-cloud/tasks` (>=5)
- `firebase-functions` (>=6)
- `zod` (>=3)

Install them if you haven't already:

```bash
pnpm install @google-cloud/tasks firebase-functions zod
```

## Quick Start

### 1. Define your task schemas

Create a centralized file for your task definitions using Zod schemas:

```typescript
import { z } from "zod";

export const definitions = {
  sendNotification: z.object({
    userId: z.string(),
    message: z.string(),
  }),
};
```

### 2. Create the typed tasks client

```typescript
import { CloudTasksClient } from "@google-cloud/tasks";
import { createTypedTasks } from "typed-tasks";

const client = new CloudTasksClient();

export const tasks = createTypedTasks({
  client,
  definitions,
  projectId: "your-gcp-project-id",
  region: "us-central1",
});
```

### 3. Create a handler

Handlers are exported as Firebase task queue functions:

```typescript
export const handleSendNotification = tasks.createHandler({
  queueName: "sendNotification",
  handler: async (data) => {
    // data is fully typed: { userId: string, message: string }
    console.log(`Sending notification to ${data.userId}: ${data.message}`);
  },
});
```

### 4. Schedule a task

```typescript
await tasks.createScheduler("sendNotification")({
  userId: "123",
  message: "Welcome to the platform!",
});
```

The scheduler validates the payload against the Zod schema at both compile time and runtime, ensuring only valid data reaches your handler.
