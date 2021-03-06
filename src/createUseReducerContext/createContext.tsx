import React, { useReducer, useRef, useEffect } from 'react';
import { UseReducerContextSource } from './createUseReducerContext';
import { createStore } from './hook';
import { createBaseContext } from '../core/context';
import { createSubscription, Subscription } from '../core/subscription';
import { useIsomorphicLayoutEffect } from '../core/useIsomorphicLayoutEffect';
import { Store } from '../createStore/createStore';
import { isBrowser } from '../utils/environment';
import { entries } from '../utils/entries';

export type ContextProvider<T extends Record<string, unknown>> = {
  children: React.ReactNode;
  store?: Store<T>;
};

export type AnyReducer<S = any, A = any> =
  | React.Reducer<S, A>
  | React.ReducerWithoutAction<S>;
export type ReducerState<R> = R extends React.ReducerWithoutAction<any>
  ? React.ReducerStateWithoutAction<R>
  : R extends React.Reducer<any, any>
  ? React.ReducerState<R>
  : never;
export type ReducerDispatch<R> = R extends React.ReducerWithoutAction<any>
  ? React.DispatchWithoutAction
  : R extends React.Reducer<any, any>
  ? React.Dispatch<React.ReducerAction<R>>
  : never;

export type State<T extends UseReducerContextSource> = {
  [P in keyof T]: T[P]['initialState'];
};
export type UseReducerContextValue<T extends UseReducerContextSource> = {
  state: {
    [P in keyof T]: T[P]['initialState'];
  };
  dispatch: {
    [P in keyof T]: ReducerDispatch<T[P]['reducer']>;
  };
};

const createUseServerSideDispatch = <T extends UseReducerContextSource>(
  contextValueRef: React.MutableRefObject<UseReducerContextValue<T>>,
  partial: keyof State<T>,
  reducer: T[keyof T]['reducer'],
  subscription: Subscription<UseReducerContextValue<T>>,
  store?: Store<State<T>>
): ReducerDispatch<typeof reducer> => {
  const useServerSideDispatch = (
    action?: React.ReducerAction<typeof reducer>
  ): void => {
    /* eslint no-param-reassign: 0 */
    const currentState = contextValueRef.current.state[partial];
    const newState =
      reducer.length === 1
        ? reducer(currentState, undefined)
        : reducer(currentState, action);

    contextValueRef.current.state[partial] = newState;
    if (store) {
      store.setState(partial, newState);
    }

    subscription.trySubscribe(contextValueRef.current);
  };

  return useServerSideDispatch as any;
};

export const createContext = <T extends UseReducerContextSource>(
  contextSource: T
) => {
  const context = createBaseContext<UseReducerContextValue<T>>();
  const subscription = createSubscription<UseReducerContextValue<T>>();
  const useGlobalContext = createStore(context, subscription);
  const { Provider } = context;
  const contextProvider: React.FC<ContextProvider<State<T>>> = ({
    children,
    store,
  }: ContextProvider<State<T>>) => {
    const contextValueRef = useRef({
      state: {},
      dispatch: {},
    } as UseReducerContextValue<T>);
    const storeState = store?.getState() ?? undefined;

    entries(contextSource).forEach(([partial, source]) => {
      const { reducer, initialState, initializer } = source;
      const initialValue =
        storeState && storeState[partial] !== undefined
          ? storeState[partial]
          : initialState;

      const [state, dispatch] = useReducer(reducer, initialValue, initializer);

      contextValueRef.current.state[partial] = state;
      contextValueRef.current.dispatch[partial] = dispatch as any;
      if (store) {
        store.setState(partial, state);
      }
    }, {} as any);

    useEffect(() => {
      subscription.trySubscribe(contextValueRef.current);
    });

    return <Provider value={contextValueRef.current}>{children}</Provider>;
  };

  const contextServerSideProvider: React.FC<ContextProvider<State<T>>> = ({
    children,
    store,
  }: ContextProvider<State<T>>) => {
    const contextValueRef = useRef({
      state: {},
      dispatch: {},
    } as UseReducerContextValue<T>);
    const storeState = store?.getState() ?? undefined;

    entries(contextSource).forEach(([partial, { initialState }]) => {
      const state =
        storeState && storeState[partial] !== undefined
          ? storeState[partial]
          : initialState;

      const dispatch = createUseServerSideDispatch(
        contextValueRef,
        partial,
        contextSource[partial].reducer,
        subscription,
        store
      );

      contextValueRef.current.state[partial] = state;
      contextValueRef.current.dispatch[partial] = dispatch;
      if (store) {
        store.setState(partial, state);
      }
    }, {} as any);

    useIsomorphicLayoutEffect(() => {
      subscription.trySubscribe(contextValueRef.current);
    });

    return <Provider value={contextValueRef.current}>{children}</Provider>;
  };

  return {
    useGlobalContext,
    contextProvider: isBrowser ? contextProvider : contextServerSideProvider,
  };
};
