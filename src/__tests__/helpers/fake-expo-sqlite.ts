/**
 * Stand-in for the change-listener part of expo-sqlite. Tests call `__emitChange(table)` to play the
 * role of a committed write.
 */

export interface DatabaseChangeEvent {
  tableName: string;
}

type Listener = (event: DatabaseChangeEvent) => void;

const listeners = new Set<Listener>();

export function addDatabaseChangeListener(listener: Listener): { remove: () => void } {
  listeners.add(listener);
  return {
    remove: () => {
      listeners.delete(listener);
    },
  };
}

export function __emitChange(tableName: string): void {
  for (const listener of [...listeners]) {
    listener({ tableName });
  }
}
