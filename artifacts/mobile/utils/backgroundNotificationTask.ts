export const BACKGROUND_NOTIFICATION_TASK = "AGENT_REQUEST_BACKGROUND_TASK";

type TaskManagerModule = {
  defineTask: (
    taskName: string,
    task: (args: { data?: unknown; error?: unknown }) => Promise<void> | void,
  ) => void;
};

type NotificationsModule = {
  registerTaskAsync: (taskName: string) => Promise<void>;
};

let TaskManager: TaskManagerModule | null = null;
let Notifications: NotificationsModule | null = null;

try {
  TaskManager = require("expo-task-manager") as TaskManagerModule;
  Notifications = require("expo-notifications") as NotificationsModule;
} catch (err) {
  console.warn("[BackgroundTask] Native notification modules unavailable; skipping task registration.", err);
}

if (TaskManager && Notifications) {
  TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, async ({ data, error }) => {
    if (error) {
      console.error("[BackgroundTask] Error:", error);
      return;
    }

    const notification = data as { notification?: { request?: { content?: { data?: Record<string, unknown> } } } } | null;
    const pushData = notification?.notification?.request?.content?.data;

    if (pushData?.type !== "agent_request") return;

    try {
      const { processApprovedRequests } = await import("@/utils/agentRequestHandler");
      await processApprovedRequests();
    } catch (err) {
      console.error("[BackgroundTask] Failed to process agent requests:", err);
    }
  });

  Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch((err) => {
    console.warn("[BackgroundTask] Failed to register background notification task:", err);
  });
}
