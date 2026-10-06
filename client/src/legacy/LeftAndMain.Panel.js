import $ from 'jquery';

$.entwine('ss', function($) {

  // setup jquery.entwine
  $.entwine.warningLevel = $.entwine.WARN_LEVEL_BESTPRACTISE;

  /**
   * Horizontal collapsible panel. Generic enough to work with CMS menu as well as various "filter" panels.
   *
   * A panel consists of the following parts:
   * - Container div: The outer element, with class ".cms-panel"
   * - Header (optional)
   * - Content
   * - Panel toggle (optional)
   *
   * Sample HTML:
   *
   * <div class="cms-panel">
   *   <div class="cms-panel-header">your header</div>
   *   <div class="cms-panel-content">your content here</div>
   *   <div class="cms-panel-toggle">
   *     <button
   *       class="cms-panel-toggle__button"
   *       title="<%t SilverStripe\\Admin\\LeftAndMain.CollapsePanel "Collapse panel" %>"
   *       data-bs-toggle="tooltip"
   *       aria-expanded="true"
   *       aria-controls="cms-menu"
   *       data-expanded-label="&laquo;"
   *       data-expanded-title="<%t SilverStripe\\Admin\\LeftAndMain.CollapsePanel "Collapse panel" %>"
   *       data-collapsed-label="&raquo;"
   *       data-collapsed-title="<%t SilverStripe\\Admin\\LeftAndMain.ExpandPanel "Expand panel" %>"
   *     >&laquo;</button>
   *   </div>
   * </div>
   */
  $('.cms-panel').entwine({

    WidthExpanded: null,

    WidthCollapsed: null,

    /**
     * @func canSetCookie
     * @return {boolean}
     * @desc Before trying to set a cookie, make sure $.cookie and the element's id are both defined.
     */
    canSetCookie: function () {
      return $.cookie !== void 0 && this.attr('id') !== void 0;
    },

    /**
     * @func getPersistedCollapsedState
     * @return {boolean|undefined} - Returns true if the panel is collapsed, false if expanded. Returns undefined if there is no cookie set.
     * @desc Get the collapsed state of the panel according to the cookie.
     */
    getPersistedCollapsedState: function () {
      var isCollapsed, cookieValue;

      if (this.canSetCookie()) {
        cookieValue = $.cookie('cms-panel-collapsed-' + this.attr('id'));

        if (cookieValue !== void 0 && cookieValue !== null) {
          isCollapsed = cookieValue === 'true';
        }
      }

      return isCollapsed;
    },

    /**
     * @func setPersistedCollapsedState
     * @param {boolean} newState - Pass true if you want the panel to be collapsed, false for expanded.
     * @desc Set the collapsed value of the panel, stored in cookies.
     */
    setPersistedCollapsedState: function (newState) {
      if (this.canSetCookie()) {
        $.cookie('cms-panel-collapsed-' + this.attr('id'), newState, { path: '/', expires: 31 });
      }
    },

    /**
     * @func clearPersistedState
     * @desc Remove the cookie responsible for maintaing the collapsed state.
     */
    clearPersistedCollapsedState: function () {
      if (this.canSetCookie()) {
        $.cookie('cms-panel-collapsed-' + this.attr('id'), '', { path: '/', expires: -1 });
      }
    },

    /**
     * @func getInitialCollapsedState
     * @return {boolean} - Returns true if the the panel is collapsed, false if expanded.
     * @desc Get the initial collapsed state of the panel. Check if a cookie value is set then fall back to checking CSS classes.
     */
    getInitialCollapsedState: function () {
      var isCollapsed = this.getPersistedCollapsedState();

      // Fallback to getting the state from the default CSS class
      if (isCollapsed === void 0) {
        isCollapsed = this.hasClass('collapsed');
      }

      return isCollapsed;
    },

    onadd: function() {
      if(!this.find('.cms-panel-content').length) {
        throw new Exception('Content panel for ".cms-panel" not found');
      }

      // Create default controls unless they already exist.
      // This is here for backwards compatibility reasons and should be removed in a future major release
      if(!this.find('.cms-panel-toggle').length) {
        const expandedTitle = i18n._t('Admin.COLLAPSEPANEL', 'Collapse panel');
        const collapsedTitle = i18n._t('Admin.EXPANDPANEL', 'Expand panel');
        const expandedLabel = '&laquo;'
        const collapsedLabel = '&raquo;'
        const panelToggle = $(`<div class='toolbar toolbar--south cms-panel-toggle'>
          <button
            class="cms-panel-toggle__button"
            title="${expandedTitle}"
            data-bs-toggle="tooltip"
            aria-expanded="true"
            aria-controls="cms-menu"
            data-expanded-label="${expandedLabel}"
            data-expanded-title="${expandedTitle}"
            data-collapsed-label="${collapsedLabel}"
            data-collapsed-title="${collapsedTitle}"
          >${expandedLabel}</button>
        </div>`);
        this.append(panelToggle);
      }

      // Set panel width same as the content panel it contains. Assumes the panel has overflow: hidden.
      this.setWidthExpanded(this.find('.cms-panel-content').innerWidth());

      // Assumes the collapsed width is indicated by the toggle, or by an optionally collapsed view
      const collapsedContent = this.find('.cms-panel-content-collapsed');
      this.setWidthCollapsed(collapsedContent.length ? collapsedContent.innerWidth() : this.find('.cms-panel-toggle__button').innerWidth());

      // Toggle visibility
      this.togglePanel(!this.getInitialCollapsedState(), true, false);

      this._super();
    },

    /**
     * @func togglePanel
     * @param doExpand {boolean} - true to expand, false to collapse.
     * @param silent {boolean} - true means that events won't be fired, which is useful for the component initialization phase.
     * @param doSaveState - if false, the panel's state will not be persisted via cookies.
     * @desc Toggle the expanded / collapsed state of the panel.
     */
    togglePanel: function(doExpand, silent, doSaveState) {
      var newWidth, collapsedContent;

      if(!silent) {
        this.trigger('beforetoggle.sspanel', doExpand);
        this.trigger(doExpand ? 'beforeexpand' : 'beforecollapse');
      }

      this.toggleClass('collapsed', !doExpand);
      newWidth = doExpand ? this.getWidthExpanded() : this.getWidthCollapsed();

      this.width(newWidth); // the content panel width always stays in "expanded state" to avoid floating elements

      // If an alternative collapsed view exists, toggle it as well
      collapsedContent = this.find('.cms-panel-content-collapsed');
      if(collapsedContent.length) {
        this.find('.cms-panel-content')[doExpand ? 'show' : 'hide']();
        this.find('.cms-panel-content-collapsed')[doExpand ? 'hide' : 'show']();
      }

      if (doSaveState !== false) {
        this.setPersistedCollapsedState(!doExpand);
      }

      this.trigger('toggle', doExpand);
      this.trigger(doExpand ? 'expand' : 'collapse');

      // Update decendant button
      const button = this.find('.cms-panel-toggle__button');
      if (doExpand) {
        const title = button.attr('data-expanded-title');
        button.attr('aria-expanded', 'true');
        button.attr('aria-label', title)
        button.attr('title', title);
        button.html(button.attr('data-expanded-label'));
      } else {
        const title = button.attr('data-collapsed-title');
        button.attr('aria-expanded', 'false');
        button.attr('aria-label', title)
        button.attr('title', title);
        button.html(button.attr('data-collapsed-label'));
      }
    },

    expandPanel: function(force) {
      if(!force && !this.hasClass('collapsed')) return;

      this.togglePanel(true);
    },

    collapsePanel: function(force) {
      if(!force && this.hasClass('collapsed')) return;

      this.togglePanel(false);
    }
  });

  $('.cms-panel *').entwine({
    getPanel: function() {
      return this.parents('.cms-panel:first');
    }
  });

  $('.cms-panel .cms-panel-toggle__button').entwine({
    onclick: function(e) {
      e.preventDefault();
      e.stopPropagation();
      const doExpand = this.attr('aria-expanded') === 'false';
      this.closest('.cms-panel').togglePanel(doExpand);
      this._super(e);
    }
  });

  $('.cms-content-tools.collapsed').entwine({
    // Expand CMS' centre pane, when the pane itself is clicked somewhere
    onclick: function(e) {
      this.expandPanel();
      this._super(e);
    }
  });
});
