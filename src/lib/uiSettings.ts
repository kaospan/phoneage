export const UI_SETTINGS_UPDATED_EVENT = 'ui-settings-updated';

export const SHOW_COORDS_OVERLAY_KEY = 'show_coords_overlay_v1';

export const getShowCoordsOverlay = (): boolean => {
  if (typeof window === 'undefined') return false;
  try {
    return (localStorage.getItem(SHOW_COORDS_OVERLAY_KEY) ?? '0') === '1';
  } catch {
    return false;
  }
};

export const setShowCoordsOverlay = (value: boolean): void => {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(SHOW_COORDS_OVERLAY_KEY, value ? '1' : '0');
    // Same-tab listeners can react immediately.
    window.dispatchEvent(new Event(UI_SETTINGS_UPDATED_EVENT));
  } catch {
    // ignore
  }
};

