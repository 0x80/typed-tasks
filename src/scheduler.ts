import type { CloudTasksClient } from "@google-cloud/tasks";
import crypto from "node:crypto";
import pRetry, { AbortError } from "p-retry";
import type { z } from "zod";
import type { TaskRegistry } from "./task-registry";
import type { ExtractSchema, TaskDefinitionRecord } from "./types";

/**
 * Generates a deterministic task name from payload data using MD5 hash When
 * deduplication window is set, includes a time window boundary suffix to
 * prevent collisions across different time windows
 *
 * @param data - The payload data to hash
 * @param deduplicationWindowSeconds - Optional deduplication window in seconds
 * @returns A string containing the MD5 hash of the stringified data, with
 *   optional time window suffix
 */
function generateTaskNameFromPayload(
  data: unknown,
  deduplicationWindowSeconds?: number
): string {
  const dataString = typeof data === "string" ? data : JSON.stringify(data);
  const baseHash = crypto.createHash("md5").update(dataString).digest("hex");

  // If we have a deduplication window, add a time window suffix
  if (deduplicationWindowSeconds && deduplicationWindowSeconds > 0) {
    // Round the current timestamp to the nearest window boundary
    const currentTime = Date.now();
    const windowBoundary = Math.floor(
      currentTime / (deduplicationWindowSeconds * 1000)
    );
    return `${baseHash}-${windowBoundary}`;
  }

  return baseHash;
}

/**
 * Creates a factory function that produces type-safe task schedulers for
 * specific tasks
 *
 * @param tasksClient - Google Cloud Tasks client
 * @param projectId - Google Cloud project ID
 * @param region - GCP region for the Cloud Tasks
 * @param taskRegistry - Registry containing task configurations from task
 *   definitions
 * @returns A factory function for creating task schedulers
 */
export function createSchedulerFactory<
  Defs extends TaskDefinitionRecord<string>,
>(
  tasksClient: CloudTasksClient,
  projectId: string,
  region: string,
  taskRegistry: TaskRegistry
) {
  return <T extends keyof Defs & string>(queueName: T) => {
    /**
     * Schedules a task to be executed
     *
     * @param data - The data to schedule as a task, must conform to the task's
     *   schema
     * @param options - Optional configuration options for the task
     * @param taskName - Optional name for the task, enabling deduplication.
     *   Required if `deduplicationWindowSeconds` is configured for the task.
     * @returns Promise that resolves when the task is scheduled
     */
    return async (
      data: z.infer<ExtractSchema<Defs[T]>>,
      taskName?: string
    ): Promise<void> => {
      const taskConfig = taskRegistry.get(queueName);
      const deduplicationWindowSeconds = taskConfig?.deduplicationWindowSeconds;

      const targetRegion = region;

      // Get the parent queue path
      const parent = tasksClient.queuePath(projectId, targetRegion, queueName);

      const serviceAccountEmail = `${projectId}@appspot.gserviceaccount.com`;

      let scheduleTimeSeconds: number | undefined;

      const useDeduplication =
        !!taskConfig?.useDeduplication ||
        (!!deduplicationWindowSeconds && deduplicationWindowSeconds > 0);

      /** Generate a task name if needed or add time window suffix */
      let finalTaskName = taskName;
      if (useDeduplication && !finalTaskName) {
        // No taskName provided, generate one with window suffix if needed
        finalTaskName = generateTaskNameFromPayload(
          data,
          deduplicationWindowSeconds
        );
      } else if (
        finalTaskName &&
        deduplicationWindowSeconds &&
        deduplicationWindowSeconds > 0
      ) {
        // TaskName was provided, but we need to add time window suffix
        const currentTime = Date.now();
        const windowBoundary = Math.floor(
          currentTime / (deduplicationWindowSeconds * 1000)
        );
        finalTaskName = `${finalTaskName}-${windowBoundary}`;
      }

      try {
        /**
         * If a deduplication window is configured, configure the task to be
         * scheduled in the future
         */
        if (deduplicationWindowSeconds && deduplicationWindowSeconds > 0) {
          scheduleTimeSeconds =
            Math.floor(Date.now() / 1000) + deduplicationWindowSeconds;
        }

        /**
         * The body HAS to contain the payload in the "data" key for the cloud
         * functions onTaskDispatched to accept/parse the body. It also needs to
         * be encoded with base64.
         */
        const body = Buffer.from(JSON.stringify({ data })).toString("base64");

        const task: {
          name?: string;
          httpRequest: {
            httpMethod: "POST";
            url: string;
            oidcToken: { serviceAccountEmail: string };
            headers: { "content-type": string };
            body: string;
          };
          scheduleTime?: { seconds: number };
        } = {
          httpRequest: {
            httpMethod: "POST",
            url: `https://${targetRegion}-${projectId}.cloudfunctions.net/${queueName}`,
            oidcToken: {
              serviceAccountEmail,
            },
            headers: {
              "content-type": "application/json",
            },
            body,
          },
        };

        /**
         * Set the task name property if we have a taskName (either provided or
         * generated)
         */
        if (finalTaskName) {
          task.name = tasksClient.taskPath(
            projectId,
            targetRegion,
            queueName,
            finalTaskName
          );
        }

        /** Set schedule time only if a deduplication window is configured */
        if (scheduleTimeSeconds) {
          task.scheduleTime = {
            seconds: scheduleTimeSeconds,
          };
        }

        /**
         * Use p-retry to handle transient failures when creating tasks with
         * exponential backoff and jitter
         */
        await pRetry(
          async () => {
            try {
              return await tasksClient.createTask({ parent, task });
            } catch (error) {
              // If task already exists, abort retry (part of deduplication)
              if (
                error instanceof Error &&
                error.message.includes("ALREADY_EXISTS")
              ) {
                throw new AbortError(error.message);
              }
              throw error; // Let other errors be retried
            }
          },
          {
            retries: 5, // Maximum number of retry attempts
            factor: 2, // Exponential backoff factor
            minTimeout: 1000, // Initial retry delay (1 second)
            maxTimeout: 10000, // Maximum retry delay (10 seconds)
            randomize: true, // Add jitter to prevent thundering herd
            onFailedAttempt: (error) => {
              // Only log if not aborted due to ALREADY_EXISTS
              if (!(error instanceof AbortError)) {
                console.warn(
                  `Task scheduling attempt ${String(error.attemptNumber)} failed for ${String(queueName)}. ${String(error.retriesLeft)} retries left.`,
                  error.message
                );
              }
            },
          }
        );
      } catch (error) {
        if (
          error instanceof Error &&
          error.message.includes("ALREADY_EXISTS")
        ) {
          // Task already exists, which is expected with deduplication
          console.info(`Skipping task ${finalTaskName}`, { data });
          return;
        }

        // For other errors, log and rethrow
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        console.error(
          new Error(
            `Failed to schedule task ${String(queueName)} after multiple retries: ${errorMessage}`
          )
        );
        throw error;
      }
    };
  };
}
