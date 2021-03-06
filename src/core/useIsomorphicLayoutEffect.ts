import { useLayoutEffect } from 'react';
import { isBrowser } from '../utils/environment';

export const useIsomorphicLayoutEffect = isBrowser
  ? useLayoutEffect
  : (fn: () => any) => fn();
