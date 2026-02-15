import { useNavigate } from 'react-router-dom';
import { createNavigationHandler } from '../utils/navigationUtils';

/**
 * Custom hook that provides a navigation handler function.
 * Eliminates the repetitive pattern of creating navigation handlers in components.
 *
 * @returns A navigation handler function
 */
export const useNavigation = () => {
  const navigate = useNavigate();
  return createNavigationHandler(navigate);
};

/**
 * Safe variant of useNavigation that returns null when called outside Router context.
 * Use this in components that may render outside the Router tree (e.g. toast content).
 */
export const useNavigationSafe = (): ReturnType<typeof createNavigationHandler> | null => {
  try {
    const navigate = useNavigate();
    return createNavigationHandler(navigate);
  } catch {
    // useNavigate throws when called outside <Router> context.
    return null;
  }
};

export type setViewType = ReturnType<typeof useNavigation>;
