import type { TaskSchedulerOptions } from "./types";

/** Configuration for tasks that only contains scheduler options */
export type TaskConfig = TaskSchedulerOptions;

/**
 * Creates a new queue registry instance
 *
 * This registry maps queue names to their task configurations which includes
 * deduplication settings
 */
export function createTaskRegistry() {
  return new Map<string, TaskConfig>();
}

/** Type definition for a task registry */
export type TaskRegistry = ReturnType<typeof createTaskRegistry>;
