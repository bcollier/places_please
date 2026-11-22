import { router } from 'expo-router';

/**
 * Goes back, or home when there's nothing to go back to (for example after a browser reload
 * or opening a link straight to a screen, where router.back() would throw "GO_BACK not handled").
 */
export function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/');
}

/** Closes every modal and returns to the home screen. */
export function goHome() {
  if (router.canDismiss()) router.dismissAll();
  else router.replace('/');
}
