/**
 * The details panel region (Figma "Sidebar preview" 2:6739 and its uses in the Files frames 1927 to 1929):
 * a column beside the section's content, under the section header, that any pilet fills through `openPanel`.
 * The shell draws the chrome: the title as the region's heading with an optional badge, a meta line, the close
 * button, then the content, which scrolls on its own, and an optional footer. From 1200px the panel sits
 * beside the content (350px, 400px from 1600px, in panel.css); below that it replaces the content, which
 * stays mounted underneath, as the 992 frame's 792px panel fills the main area.
 *
 * Focus moves to the heading when a panel opens or another replaces it, not when the same panel updates.
 * When it closes and focus was inside it, focus returns to the element focused when it opened, else to the
 * element `returnFocus` names, else to the main landmark. Only the close button asks to close: legacy's
 * panel had no Escape, and an Escape meant for a field or a dialog inside must not close it.
 *
 * Opening and closing usually change the route, and after a route change the section header focuses its
 * h1, a frame later or `keptHeaderDelay` later when the page kept its header (SectionHeader.tsx). So the
 * panel moves focus at once and again at both of those moments, each time only when focus is lost or sits
 * on that h1, which leaves alone anything the user focused meanwhile. A panel closed by anything but its
 * close button (a crumb or menu link changing the route) leaves the h1 alone and only rescues lost focus.
 *
 * Content that throws while rendering shows an error in the panel instead of taking the workspace down.
 */
import * as React from 'react';
import { Alert, Button, CloseIcon } from '@silverstripe/admin-patterns';
import { keptHeaderDelay } from '../header/SectionHeader';
import { useMediaQuery } from '../useMediaQuery';
import { usePanelEntry } from './state';
import type { PanelEntry } from './state';
import './panel.css';

// The 1200 frame (1928) is the narrowest with the panel beside the list; panel.css steps its width from here
export const panelBesideQuery = '(width >= 1200px)';

/** Whether a panel is open and, at this width, drawn in place of the content */
export function usePanelReplacesContent(): boolean {
  const open = usePanelEntry() !== null;
  const beside = useMediaQuery(panelBesideQuery);
  return open && !beside;
}

function focusLost(): boolean {
  const active = document.activeElement;
  return !active || active === document.body;
}

/** Focus is nowhere, on the main landmark, or on the section header's h1, where a route change puts it */
function focusMovable(): boolean {
  const active = document.activeElement;
  if (focusLost() || active?.tagName === 'MAIN') {
    return true;
  }
  return active instanceof HTMLHeadingElement && active.tagName === 'H1' && active.tabIndex === -1;
}

/** Moves focus now and again after the section header's route-change landing; returns a canceller */
function settleFocus(target: () => HTMLElement | null, movable: () => boolean = focusMovable): () => void {
  const attempt = () => {
    if (movable()) {
      target()?.focus();
    }
  };
  attempt();
  const frame = requestAnimationFrame(attempt);
  const timer = setTimeout(attempt, keptHeaderDelay);
  return () => {
    cancelAnimationFrame(frame);
    clearTimeout(timer);
  };
}

function returnTarget(closed: PanelEntry): HTMLElement | null {
  const opener = closed.opener?.isConnected ? closed.opener : null;
  return opener ?? closed.options.returnFocus?.() ?? document.querySelector<HTMLElement>('main');
}

interface PanelErrorBoundaryProps {
  children: React.ReactNode;
}

interface PanelErrorBoundaryState {
  failed: boolean;
}

// React catches render errors only in a class component
class PanelErrorBoundary extends React.Component<PanelErrorBoundaryProps, PanelErrorBoundaryState> {
  state: PanelErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): PanelErrorBoundaryState {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('The details panel content failed to render', error);
  }

  render() {
    return this.state.failed ? (
      <Alert type="error">This panel could not be shown.</Alert>
    ) : (
      this.props.children
    );
  }
}

interface PanelChromeProps {
  entry: PanelEntry;
  beside: boolean;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onCloseRequest: () => void;
}

const PanelChrome = ({ entry, beside, headingRef, onCloseRequest }: PanelChromeProps) => {
  const { title, badge, meta, content, footer, onClose, closeLabel } = entry.options;
  const headingId = React.useId();
  return (
    <section className={beside ? 'shell-panel shell-panel--beside' : 'shell-panel'} aria-labelledby={headingId}>
      <div className="shell-panel__header">
        <div className="shell-panel__heading">
          <div className="shell-panel__title-row">
            <h2 className="shell-panel__title" id={headingId} ref={headingRef} tabIndex={-1}>
              {title}
            </h2>
            {badge && <span className="admin-badge">{badge}</span>}
          </div>
          {meta && meta.length > 0 && (
            <p className="shell-panel__meta">
              {meta.map((item, index) => (
                <React.Fragment key={`${index}:${item}`}>
                  {index > 0 && <span className="shell-panel__meta-rule" aria-hidden="true" />}
                  <span>{item}</span>
                </React.Fragment>
              ))}
            </p>
          )}
        </div>
        <Button
          className="shell-panel__close"
          variant="tertiary"
          iconOnly
          aria-label={closeLabel ?? `Close ${title}`}
          icon={<CloseIcon />}
          onClick={() => {
            onCloseRequest();
            onClose();
          }}
        />
      </div>
      <div className="shell-panel__body">
        <PanelErrorBoundary>{content}</PanelErrorBoundary>
      </div>
      {footer && <div className="shell-panel__footer">{footer}</div>}
    </section>
  );
};

export const ShellPanel = () => {
  const entry = usePanelEntry();
  const beside = useMediaQuery(panelBesideQuery);
  const headingRef = React.useRef<HTMLHeadingElement>(null);
  const key = entry?.key;

  React.useEffect(() => {
    if (key === undefined) {
      return undefined;
    }
    headingRef.current?.focus();
    return settleFocus(() => headingRef.current);
  }, [key]);

  const [shown, setShown] = React.useState(entry);
  const [closed, setClosed] = React.useState<PanelEntry | null>(null);
  if (shown !== entry) {
    setShown(entry);
    setClosed(entry ? null : shown);
  }

  // The key of the panel whose close button was pressed, so its close may take focus back from the h1
  const closeRequested = React.useRef<number | null>(null);

  React.useEffect(() => {
    if (!closed) {
      return undefined;
    }
    const byUser = closeRequested.current === closed.key;
    closeRequested.current = null;
    return settleFocus(() => returnTarget(closed), byUser ? focusMovable : focusLost);
  }, [closed]);

  return entry ? (
    <PanelChrome
      key={entry.key}
      entry={entry}
      beside={beside}
      headingRef={headingRef}
      onCloseRequest={() => {
        closeRequested.current = entry.key;
      }}
    />
  ) : null;
};
