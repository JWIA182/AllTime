import { useCallback, useEffect, useRef, useState } from "react";
import { firebaseEnabled } from "./firebase";

/*
 * useOfflineQueue - Queue operations when offline, replay when back online
 * 
 * This hook:
 * - Queues add/update/delete operations when offline
 * - Automatically replays the queue when connection is restored
 * - Provides visual feedback about queued changes
 */

const QUEUE_KEY = "alltime.offlineQueue.v1";

function readQueue() {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function writeQueue(queue) {
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
  } catch {}
}

export function useOfflineQueue({ userId, operations }) {
  // operations is an object with methods like:
  // { addTask, updateTask, deleteTask, addSession, removeSession, etc. }
  
  const [queue, setQueue] = useState([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [lastProcessed, setLastProcessed] = useState(null);
  const processingRef = useRef(false);

  // Load queue on mount
  useEffect(() => {
    setQueue(readQueue());
  }, []);

  // Add operation to queue
  const enqueue = useCallback((operation) => {
    const newOperation = {
      ...operation,
      id: `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: Date.now(),
    };
    
    const newQueue = [...queue, newOperation];
    setQueue(newQueue);
    writeQueue(newQueue);
    
    return newOperation.id;
  }, [queue]);

  // Remove operation from queue
  const dequeue = useCallback((operationId) => {
    const newQueue = queue.filter(op => op.id !== operationId);
    setQueue(newQueue);
    writeQueue(newQueue);
  }, [queue]);

  // Process the queue
  const processQueue = useCallback(async () => {
    if (queue.length === 0 || processingRef.current || !navigator.onLine) {
      return;
    }

    processingRef.current = true;
    setIsProcessing(true);

    const failedOps = [];

    for (const op of queue) {
      try {
        switch (op.type) {
          case "addTask":
            await operations.addTask?.(userId, op.data);
            break;
          case "updateTask":
            await operations.updateTask?.(userId, op.taskId, op.data);
            break;
          case "deleteTask":
            await operations.deleteTask?.(userId, op.taskId);
            break;
          case "addSession":
            await operations.addSession?.(userId, op.data);
            break;
          case "removeSession":
            await operations.removeSession?.(userId, op.sessionId);
            break;
          default:
            console.warn("[useOfflineQueue] Unknown operation type:", op.type);
        }
        
        // Remove successful operation from queue
        dequeue(op.id);
      } catch (error) {
        console.error("[useOfflineQueue] Failed to process operation:", error);
        failedOps.push(op);
      }
    }

    setLastProcessed(Date.now());
    processingRef.current = false;
    setIsProcessing(false);

    return {
      processed: queue.length - failedOps.length,
      failed: failedOps.length,
    };
  }, [queue, operations, userId, dequeue]);

  // Auto-process when coming back online
  useEffect(() => {
    const handleOnline = async () => {
      if (firebaseEnabled && queue.length > 0) {
        await processQueue();
      }
    };

    window.addEventListener("online", handleOnline);
    return () => window.removeEventListener("online", handleOnline);
  }, [queue.length, processQueue]);

  // Check if we have pending offline changes
  const hasPendingChanges = queue.length > 0;

  return {
    queue,
    hasPendingChanges,
    pendingCount: queue.length,
    isProcessing,
    lastProcessed,
    enqueue,
    dequeue,
    processQueue,
  };
}
