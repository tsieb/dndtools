import * as React from 'react';

export interface ImportCapability {
  element: string;
  support: 'importable' | 'lossy' | 'unsupported' | 'blocked';
}

/**
 * ImportWizard — two-phase map import (Source → Preview → Result). Nothing is written before the
 * explicit Commit in step 2; cancel at any point rolls back to zero state. Unknown formats offer
 * no commit path. Wrap in your own modal/sheet chrome.
 */
export interface ImportWizardProps extends React.HTMLAttributes<HTMLDivElement> {
  /** Control the active step externally (0–2). Otherwise managed internally. */
  step?: number;
  capabilities?: ImportCapability[];
  onCommit?: () => void;
  onCancel?: () => void;
  onOpenMap?: () => void;
}

export function ImportWizard(props: ImportWizardProps): React.ReactElement;
