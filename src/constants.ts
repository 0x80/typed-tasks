export const MINUTE_SECONDS = 60;
export const HOUR_SECONDS = 60 * MINUTE_SECONDS;
export const DAY_SECONDS = 24 * HOUR_SECONDS;

/** Default options for Task handlers */
export const defaultHandlerOptions = {
  memory: "512MiB",
  timeoutSeconds: 30 * MINUTE_SECONDS, // 30 minutes (maximum allowed)
  vpcConnector: undefined,

  // Queue congestion control settings
  rateLimits: {
    maxDispatchesPerSecond: 500,
    maxConcurrentDispatches: 1000,
  },

  // Retry configuration for failed tasks
  retryConfig: {
    maxAttempts: 10,
    minBackoffSeconds: 10,
    maxBackoffSeconds: HOUR_SECONDS, // 1 hour
    maxRetrySeconds: 0, // unlimited
  },
} as const;
