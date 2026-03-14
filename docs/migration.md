# Migration from v1

Version 2.0.0 introduces a breaking change to the scheduler API. The `taskName` parameter has been moved into an options object to support additional scheduling options like `delaySeconds`.

## Breaking Changes

**Before (v1.x):**

```typescript
// Schedule without taskName
await scheduler(data);

// Schedule with taskName
await scheduler(data, taskName);
```

**After (v2.x):**

```typescript
// Schedule without options (unchanged)
await scheduler(data);

// Schedule with taskName
await scheduler(data, { taskName });

// Schedule with delay (new)
await scheduler(data, { delaySeconds: 30 });

// Schedule with both
await scheduler(data, { taskName, delaySeconds: 30 });
```

## Migration Steps

1. **Update your dependency** to `typed-tasks@^2.0.0`
2. **Update scheduler calls** that use the second parameter: change `scheduler(data, taskName)` to `scheduler(data, { taskName })`
3. **Test your application** to ensure all task scheduling works as expected

## New Features in v2.x

- **Individual task delays** — schedule tasks to run at a specific time in the future using `delaySeconds`
- **Deduplication windows** — combine automatic deduplication with delayed execution via `deduplicationWindowSeconds`
- **Automatic deduplication** — opt-in MD5-based task name generation with `useDeduplication`
- **Improved API** — the options object allows for future extensibility
- **Backward compatibility** — tasks scheduled without options work exactly the same as before
