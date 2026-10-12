import { Component, createRef } from 'react';
import type { KeyboardEvent, MouseEvent } from 'react';
import classNames from 'classnames';
import { describePoint, focusFromClick, markerPercent, nudge } from './focusPoint';
import type { FocusPoint } from './focusPoint';

export interface FocusPointPickerProps {
  id: string;
  className?: string;
  imageUrl?: string;
  width?: number;
  height?: number;
  tooltip?: string;
  readOnly?: boolean;
  focusX?: number;
  focusY?: number;
  onChange?: ((point: FocusPoint) => void) | null;
}

class FocusPointPicker extends Component<FocusPointPickerProps, FocusPoint> {
  marker = createRef<HTMLSpanElement>();

  constructor(props: FocusPointPickerProps) {
    super(props);
    this.state = {
      focusX: props.focusX || 0,
      focusY: props.focusY || 0
    };
    this.handleClick = this.handleClick.bind(this);
    this.handleKeyDown = this.handleKeyDown.bind(this);
  }

  // Measured from the rendered box, which differs from the width and height props when the box scales
  handleClick(event: MouseEvent<HTMLElement>) {
    if (this.props.readOnly) {
      return;
    }
    const box = event.currentTarget.getBoundingClientRect();
    this.change(focusFromClick(event.clientX - box.left, event.clientY - box.top, box.width, box.height));
  }

  handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (this.props.readOnly) {
      return;
    }
    const {focusX, focusY} = this.state;
    const point = nudge({focusX, focusY}, event.key, event.shiftKey ? 0.01 : undefined);
    if (point) {
      event.preventDefault();
      this.change(point);
    }
  }

  change(point: FocusPoint) {
    if (typeof this.props.onChange === 'function') {
      this.props.onChange(point);
    }
  }

  static getDerivedStateFromProps(nextProps: FocusPointPickerProps): FocusPoint {
    return {
      focusX: nextProps.focusX || 0,
      focusY: nextProps.focusY || 0
    };
  }

  componentDidMount() {
    this.placeMarker();
  }

  componentDidUpdate() {
    this.placeMarker();
  }

  placeMarker() {
    const {focusX, focusY} = this.state;
    const {left, top} = markerPercent(focusX, focusY);
    const marker = this.marker.current;
    marker?.style.setProperty('--focuspoint-picker-left', `${left}%`);
    marker?.style.setProperty('--focuspoint-picker-top', `${top}%`);
  }

  render() {
    const {width = 0, height = 0, imageUrl = '', tooltip = '', className, readOnly, id} = this.props;
    const {focusX, focusY} = this.state;
    const hintId = `${id}_hint`;
    return (
      <div className={classNames(className, "focuspoint-picker")} title={tooltip}>
        <img className="focuspoint-picker__image"
             src={imageUrl}
             width={width}
             height={height}
             alt={tooltip}
        />
        <span className="focuspoint-picker__marker" ref={this.marker}/>
        <span
          className="focuspoint-picker__overlay"
          role="slider"
          tabIndex={readOnly ? -1 : 0}
          aria-label="Focus point"
          aria-describedby={hintId}
          aria-valuemin={-1}
          aria-valuemax={1}
          aria-valuenow={focusX}
          aria-valuetext={describePoint({focusX, focusY})}
          aria-orientation="horizontal"
          aria-disabled={readOnly || undefined}
          onClick={this.handleClick}
          onKeyDown={this.handleKeyDown}
        />
        <span id={hintId} hidden>
          {tooltip && !/[.!?]$/.test(tooltip) ? `${tooltip}.` : tooltip} Arrow keys move the point by 0.1, with Shift by 0.01.
        </span>
      </div>
    )
  }
}


export default FocusPointPicker;
