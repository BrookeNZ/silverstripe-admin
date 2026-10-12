/**
 * Named modals: piral-modals keeps the registry and the list of open modals, and the shell draws the frame.
 * Each open modal is the patterns package's Dialog, so focus handling and styling are the shell's. A
 * registration supplies the content, with a fixed `header` and `focusHeading` as its layout options; content
 * that changes while the modal is open (a header naming what it edits, a footer of actions, an alert) reaches
 * the frame through `useModalFrame`.
 *
 * piral-modals closes a modal by unmounting it, so the native `close()` that returns focus never runs; the
 * frame puts focus back on the element that had it when the modal opened, if that is still in the page.
 * Several open modals stack as native modal dialogs, the latest on top.
 */
import * as React from 'react';
import type { PiletApiExtender } from 'piral-base';
import type { PiralPlugin } from 'piral-core';
import { createModalsApi } from 'piral-modals';
import type { ModalsDialogProps, ModalsHostProps, PiletModalsApi } from 'piral-modals';
import { Dialog } from '@silverstripe/admin-patterns';
import { ModalFrameContext, useModalFrame } from './modalFrame';
import type { ModalFrame } from './modalFrame';

declare module 'piral-modals/lib/types' {
  interface ModalLayoutOptions {
    /** The heading until the content sets one through `useModalFrame` */
    header?: React.ReactNode;
    /** Opening focuses the heading rather than the first control, for content that loads its controls */
    focusHeading?: boolean;
  }
}

export interface ShellModalsApi {
  /**
   * Sets the header, footer and alert of the named modal this component renders in, on every render.
   * Returns false outside a named modal, where it does nothing
   */
  useModalFrame: (frame: ModalFrame) => boolean;
}

declare module 'piral-core/lib/types/custom' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- merging into Piral's pilet API needs an interface
  interface PiletCustomApi extends ShellModalsApi {}
}

export const ModalsHost = ({ children }: ModalsHostProps) => <>{children}</>;

export const ModalsDialog = ({ layout, close, children }: ModalsDialogProps) => {
  const [frame, setFrame] = React.useState<ModalFrame>({});
  const [returnTo] = React.useState(() => document.activeElement);

  React.useEffect(
    () => () => {
      if (returnTo instanceof HTMLElement && returnTo.isConnected) {
        returnTo.focus();
      }
    },
    [returnTo],
  );

  return (
    <ModalFrameContext.Provider value={setFrame}>
      <Dialog
        open
        onClose={close}
        header={frame.header ?? layout.header}
        footer={frame.footer}
        alert={frame.alert}
        focusHeading={layout.focusHeading}
      >
        {children}
      </Dialog>
    </ModalFrameContext.Provider>
  );
};

export function createShellModalsApi(): PiralPlugin<PiletModalsApi & ShellModalsApi> {
  const plugin = createModalsApi();
  return (context) => {
    const extend = plugin(context) as PiletApiExtender<PiletModalsApi>;
    context.dispatch((state) => ({ ...state, components: { ...state.components, ModalsHost, ModalsDialog } }));
    return (api, meta) => ({ ...extend(api, meta), useModalFrame });
  };
}
