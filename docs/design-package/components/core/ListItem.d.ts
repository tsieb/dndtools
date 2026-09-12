import * as React from 'react';

export interface ListItemProps extends React.HTMLAttributes<HTMLLIElement> {
  selected?: boolean;
  interactive?: boolean;
  disabled?: boolean;
  onSelect?: () => void;
}

/** ListItem — list row shell with shared row spacing and optional interaction styles. */
export function ListItem(props: ListItemProps): React.ReactElement;
