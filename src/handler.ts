import { onTaskDispatched } from "firebase-functions/tasks";
import { got } from "get-or-throw";
import { z } from "zod";
import { defaultHandlerOptions } from "./constants";
import type { SchemaRecord, TaskHandlerOptions } from "./types";

/**
 * Creates a factory function for generating type-safe task handlers
 *
 * @param schemas - Extracted schemas from task definitions
 * @param region - GCP region
 * @param globalOptions - Default options for all handlers
 * @param taskRegistry - Registry to store task configurations that need to be
 *   shared with the scheduler
 * @returns A factory function for creating handlers that returns an object with
 *   the queueName as the property name and the handler function as the value
 */
export function createTaskHandlerFactory<Schemas extends SchemaRecord>(
  schemas: Schemas,
  region: string,
  globalOptions: TaskHandlerOptions = defaultHandlerOptions
) {
  return <T extends keyof Schemas & string>({
    queueName,
    options = {},
    handler,
  }: {
    queueName: T;
    options?: TaskHandlerOptions;
    handler: (payload: z.infer<Schemas[T]>) => Promise<void>;
  }) => {
    /**
     * Merge the default options with the globally configured options and the
     * options passed directly to the handler
     */
    const mergedOptions = {
      ...defaultHandlerOptions,
      ...globalOptions,
      ...options,
      rateLimits: {
        ...defaultHandlerOptions.rateLimits,
        ...(globalOptions.rateLimits ?? {}),
        ...(options.rateLimits ?? {}),
      },
      retryConfig: {
        ...defaultHandlerOptions.retryConfig,
        ...(globalOptions.retryConfig ?? {}),
        ...(options.retryConfig ?? {}),
      },
    };

    const { memory, timeoutSeconds, vpcConnector, rateLimits, retryConfig } =
      mergedOptions;

    const taskHandler = onTaskDispatched(
      {
        region,
        vpcConnector,
        cpu: 1,
        memory,
        timeoutSeconds,
        rateLimits,
        retryConfig,
      },
      async ({ data }) => {
        // Get the schema for this task
        const schema = got(schemas, queueName);

        const result = schema.safeParse(data);

        if (!result.success) {
          console.error(
            new Error(`Zod validation error for queue ${queueName}`),
            result.error.flatten()
          );
          // If validation fails, don't retry because it won't succeed
          return;
        }

        // The result.data is now statically typed by zod as the correct type
        // since we successfully validated it with the schema
        return handler(result.data);
      }
    );

    // Return the handler function directly for easier exports
    return taskHandler;
  };
}
