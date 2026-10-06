import React, {Component} from 'react';
import classNames from 'classnames';
import { FieldHolder } from '@silverstripe/admin-patterns';
import type { FieldComponentProps } from '@silverstripe/admin-shell';
import FocusPointPicker from './FocusPointPicker';
import { pickerSize } from './focusPoint';
import './FocusPointField.css';

export interface FocusPointState {
  data: {
    tooltip?: string;
    showDebug?: boolean;
    previewUrl?: string;
    previewWidth?: number;
    previewHeight?: number;
    X?: number;
    Y?: number;
  };
}

class FocusPointField extends Component<FieldComponentProps<unknown, FocusPointState>, any> {
  constructor(props) {
    super(props);

    const data = props.field.data as FocusPointState['data'];
    this.state = {
      FocusX: data.X ?? 0,
      FocusY: data.Y ?? 0
    };
    this.handleFocusChange = this.handleFocusChange.bind(this);
  }

  handleFocusChange({focusX, focusY}) {
    this.setState({
      FocusX: focusX,
      FocusY: focusY
    });

    const {autofill, field: {name}} = this.props;

    autofill(`${name}X`, focusX);
    autofill(`${name}Y`, focusY);
  }

  // The schema is fetched again after a save, which can move the saved point
  componentDidUpdate(oldProps) {
    const {X, Y} = this.props.field.data as FocusPointState['data'];
    const old = oldProps.field.data as FocusPointState['data'];
    if (X !== old.X || Y !== old.Y) {
      this.setState({ FocusX: X ?? 0, FocusY: Y ?? 0 });
    }
  }

  render() {
    const {field, renderFields} = this.props;
    const {showDebug, tooltip, previewUrl, previewWidth, previewHeight} = field.data as FocusPointState['data'];
    const {FocusX, FocusY} = this.state;
    const {width, height} = pickerSize(previewWidth ?? 0, previewHeight ?? 0);

    return (
      <FieldHolder field={field}>
        <div className={classNames('focuspoint-field', {'focuspoint-field--debug': showDebug})} id={field.id}>
          <div className="focuspoint-field__image-wrapper">
            <FocusPointPicker
              className="focuspoint-field__picker"
              id={`${field.id}_Picker`}
              imageUrl={previewUrl}
              focusX={FocusX}
              focusY={FocusY}
              width={width}
              height={height}
              tooltip={tooltip}
              readOnly={field.readOnly}
              onChange={this.handleFocusChange}
            />
          </div>
          {showDebug && renderFields(field.children)}
        </div>
      </FieldHolder>
    )
  }
}

export { FocusPointField as Component };

export default FocusPointField;
