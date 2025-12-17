import type { MemoryOption } from "firebase-functions";
import type {
  RateLimits,
  RetryConfig,
  TaskQueueOptions,
} from "firebase-functions/v2/tasks";
import type { z } from "zod";

/** Type definition for a task handler function returned by createHandler */
export type TaskHandlerFunction = ReturnType<
  typeof import("firebase-functions/tasks").onTaskDispatched
>;

/** Error message for queue names with invalid format */
export type QueueNameErrorMessage =
  "Error: Queue names must be camelCase. Underscores (_) are not allowed by GCP Cloud Tasks, and hyphens (-) cannot be used in JavaScript variable names.";

/** Type utility to check if a string contains hyphens or underscores */
export type IsCamelCase<S extends string> = S extends
  | `${string}_${string}`
  | `_${string}`
  | `${string}-${string}`
  ? false
  : true;

/** Type guard to validate queue names are camelCase */
export type ValidateQueueName<S extends string> =
  IsCamelCase<S> extends true ? S : QueueNameErrorMessage;

/** Record of schema types for each task */
export type SchemaRecord = Record<string, z.ZodType>;

/**
 * Options for configuring the scheduler - these are options that apply to how
 * the task is scheduled, not how it's executed
 */
export type TaskSchedulerOptions = {
  /**
   * When specified, the task will use a time window-based deduplication
   * strategy. Tasks with the same name will be deduplicated within the
   * specified time window. The value specifies the size of the time window in
   * seconds.
   */
  deduplicationWindowSeconds?: number;

  /**
   * When true, the task will automatically derive a taskName using an MD5 hash
   * of the payload data, eliminating the need to explicitly provide a taskName.
   * If deduplicationWindowSeconds is greater than 0, useDeduplication is
   * implicitly true even if not specified.
   */
  useDeduplication?: boolean;
};

/**
 * Options for configuring a Task handler These options apply to the function
 * that executes the task, not how it's scheduled
 */
export type TaskHandlerOptions = Omit<TaskQueueOptions, "region"> & {
  /**
   * Memory allocation for the function Redeclared here for better
   * documentation, but uses the same type
   */
  memory?: MemoryOption;

  /**
   * Rate limiting configuration for the queue This is passed directly to the
   * onTaskDispatched function
   */
  rateLimits?: RateLimits;

  /**
   * Retry configuration for the queue This is passed directly to the
   * onTaskDispatched function
   */
  retryConfig?: RetryConfig;
};

/** Utility type to extract schema from TaskDefinition */
export type ExtractSchema<T> = T extends z.ZodType
  ? T
  : T extends { schema: z.ZodType }
    ? T["schema"]
    : never;

/**
 * Task definition can be either:
 *
 * 1. A direct Zod schema
 * 2. An object with schema and optional scheduler options
 */
export type TaskDefinition =
  | z.ZodType
  | {
      schema: z.ZodType;
      options?: TaskSchedulerOptions;
    };

/** Record of task definitions for each task with enforced camelCase keys */
export type TaskDefinitionRecord<QueueName extends string> = {
  [K in QueueName]: K extends
    | `${string}_${string}`
    | `_${string}`
    | `${string}-${string}`
    ? never // This ensures the type error appears directly on the non-camelCase key
    : TaskDefinition;
};

/**
 * Type to extract the payload type for a given task using the task definition's
 * schema
 */
export type TaskPayload<
  Defs extends TaskDefinitionRecord<string>,
  T extends keyof Defs & string,
> = z.infer<ExtractSchema<Defs[T]>>;

/** Options for scheduling a task */
export type TaskScheduleOptions = {
  /** Optional name for the task, enabling deduplication */
  taskName?: string;
  /** Optional delay in seconds before the task should be executed */
  delaySeconds?: number;
};

/** Type for the object-based handler parameters */
export type TaskHandlerConfig<Schema extends z.ZodType> = {
  /** Name of the queue */
  queueName: string;
  /** Handler-specific options (memory, timeout, etc.) */
  options?: TaskHandlerOptions;
  /** Function that processes the task */
  handler: (payload: z.infer<Schema>) => Promise<void>;
};

/** Type definition for a typed Tasks client */
export type TypedTasksClient<Defs extends TaskDefinitionRecord<string>> = {
  /**
   * Creates a type-safe scheduler function for the specified task
   *
   * @param queueName - The name of the queue to schedule tasks on
   * @returns A function that schedules tasks with the following parameters:
   *
   *   - Data: The payload data that conforms to the task's schema
   *   - Options: Optional configuration including taskName for deduplication and
   *       delaySeconds for custom delays. When taskName is not provided and
   *       deduplication is enabled (either via useDeduplication or
   *       deduplicationWindowSeconds), a taskName will be automatically
   *       generated from the payload data using MD5 hash.
   */
  createScheduler: <T extends keyof Defs & string>(
    queueName: T,
  ) => (
    data: z.infer<ExtractSchema<Defs[T]>>,
    options?: TaskScheduleOptions,
  ) => Promise<void>;

  /** Creates a type-safe handler function for processing tasks */
  createHandler: <T extends keyof Defs & string>(config: {
    queueName: T;
    options?: TaskHandlerOptions;
    handler: (payload: z.infer<ExtractSchema<Defs[T]>>) => Promise<void>;
  }) => TaskHandlerFunction;
};
