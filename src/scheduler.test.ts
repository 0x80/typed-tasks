import type { CloudTasksClient } from "@google-cloud/tasks";
import crypto from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { createSchedulerFactory } from "./scheduler";
import { createTaskRegistry } from "./task-registry";

describe("createSchedulerFactory", () => {
  it("schedules with deduplication window and generated task name", async () => {
    const now = 1_700_000_000_000;
    vi.spyOn(Date, "now").mockReturnValue(now);

    const queuePath = vi
      .fn<(projectId: string, region: string, queue: string) => string>()
      .mockImplementation(
        (projectId: string, region: string, queue: string) =>
          `projects/${projectId}/locations/${region}/queues/${queue}`,
      );
    const taskPath = vi
      .fn<
        (
          projectId: string,
          region: string,
          queue: string,
          taskName: string,
        ) => string
      >()
      .mockImplementation(
        (projectId: string, region: string, queue: string, taskName: string) =>
          `projects/${projectId}/locations/${region}/queues/${queue}/tasks/${taskName}`,
      );

    type TaskRequest = {
      parent: string;
      task: {
        name?: string;
        httpRequest: {
          httpMethod: "POST";
          url: string;
          oidcToken: { serviceAccountEmail: string };
          headers: { "content-type": string };
          body: string;
        };
        scheduleTime?: { seconds: number };
      };
    };

    const createTask = vi.fn((request: TaskRequest) =>
      Promise.resolve(request),
    );

    const tasksClient: CloudTasksClient = {
      queuePath,
      taskPath,
      createTask,
    } as unknown as CloudTasksClient;

    const taskRegistry = createTaskRegistry();
    taskRegistry.set("emailQueue", {
      deduplicationWindowSeconds: 60,
      useDeduplication: true,
    });

    const scheduler = createSchedulerFactory<{ emailQueue: z.ZodTypeAny }>(
      tasksClient,
      "demo-project",
      "us-central1",
      taskRegistry,
    )("emailQueue");

    const payload = { email: "test@example.com" };
    await scheduler(payload);

    const baseHash = crypto
      .createHash("md5")
      .update(JSON.stringify(payload))
      .digest("hex");
    const windowBoundary = Math.floor(now / (60 * 1000));
    const expectedTaskName = `${baseHash}-${windowBoundary}`;
    const expectedScheduleSeconds = Math.floor(now / 1000) + 60;

    expect(createTask).toHaveBeenCalledTimes(1);
    const firstRequest = createTask.mock.calls[0]?.[0];
    if (!firstRequest) {
      throw new Error("createTask was not called");
    }
    const { parent, task } = firstRequest;
    expect(task).toBeDefined();
    expect(task.scheduleTime).toBeDefined();
    expect(task.httpRequest).toBeDefined();
    expect(parent).toBe(
      "projects/demo-project/locations/us-central1/queues/emailQueue",
    );
    expect(task.name).toBe(
      `projects/demo-project/locations/us-central1/queues/emailQueue/tasks/${expectedTaskName}`,
    );
    expect(task.scheduleTime?.seconds).toBe(expectedScheduleSeconds);
    expect(task.httpRequest.body).toBe(
      Buffer.from(JSON.stringify({ data: payload })).toString("base64"),
    );

    vi.restoreAllMocks();
  });
});
