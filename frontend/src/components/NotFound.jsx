import { StatusPage } from '../pages/PlatformScreens.jsx';

/**
 * Rendered only for truly unknown URLs (the final "*" route).
 * Guards never render NotFound; they redirect instead.
 */
export default function NotFound() {
  return <StatusPage />;
}
