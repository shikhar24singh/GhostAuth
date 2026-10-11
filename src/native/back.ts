type BackActions = {
  dismissDialog: () => boolean;
  goBack: () => void;
  exit: () => void;
};

export function handleAndroidBack(canGoBack: boolean, actions: BackActions) {
  if (actions.dismissDialog()) return;
  if (canGoBack) actions.goBack();
  else actions.exit();
}
