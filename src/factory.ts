import type { CloudTasksClient } from "@google-cloud/tasks";
import { z } from "zod";
import { defaultHandlerOptions } from "./constants";
import { createTaskHandlerFactory } from "./handler";
import { createSchedulerFactory } from "./scheduler";
import { createTaskRegistry } from "./task-registry";
import type {
  SchemaRecord,
  TaskDefinitionRecord,
  TaskHandlerOptions,
  TaskSchedulerOptions,
  TypedTasksClient,
} from "./types";

/**
 * Utility to check if a task definition is a direct schema or an object with
 * schema
 */
function isSchemaDefinition(
  definition: z.ZodType | { schema: z.ZodType; options?: TaskSchedulerOptions },
): definition is z.ZodType {
  return typeof definition === "function" || "parse" in definition;
}

/**
 * Creates a type-safe Tasks client for handling and scheduling tasks with
 * schema validation
 *
 * @param options - Options object containing client configuration
 * @param options.tasksClient - Google Cloud Tasks client instance
 * @param options.taskDefinitions - Object containing schema and options for
 *   each task
 * @param options.projectId - GCP project ID
 * @param options.region - GCP region for the Cloud Tasks
 * @param options.options - Optional configuration options for all tasks
 * @returns Type-safe Tasks client with scheduler and handler factories
 */
export function createTypedTasks<
  TaskDefs extends TaskDefinitionRecord<string>,
>({
  client,
  definitions,
  projectId,
  region,
  options = {},
}: {
  client: CloudTasksClient;
  definitions: TaskDefs;
  projectId: string;
  region: string;
  options?: TaskHandlerOptions;
}): TypedTasksClient<TaskDefs> {
  // Merge default handler options with options passed to createTypedTasks
  const globalHandlerOptions: TaskHandlerOptions = {
    ...defaultHandlerOptions,
    ...options,
    rateLimits: {
      ...defaultHandlerOptions.rateLimits,
      ...options.rateLimits,
    },
    retryConfig: {
      ...defaultHandlerOptions.retryConfig,
      ...options.retryConfig,
    },
  };

  // Create a task registry for this instance
  const taskRegistry = createTaskRegistry();

  // Extract schemas from taskDefinitions for schema validation
  const schemas = Object.fromEntries(
    Object.entries(definitions).map(([key, value]) => {
      // Check if we're dealing with a direct schema or an object with schema
      if (isSchemaDefinition(value)) {
        return [key, value];
      } else {
        return [key, value.schema];
      }
    }),
  ) as SchemaRecord;

  // Populate task registry with scheduler options from taskDefinitions
  Object.entries(definitions).forEach(([queueName, definition]) => {
    // Only object with schema+options will have scheduler options
    if (!isSchemaDefinition(definition) && definition.options) {
      const deduplicationWindowSeconds =
        definition.options.deduplicationWindowSeconds;
      const useDeduplication =
        !!definition.options.useDeduplication ||
        (!!deduplicationWindowSeconds && deduplicationWindowSeconds > 0);

      taskRegistry.set(queueName, {
        deduplicationWindowSeconds,
        useDeduplication,
      });
    }
  });

  // Get createScheduler factory function
  const schedulerFactory = createSchedulerFactory<TaskDefs>(
    client,
    projectId,
    region,
    taskRegistry,
  );

  // Get createHandler factory function
  const handlerFactory = createTaskHandlerFactory(
    schemas,
    region,
    globalHandlerOptions,
  );

  // Create a proxy to handle direct access to task names
  const tasksProxy = {
    createScheduler: schedulerFactory,
    createHandler: <T extends keyof TaskDefs & string>(config: {
      queueName: T;
      options?: TaskHandlerOptions;
      handler: (payload: z.infer<(typeof schemas)[T]>) => Promise<void>;
    }) => {
      return handlerFactory(config);
    },
  } as TypedTasksClient<TaskDefs> & Record<string, unknown>;

  // Add each queue name as a property to allow checking with "in" operator
  Object.keys(definitions).forEach((queueName) => {
    tasksProxy[queueName] = true;
  });

  return tasksProxy;
}
