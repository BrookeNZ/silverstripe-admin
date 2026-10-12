/**
 * The context between the shell's modal frame (modals.tsx) and the content drawn in it. Apart from the
 * piral-modals plugin, so shell components such as SchemaFormDialog read it without loading piral-core
 */
import * as React from 'react';

/** The parts of the shell's modal frame that content may set; each one left out falls back to the layout's */
export interface ModalFrame {
  header?: React.ReactNode;
  footer?: React.ReactNode;
  alert?: React.ReactNode;
}

type SetFrame = (frame: ModalFrame) => void;

export const ModalFrameContext = React.createContext<SetFrame | null>(null);

/** `useModalFrame` for shell code, which passes null to leave the frame alone */
export function useModalFrame(frame: ModalFrame | null): boolean {
  const setFrame = React.useContext(ModalFrameContext);
  const active = setFrame !== null && frame !== null;
  React.useLayoutEffect(() => {
    if (setFrame && frame) {
      setFrame(frame);
    }
  });
  React.useLayoutEffect(() => (active ? () => setFrame?.({}) : undefined), [active, setFrame]);
  return setFrame !== null;
}
