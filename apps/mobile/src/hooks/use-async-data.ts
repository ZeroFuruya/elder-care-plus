import { useCallback, useState } from 'react';
import { useFocusEffect } from 'expo-router';

export type AsyncState<T> =
  | { status: 'loading'; data: null; message: null }
  | { status: 'error'; data: null; message: string }
  | { status: 'ready'; data: T; message: null };

export interface AsyncResult<T> {
  state: AsyncState<T>;
  refreshing: boolean;
  reload: () => Promise<void>;
}

/**
 * Runs a loader whenever the screen gains focus, so a caregiver dashboard shows the elder's
 * confirmation as soon as the caregiver navigates back to it.
 *
 * `loader` must be wrapped in `useCallback`: it is a dependency of the focus effect.
 */
export function useAsyncData<T>(loader: () => Promise<T>): AsyncResult<T> {
  const [state, setState] = useState<AsyncState<T>>({
    status: 'loading',
    data: null,
    message: null,
  });
  const [refreshing, setRefreshing] = useState(false);

  const run = useCallback(
    async (mode: 'initial' | 'refresh' = 'initial') => {
      if (mode === 'refresh') setRefreshing(true);
      try {
        const data = await loader();
        setState({ status: 'ready', data, message: null });
      } catch (error: unknown) {
        setState({
          status: 'error',
          data: null,
          message: error instanceof Error ? error.message : 'Could not load this screen.',
        });
      } finally {
        if (mode === 'refresh') setRefreshing(false);
      }
    },
    [loader],
  );

  useFocusEffect(
    useCallback(() => {
      void run('initial');
    }, [run]),
  );

  return {
    state,
    refreshing,
    reload: useCallback(() => run('refresh'), [run]),
  };
}
