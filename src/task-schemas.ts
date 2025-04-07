import { z } from "zod";

/** Define task schemas with type safety */
export const taskSchemas = {
  /** Example task schema - replace with your own */
  example_task: z.object({
    id: z.string(),
    data: z.any(),
  }),
} as const;

/** Type representing valid task names */
export type TaskName = keyof typeof taskSchemas;

/** Type mapping task names to their payload types */
export type TaskPayloadTypes = {
  [K in TaskName]: z.infer<(typeof taskSchemas)[K]>;
};
