<?php

namespace SilverStripe\Admin\UserInterface\LinkModal;

use SilverStripe\Control\HTTPRequest;
use SilverStripe\Core\Validation\ValidationResult;
use SilverStripe\Forms\TreeDropdownField;
use SilverStripe\ORM\DataObject;

/**
 * A tree dropdown that refuses to open a subtree at a record the member may not view. The filter function
 * hides such records among the children, but the record a subtree opens at is answered as its root node.
 *
 * A posted value must be a record the member may view and that the disable function leaves selectable
 */
class ViewableTreeDropdownField extends TreeDropdownField
{
    private static $allowed_actions = ['tree'];

    public function tree(HTTPRequest $request)
    {
        $id = (int) (is_numeric($request->latestParam('ID')) ? $request->latestParam('ID') : $request->requestVar('ID'));
        if ($id && !$request->requestVar('forceFullTree')) {
            $root = DataObject::get_by_id($this->getSourceObject(), $id);
            if ($root && !$root->canView()) {
                $this->httpError(403);
            }
        }
        return parent::tree($request);
    }

    public function validate(): ValidationResult
    {
        $result = parent::validate();
        if (!$this->getValue()) {
            return $result;
        }
        $record = DataObject::get($this->getSourceObject())->filter($this->getKeyField(), $this->getValue())->first();
        if (!$record || !$record->canView()) {
            $result->addFieldError(
                $this->getName(),
                _t(__CLASS__ . '.NOT_AVAILABLE', 'That item is not available. Select another.')
            );
        } elseif ($this->nodeIsDisabled($record)) {
            $result->addFieldError(
                $this->getName(),
                _t(__CLASS__ . '.NOT_SELECTABLE', 'That item cannot be selected. Select another.')
            );
        }
        return $result;
    }
}
