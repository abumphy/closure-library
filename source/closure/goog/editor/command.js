/**
 * @license
 * Copyright The Closure Library Authors.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * @fileoverview Commands that the editor can execute.
 * @see ../demos/editor/editor.html
 */
goog.provide('goog.editor.Command');


/**
 * Commands that the editor can excute via execCommand or queryCommandValue.
 * @enum {string}
 */
goog.editor.Command = {
  // Prepend all the strings of built in execCommands with a plus to ensure
  // that there's no conflict if a client wants to use the
  // browser's execCommand.
  UNDO: '+undo',
  REDO: '+redo',
  LINK: '+link',
  FORMAT_BLOCK: '+formatBlock',
  INDENT: '+indent',
  OUTDENT: '+outdent',
  REMOVE_FORMAT: '+removeFormat',
  STRIKE_THROUGH: '+strikeThrough',
  HORIZONTAL_RULE: '+insertHorizontalRule',
  SUBSCRIPT: '+subscript',
  SUPERSCRIPT: '+superscript',
  UNDERLINE: '+underline',
  BOLD: '+bold',
  ITALIC: '+italic',
  FONT_SIZE: '+fontSize',
  FONT_FACE: '+fontName',
  FONT_COLOR: '+foreColor',
  EMOTICON: '+emoticon',
  EQUATION: '+equation',
  BACKGROUND_COLOR: '+backColor',
  ORDERED_LIST: '+insertOrderedList',
  UNORDERED_LIST: '+insertUnorderedList',
  TABLE: '+table',
  JUSTIFY_CENTER: '+justifyCenter',
  JUSTIFY_FULL: '+justifyFull',
  JUSTIFY_RIGHT: '+justifyRight',
  JUSTIFY_LEFT: '+justifyLeft',
  BLOCKQUOTE: '+BLOCKQUOTE',  // This is a nodename. Should be all caps.
  DIR_LTR: 'ltr',  // should be exactly 'ltr' as it becomes dir attribute value
  DIR_RTL: 'rtl',  // same here
  IMAGE: 'image',
  EDIT_HTML: 'editHtml',
  UPDATE_LINK_BUBBLE: 'updateLinkBubble',

  // queryCommandValue only: returns the default tag name used in the field.
  // DIV should be considered the default if no plugin responds.
  DEFAULT_TAG: '+defaultTag',

  // TODO(nicksantos): Try to give clients an API so that they don't need
  // these execCommands.
  CLEAR_LOREM: 'clearlorem',
  UPDATE_LOREM: 'updatelorem',
  USING_LOREM: 'usinglorem',

  // Modal editor commands (usually dialogs).
  MODAL_LINK_EDITOR: 'link'
};