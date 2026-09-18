/* global s9e */

import Extend from 'flarum/common/extenders';
import app from 'flarum/forum/app';
import Button from 'flarum/common/components/Button';
import FormModal from 'flarum/common/components/FormModal';
import Modal from 'flarum/common/components/Modal';
import Notification from 'flarum/forum/components/Notification';
import TextEditorButton from 'flarum/common/components/TextEditorButton';
import Badge from 'flarum/common/components/Badge';
import BasicEditorDriver from 'flarum/common/utils/BasicEditorDriver';
import Discussion from 'flarum/common/models/Discussion';
import Post from 'flarum/common/models/Post';
import Stream from 'flarum/common/utils/Stream';
import { extend as extendComponent, override as overrideComponent } from 'flarum/common/extend';

const apiUrl = () => `${app.forum.attribute('apiUrl')}`;
const currencyShort = () => app.forum.attribute('pointSystem.points_short') || app.forum.attribute('pointSystem.currency_name') || '积分';
const currencyIcon = () => app.forum.attribute('pointSystem.currency_icon') || 'fas fa-coins';

function costLabel(cost) {
  return `${Number(cost).toLocaleString()} ${currencyShort()}`;
}

function amountLabel(amount) {
  return `${Number(amount).toFixed(2)} ${currencyShort()}`;
}

function showError(message) {
  app.alerts.show({ type: 'error' }, message);
}

function decoratePayToSeePreview(root) {
  if (!root || !root.ownerDocument) return;

  const document = root.ownerDocument;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  let node;

  while ((node = walker.nextNode())) {
    if (node.parentElement?.closest('.PayToSeePreview')) continue;
    if (/\[pay\][\s\S]*?\[\/pay\]/i.test(node.nodeValue || '')) {
      textNodes.push(node);
    }
  }

  textNodes.forEach((textNode) => {
    const text = textNode.nodeValue || '';
    const fragment = document.createDocumentFragment();
    let cursor = 0;
    let match;
    const pattern = /\[pay\]([\s\S]*?)\[\/pay\]/gi;

    while ((match = pattern.exec(text))) {
      if (match.index > cursor) {
        fragment.appendChild(document.createTextNode(text.slice(cursor, match.index)));
      }

      const block = document.createElement('div');
      block.className = 'pay2see_gray PayToSeePreview';

      const header = document.createElement('div');
      header.className = 'pay2see_header_gray';
      header.textContent = '付费内容预览';

      const content = document.createElement('div');
      content.className = 'PayToSeePreview-content';
      content.textContent = match[1];

      block.append(header, content);
      fragment.appendChild(block);
      cursor = pattern.lastIndex;
    }

    if (cursor < text.length) {
      fragment.appendChild(document.createTextNode(text.slice(cursor)));
    }

    textNode.parentNode?.replaceChild(fragment, textNode);
  });
}

const PAY_TAG_PATTERN = /\[pay\]([\s\S]*?)\[\/pay\]/gi;

function normalizeEditableText(element) {
  return (element?.innerText || '').replace(/\r\n/g, '\n').replace(/\u200b/g, '').replace(/\n$/, '');
}

function parsePayToSeeParts(value) {
  const parts = [];
  let cursor = 0;
  let match;

  PAY_TAG_PATTERN.lastIndex = 0;

  while ((match = PAY_TAG_PATTERN.exec(value || ''))) {
    if (match.index > cursor) {
      parts.push({ type: 'text', text: value.slice(cursor, match.index) });
    }

    parts.push({ type: 'pay', text: match[1] });
    cursor = PAY_TAG_PATTERN.lastIndex;
  }

  if (cursor < (value || '').length) {
    parts.push({ type: 'text', text: value.slice(cursor) });
  }

  return parts.length ? parts : [{ type: 'text', text: value || '' }];
}

function serializePayToSeeParts(parts) {
  return parts
    .map((part) => (part.type === 'pay' ? `[pay]${part.text || ''}[/pay]` : part.text || ''))
    .join('');
}

class PayToSeeVisualEditorDriver extends BasicEditorDriver {
  constructor(dom, params) {
    super(dom, params);

    this.params = params;
    this.syncingFromVisual = false;
    this.el.classList.add('Pay2SeeVisualEditor-source');
    this.syncSourceSelection = this.syncSourceSelection.bind(this);
    this.handleVisualKeydown = this.handleVisualKeydown.bind(this);

    this.visual = document.createElement('div');
    this.visual.className = 'FormControl Composer-flexible TextEditor-editor Pay2SeeVisualEditor';
    this.visual.setAttribute('role', 'textbox');
    this.visual.setAttribute('aria-multiline', 'true');
    this.visual.addEventListener('keydown', this.handleVisualKeydown);
    dom.insertBefore(this.visual, this.el);

    this.el.addEventListener('input', () => {
      if (this.syncingFromVisual || this.el.value === this.value) return;
      this.value = this.el.value;
      this.renderVisual();
    });
    document.addEventListener('selectionchange', this.syncSourceSelection);

    this.value = params.value || '';
    this.renderVisual();
  }

  partsFromVisual() {
    return Array.from(this.visual.childNodes).map((node) => {
      if (node.classList?.contains('Pay2SeeVisualBlock')) {
        return { type: 'pay', text: normalizeEditableText(node.querySelector('.Pay2SeeVisualBlock-body')) };
      }

      return { type: 'text', text: normalizeEditableText(node) };
    });
  }

  updateValueFromVisual() {
    this.value = serializePayToSeeParts(this.partsFromVisual());
    this.syncingFromVisual = true;
    this.el.value = this.value;
    this.el.dispatchEvent(new CustomEvent('input', { bubbles: true, cancelable: true }));
    this.syncingFromVisual = false;
    this.syncSourceSelection();
  }

  setParts(parts, focusPayIndex = null) {
    this.value = serializePayToSeeParts(parts);
    this.syncingFromVisual = true;
    this.el.value = this.value;
    this.el.dispatchEvent(new CustomEvent('input', { bubbles: true, cancelable: true }));
    this.syncingFromVisual = false;
    this.renderVisual(focusPayIndex);
  }

  makeEditableText(part, index) {
    const block = document.createElement('div');
    block.className = 'Pay2SeeVisualText';
    block.contentEditable = String(!this.el.disabled);
    block.dataset.partIndex = String(index);
    block.dataset.placeholder = this.params.placeholder || '';
    block.innerText = part.text || '';
    block.addEventListener('input', () => this.updateValueFromVisual());
    block.addEventListener('paste', this.handlePlainTextPaste.bind(this));
    return block;
  }

  makePayBlock(part, payIndex) {
    const block = document.createElement('div');
    block.className = 'Pay2SeeVisualBlock';
    block.dataset.payIndex = String(payIndex);

    const header = document.createElement('div');
    header.className = 'Pay2SeeVisualBlock-header';
    header.contentEditable = 'false';
    header.setAttribute('aria-hidden', 'true');
    const icon = document.createElement('i');
    icon.className = currencyIcon();
    icon.setAttribute('aria-hidden', 'true');
    const label = document.createElement('span');
    label.textContent = '付费内容';
    header.append(icon, label);

    const body = document.createElement('div');
    body.className = 'Pay2SeeVisualBlock-body';
    body.contentEditable = String(!this.el.disabled);
    body.dataset.placeholder = '在这里输入付费后可见的内容';
    body.innerText = part.text || '';
    body.addEventListener('input', () => this.updateValueFromVisual());
    body.addEventListener('paste', this.handlePlainTextPaste.bind(this));

    block.append(header, body);
    return block;
  }

  renderVisual(focusPayIndex = null) {
    const parts = parsePayToSeeParts(this.value);
    let payIndex = 0;

    this.visual.innerHTML = '';
    parts.forEach((part, index) => {
      if (part.type === 'pay') {
        this.visual.append(this.makePayBlock(part, payIndex));
        payIndex += 1;
      } else {
        this.visual.append(this.makeEditableText(part, index));
      }
    });

    if (focusPayIndex !== null) {
      const body = this.visual.querySelector(`.Pay2SeeVisualBlock[data-pay-index=\"${focusPayIndex}\"] .Pay2SeeVisualBlock-body`);
      this.focusEditable(body);
    }

    const hasPayContent = parts.some((part) => part.type === 'pay');
    this.el.classList.toggle('Pay2SeeVisualEditor-source--hidden', hasPayContent);
    this.visual.classList.toggle('Pay2SeeVisualEditor--active', hasPayContent);
  }

  handlePlainTextPaste(event) {
    event.preventDefault();
    const text = event.clipboardData?.getData('text/plain') || '';

    if (document.execCommand?.('insertText', false, text)) return;

    const selection = window.getSelection();
    if (!selection?.rangeCount) return;

    const range = selection.getRangeAt(0);
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
    range.collapse(false);
    this.updateValueFromVisual();
  }

  focusEditable(element) {
    const target = element || this.visual.querySelector('[contenteditable=\"true\"]');
    if (!target) return;

    target.focus();
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    this.syncSourceSelection();
  }

  focusEditableAtOffset(element, offset) {
    if (!element) return;

    element.focus();

    const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    let remaining = Math.max(0, offset);

    while (node) {
      if (remaining <= node.nodeValue.length) {
        const range = document.createRange();
        range.setStart(node, remaining);
        range.collapse(true);

        const selection = window.getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        this.syncSourceSelection();
        return;
      }

      remaining -= node.nodeValue.length;
      node = walker.nextNode();
    }

    this.focusEditable(element);
  }

  selectedTextInEditable(editable, range) {
    const beforeRange = range.cloneRange();
    beforeRange.selectNodeContents(editable);
    beforeRange.setEnd(range.startContainer, range.startOffset);
    const start = beforeRange.toString().length;
    const selected = range.toString();
    return { start, end: start + selected.length, selected };
  }

  sourceOffsetForPoint(node, offset) {
    const element = node.nodeType === Node.ELEMENT_NODE ? node : node.parentElement;
    const partElement = element?.closest?.('.Pay2SeeVisualText, .Pay2SeeVisualBlock');

    if (!partElement || !this.visual.contains(partElement)) return null;

    const topLevel = partElement.classList.contains('Pay2SeeVisualBlock')
      ? partElement
      : partElement;
    const partIndex = Array.from(this.visual.children).indexOf(topLevel);
    if (partIndex < 0) return null;

    const parts = this.partsFromVisual();
    let sourceOffset = 0;

    for (let index = 0; index < partIndex; index += 1) {
      sourceOffset += parts[index].type === 'pay' ? 11 + parts[index].text.length : parts[index].text.length;
    }

    const range = document.createRange();
    const contentElement = topLevel.classList.contains('Pay2SeeVisualBlock')
      ? topLevel.querySelector('.Pay2SeeVisualBlock-body')
      : topLevel;

    if (!contentElement || !contentElement.contains(node)) return null;

    range.selectNodeContents(contentElement);
    range.setEnd(node, offset);
    sourceOffset += topLevel.classList.contains('Pay2SeeVisualBlock') ? 5 + range.toString().length : range.toString().length;

    return sourceOffset;
  }

  syncSourceSelection() {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !this.visual.contains(selection.anchorNode)) return;

    const start = this.sourceOffsetForPoint(selection.anchorNode, selection.anchorOffset);
    const end = this.sourceOffsetForPoint(selection.focusNode, selection.focusOffset);

    if (start === null || end === null) return;

    this.el.setSelectionRange(Math.min(start, end), Math.max(start, end));
  }

  visualSelection() {
    const selection = window.getSelection();
    if (!selection?.rangeCount || !this.visual.contains(selection.anchorNode)) return null;

    const range = selection.getRangeAt(0);
    const editable = range.commonAncestorContainer.nodeType === Node.ELEMENT_NODE
      ? range.commonAncestorContainer.closest?.('.Pay2SeeVisualText')
      : range.commonAncestorContainer.parentElement?.closest('.Pay2SeeVisualText');

    if (!editable || !this.visual.contains(editable)) return null;

    return {
      editable,
      range,
      partIndex: Number(editable.dataset.partIndex || 0),
    };
  }

  ensurePayBlock() {
    const parts = parsePayToSeeParts(this.value);
    const hasPayContent = parts.some((part) => part.type === 'pay');

    if (!hasPayContent) {
      const text = this.value || '';
      const start = Math.max(0, this.el.selectionStart ?? text.length);
      const end = Math.max(start, this.el.selectionEnd ?? start);

      this.setParts([
        { type: 'text', text: text.slice(0, start) },
        { type: 'pay', text: text.slice(start, end) },
        { type: 'text', text: text.slice(end) },
      ], 0);
      return;
    }

    const visualSelection = this.visualSelection();
    if (visualSelection) {
      const { editable, range, partIndex } = visualSelection;
      const text = normalizeEditableText(editable);
      const { start, end, selected } = this.selectedTextInEditable(editable, range);
      const focusPayIndex = parts
        .slice(0, partIndex)
        .filter((part) => part.type === 'pay')
        .length;
      const replacement = [
        { type: 'text', text: text.slice(0, start) },
        { type: 'pay', text: selected },
        { type: 'text', text: text.slice(end) },
      ];

      parts.splice(partIndex, 1, ...replacement);
      this.setParts(parts, focusPayIndex);
      return;
    }

    const existing = this.visual.querySelector('.Pay2SeeVisualBlock-body');
    if (existing) {
      this.focusEditable(existing);
      return;
    }

    parts.push({ type: 'text', text: parts.length ? '\n\n' : '' }, { type: 'pay', text: '' });
    this.setParts(parts, parts.filter((part) => part.type === 'pay').length - 1);
  }
  removePayBlocks() {
    const parts = parsePayToSeeParts(this.value).filter((part) => part.type !== 'pay');
    this.value = serializePayToSeeParts(parts);
    this.syncingFromVisual = true;
    this.el.value = this.value;
    this.el.dispatchEvent(new CustomEvent('input', { bubbles: true, cancelable: true }));
    this.syncingFromVisual = false;
    this.renderVisual();
    this.focus();
  }

  moveCursorTo(position) {
    this.el.setSelectionRange(position, position);

    if (this.visual.classList.contains('Pay2SeeVisualEditor--active')) {
      this.focusSourceOffset(position);
    }
  }

  getSelectionRange() {
    return [this.el.selectionStart, this.el.selectionEnd];
  }

  getLastNChars(n) {
    const cursor = this.el.selectionStart ?? this.value.length;
    return this.el.value.slice(Math.max(0, cursor - n), cursor);
  }

  insertAtCursor(text) {
    if (/^\[pay\][\s\S]*\[\/pay\]$/i.test(text)) {
      this.ensurePayBlock();
      return;
    }

    const [selectionStart, selectionEnd] = this.getSelectionRange();
    this.insertBetween(selectionStart, selectionEnd, text);
  }

  insertAt(pos, text) {
    this.insertBetween(pos, pos, text);
  }

  insertBetween(selectionStart, selectionEnd, text) {
    const value = this.value || '';
    this.value = value.slice(0, selectionStart) + text + value.slice(selectionEnd);
    this.syncingFromVisual = true;
    this.el.value = this.value;
    this.el.dispatchEvent(new CustomEvent('input', { bubbles: true, cancelable: true }));
    this.syncingFromVisual = false;
    this.renderVisual();
    this.el.setSelectionRange(selectionStart + text.length, selectionStart + text.length);

    if (this.visual.classList.contains('Pay2SeeVisualEditor--active')) {
      this.focusSourceOffset(selectionStart + text.length);
    }
  }

  replaceBeforeCursor(start, text) {
    this.insertBetween(start, this.el.selectionStart ?? this.value.length, text);
  }

  disabled(disabled) {
    super.disabled(disabled);
    this.visual?.querySelectorAll('[contenteditable]').forEach((element) => {
      element.contentEditable = String(!disabled);
    });
  }

  focus() {
    if (!this.visual.classList.contains('Pay2SeeVisualEditor--active')) {
      super.focus();
      return;
    }

    this.focusEditable(document.activeElement?.closest?.('.Pay2SeeVisualEditor [contenteditable=\"true\"]'));
  }

  focusSourceOffset(offset) {
    const parts = parsePayToSeeParts(this.value);
    let sourceOffset = 0;
    let payIndex = 0;

    for (let index = 0; index < parts.length; index += 1) {
      const part = parts[index];
      const prefixLength = part.type === 'pay' ? 5 : 0;
      const serializedLength = part.type === 'pay' ? 11 + part.text.length : part.text.length;
      const position = Math.max(0, Math.min(offset - sourceOffset, serializedLength));
      const element = part.type === 'pay'
        ? this.visual.querySelector(`.Pay2SeeVisualBlock[data-pay-index="${payIndex}"] .Pay2SeeVisualBlock-body`)
        : this.visual.querySelector(`.Pay2SeeVisualText[data-part-index="${index}"]`);

      if (offset <= sourceOffset + serializedLength) {
        this.focusEditableAtOffset(element, Math.max(0, position - prefixLength));
        return;
      }

      sourceOffset += serializedLength;
      if (part.type === 'pay') payIndex += 1;
    }

    const editables = this.visual.querySelectorAll('[contenteditable="true"]');
    this.focusEditable(editables[editables.length - 1]);
  }

  handleVisualKeydown(event) {
    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
      event.preventDefault();
      this.params.onsubmit();
    }
  }

  destroy() {
    document.removeEventListener('selectionchange', this.syncSourceSelection);
    this.visual?.removeEventListener('keydown', this.handleVisualKeydown);
    this.visual?.remove();
    super.destroy();
  }
}

class PayToSeePriceModal extends Modal {
  oninit(vnode) {
    super.oninit(vnode);
    this.cost = Stream(this.attrs.cost === null || this.attrs.cost === undefined ? '' : String(this.attrs.cost));
  }

  className() {
    return 'PayToSeePriceModal Modal--small';
  }

  title() {
    return app.translator.trans(
      this.attrs.cost === null || this.attrs.cost === undefined
        ? 'pay-to-see.forum.set_pay_to_see_price'
        : 'pay-to-see.forum.modify_pay_to_see_price'
    );
  }

  content() {
    return (
      <div className="Modal-body">
        <div className="Form-group">
          <label>{app.translator.trans('pay-to-see.forum.set_pay_to_see_price')}</label>
          <input
            className="FormControl"
            type="number"
            min="1"
            step="1"
            required
            value={this.cost()}
            oninput={(event) => this.cost(event.target.value)}
          />
          <p className="helpText">
            <i className={currencyIcon()} aria-hidden="true" /> {currencyShort()}
          </p>
        </div>
        <div className="Form-group Form-controls">
          <Button className="Button Button--primary" type="button" loading={this.loading} onclick={() => this.save()}>
            {app.translator.trans('pay-to-see.lib.save')}
          </Button>
          {this.attrs.canRemove && (
            <Button
              className="Button Button--danger"
              type="button"
              disabled={this.loading}
              onclick={() => this.save(-1)}
            >
              {app.translator.trans('pay-to-see.forum.remove')}
            </Button>
          )}
          <Button className="Button" type="button" onclick={() => this.hide()}>
            {app.translator.trans('pay-to-see.lib.cancel')}
          </Button>
        </div>
      </div>
    );
  }

  save(forcedCost = null) {
    const cost = forcedCost === null ? Number(this.cost()) : forcedCost;

    if (!Number.isInteger(cost) || (cost < 1 && !(cost === -1 && this.attrs.canRemove))) {
      showError(app.translator.trans('pay-to-see.forum.purchase_error_not_found'));
      return;
    }

    this.loading = true;

    try {
      const result = this.attrs.onsubmit(cost);

      // Composer amount changes are local and synchronous; close immediately
      // so the header can redraw with the selected amount.
      if (!result || typeof result.then !== 'function') {
        this.hide();
        return;
      }

      result
        .then(() => this.hide())
        .catch(() => {
          this.loading = false;
          m.redraw();
        });
    } catch (error) {
      this.loading = false;
      m.redraw();
    }
  }
}

class PayToSeePurchaseModal extends FormModal {
  className() {
    return 'PayToSeePurchaseModal Modal--small';
  }

  title() {
    return app.translator.trans('pay-to-see.forum.purchase_confirmation');
  }

  content() {
    return (
      <div className="Modal-body">
        <p>
          {app.translator.trans('pay-to-see.forum.purchase_confirmation_text', {
            costText: <strong>{costLabel(this.attrs.cost)}</strong>,
          })}
        </p>
        <div className="Form-group Form-controls">
          <Button className="Button Button--primary" type="submit" loading={this.loading}>
            <i className={currencyIcon()} aria-hidden="true" /> {app.translator.trans('pay-to-see.forum.purchase_button')}
          </Button>
          <Button className="Button" type="button" onclick={() => this.hide()}>
            {app.translator.trans('pay-to-see.lib.cancel')}
          </Button>
        </div>
      </div>
    );
  }

  onsubmit(event) {
    event.preventDefault();
    this.loading = true;

    Promise.resolve(this.attrs.onsubmit())
      .then(() => this.hide())
      .catch(() => this.loaded());
  }
}

class PayToSeePurchasedUsersModal extends Modal {
  oninit(vnode) {
    super.oninit(vnode);
    this.loading = true;
    this.users = [];

    app
      .request({
        method: 'GET',
        url: `${apiUrl()}/pay2seePurchase`,
        params: { discussionID: this.attrs.discussion.id(), page: { limit: 100 } },
      })
      .then((response) => {
        const included = new Map((response.included || []).map((user) => [String(user.id), user]));
        this.users = (response.data || [])
          .map((purchase) => included.get(String(purchase.attributes.user_id)))
          .filter(Boolean);
      })
      .catch(() => showError(app.translator.trans('pay-to-see.forum.purchase_error_not_found')))
      .finally(() => {
        this.loading = false;
        m.redraw();
      });
  }

  className() {
    return 'PayToSeePurchasedUsersModal Modal--small';
  }

  title() {
    return app.translator.trans('pay-to-see.forum.purchased_users');
  }

  content() {
    return (
      <div className="Modal-body">
        {this.loading ? (
          <div className="LoadingIndicator-container">
            <div className="LoadingIndicator" />
          </div>
        ) : this.users.length ? (
          <ul className="PayToSeePurchasedUsers">
            {this.users.map((user) => (
              <li>
                <a href={app.route('user', { username: user.attributes.username })}>{user.attributes.displayName || user.attributes.username}</a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="helpText">{app.translator.trans('pay-to-see.forum.purchased_users_empty')}</p>
        )}
      </div>
    );
  }
}

class PayToSeeNotification extends Notification {
  icon() {
    return 'fas fa-lock-open';
  }

  href() {
    return app.route.discussion(this.attrs.notification.subject());
  }

  content() {
    const fromUser = this.attrs.notification.fromUser();
    return app.translator.trans('pay-to-see.forum.notifications.discussion_purchased', {
      username: fromUser ? fromUser.username() : '',
    });
  }

  excerpt() {
    const data = this.attrs.notification.content() || {};
    return app.translator.trans('pay-to-see.forum.notifications.discussion_purchased_cost', {
      cost: costLabel(data.cost || 0),
    });
  }
}

function setDiscussionPrice(discussion, cost) {
  return app
    .request({
      method: 'POST',
      url: `${apiUrl()}/pay2seeSet`,
      body: { data: { attributes: { discussionID: discussion.id(), cost } } },
    })
    .then(() => {
      const removed = cost < 0;
      discussion.pushAttributes({ pay2seeCost: removed ? null : cost });
      app.alerts.show(
        { type: 'success' },
        app.translator.trans(
          removed ? 'pay-to-see.forum.remove_pay_to_see_price_success' : 'pay-to-see.forum.set_pay_to_see_price_success'
        )
      );
    })
    .catch((error) => {
      showError(error?.response?.errors?.[0]?.detail || app.translator.trans('pay-to-see.forum.set_error_no_permission'));
      throw error;
    });
}

function purchaseDiscussion(discussion) {
  return app
    .request({
      method: 'POST',
      url: `${apiUrl()}/pay2seePurchase`,
      body: { data: { attributes: { discussionID: discussion.id() } } },
    })
    .then(() => {
      discussion.pushAttributes({ isPaid: true });
      app.alerts.show({ type: 'success' }, app.translator.trans('pay-to-see.forum.purchase_success'));
      window.setTimeout(() => window.location.reload(), 150);
    })
    .catch((error) => {
      const detail = error?.response?.errors?.[0]?.detail;
      showError(detail || app.translator.trans('pay-to-see.forum.purchase_error_insufficient_fund'));
      throw error;
    });
}

function openInlinePurchase(discussion, cost) {
  if (!discussion || !cost) {
    showError(app.translator.trans('pay-to-see.forum.purchase_error_not_found'));
    return;
  }

  if (!app.session.user) {
    app.modal.show(() => import('flarum/forum/components/LogInModal'));
    return;
  }

  app.modal.show(PayToSeePurchaseModal, {
    cost,
    onsubmit: () => purchaseDiscussion(discussion),
  });
}

function handleInlinePurchaseClick(event) {
  const button = event.target.closest?.('.PayToSeePurchaseButton');
  if (!button) return;

  event.preventDefault();
  event.stopPropagation();

  const discussionId = button.dataset.discussionId;
  const cost = Number(button.dataset.cost);
  const discussion = discussionId ? app.store.getById('discussions', discussionId) : null;

  openInlinePurchase(discussion, cost);
}

function applyComposerPayToSee(composer, cost) {
  if (cost < 0) {
    composer.fields.pay2seeAmount(null);
    composer.editor?.removePayBlocks?.();
  } else {
    composer.fields.pay2seeAmount(cost);
    composer.editor?.ensurePayBlock?.();
  }

  m.redraw();
}

function openComposerPayToSeeModal(composer) {
  const amount = composer.fields.pay2seeAmount?.();
  const canRemove = amount !== null && amount !== undefined && Number(amount) > 0;

  app.modal.show(PayToSeePriceModal, {
    cost: amount,
    canRemove,
    onsubmit: (cost) => applyComposerPayToSee(composer, cost),
  });
}
export const extend = [
  new Extend.Model(Discussion)
    .attribute('pay2seeCost')
    .attribute('pay2seeCount')
    .attribute('isPaid'),
  new Extend.Model(Post).attribute('contentHtml'),
  new Extend.Notification().add('pay2see', PayToSeeNotification),
];

app.initializers.add('ziiven-pay-to-see', () => {
  extendComponent(Discussion.prototype, 'badges', function (items) {
    const cost = typeof this.pay2seeCost === 'function' ? this.pay2seeCost() : null;
    if (!cost || Number(cost) <= 0) return;

    items.add(
      'pay2see',
      <Badge
        type="pay2see"
        icon={app.forum.attribute('pay2seeContentBadge') || 'fas fa-dollar-sign'}
        label={app.translator.trans('pay-to-see.forum.pay_to_see_badge')}
      />,
      5
    );
  });

  document.addEventListener('click', handleInlinePurchaseClick);

  extendComponent('flarum/forum/components/NotificationGrid', 'notificationTypes', (items) => {
    items.add('pay2see', {
      name: 'pay2see',
      icon: 'fas fa-lock-open',
      label: app.translator.trans('pay-to-see.forum.notifications.notification_setting_some_one_purchase_content'),
    });
  });

  extendComponent('flarum/common/components/TextEditor', 'toolbarItems', function (items) {
    if (!app.forum.attribute('allowUsePay2See') || !this.attrs.composer?.fields?.pay2seeAmount) return;

    items.add(
      'pay2see',
      <TextEditorButton
        icon="fas fa-lock"
        title={app.translator.trans('pay-to-see.forum.toolbar_tooltip')}
        onclick={() => openComposerPayToSeeModal(this.attrs.composer)}
      />,
      10
    );
  });

  overrideComponent('flarum/common/components/TextEditor', 'buildEditor', function (original, dom) {
    if (!app.forum.attribute('allowUsePay2See') || !this.attrs.composer?.fields?.pay2seeAmount) return original(dom);

    const params = this.buildEditorParams();
    return new PayToSeeVisualEditorDriver(dom, params);
  });
  extendComponent('flarum/common/components/TextEditor', 'onbuild', function () {
    if (!app.forum.attribute('allowUsePay2See')) return;
    const amount = this.attrs.composer?.fields?.pay2seeAmount?.();
    if (amount !== null && amount !== undefined && Number(amount) > 0) {
      this.attrs.composer.editor?.ensurePayBlock?.();
    }
  });

  extendComponent('flarum/forum/components/DiscussionComposer', 'oninit', function () {
    this.composer.fields.pay2seeAmount = this.composer.fields.pay2seeAmount || Stream(null);
  });

  // Flarum 2 renders the split preview inside TextEditor.
  // The preview node is created lazily and is not available on every
  // TextEditor lifecycle callback, so observe the active page container.
  extendComponent('flarum/common/components/TextEditor', 'oncreate', function () {
    const decorate = () => {
      const previews = document.querySelectorAll('.Split-view.Post-body[aria-label="Preview"]');
      previews.forEach((preview) => decoratePayToSeePreview(preview));
    };

    decorate();

    if (typeof MutationObserver !== 'undefined') {
      this.pay2seePreviewObserver = new MutationObserver(decorate);
      this.pay2seePreviewObserver.observe(document.body, {
        subtree: true,
        childList: true,
        characterData: true,
      });
    }
  });

  extendComponent('flarum/common/components/TextEditor', 'onremove', function () {
    this.pay2seePreviewObserver?.disconnect();
  });

  extendComponent('flarum/forum/components/DiscussionComposer', 'headerItems', function (items) {
    if (!app.forum.attribute('allowUsePay2See')) return;

    const amount = this.composer.fields.pay2seeAmount();
    const hasAmount = amount !== null && amount !== undefined && Number(amount) > 0;

    items.add(
      'pay2see',
      <button
        id="pay2seeButton"
        type="button"
        className="Button Button--ua-reset ComposerBody-pay2see"
        onclick={() => openComposerPayToSeeModal(this.composer)}
      >
        <span className="TagLabel untagged Pay2SeeTagLabel">
          {hasAmount && <span id="payAmountSet">✅</span>}
          <span className="Pay2SeeLabelText">
            {' '}
            {app.translator.trans('pay-to-see.forum.pay_to_see_content')}
          </span>
          {hasAmount && (
            <span id="payAmount" className="Pay2SeeAmount">
              {' '}
              {amountLabel(amount)}
            </span>
          )}
        </span>
      </button>,
      2
    );
  });

  extendComponent('flarum/forum/components/DiscussionComposer', 'data', function (data) {
    const amount = this.composer.fields.pay2seeAmount?.();
    if (amount !== null && amount !== undefined) {
      // DiscussionComposer.data() already returns the JSON:API attributes
      // object. Adding an `attributes` wrapper here produces an invalid
      // nested payload in Flarum 2 and causes discussion creation to fail.
      data.pay2seeAmount = amount;
    }
  });

  extendComponent('flarum/forum/components/DiscussionPage', 'sidebarItems', function (items) {
    const discussion = this.discussion;
    const cost = typeof discussion?.pay2seeCost === 'function' ? discussion.pay2seeCost() : null;
    const isOwner = app.session.user && discussion && app.session.user.id() === discussion.user()?.id();
    const canSet = Boolean(app.forum.attribute('allowSetPay2See'));
    const canUse = Boolean(app.forum.attribute('allowUsePay2See'));
    const canPurchase = Boolean(app.forum.attribute('allowPurchasePay2See'));
    const canBypass = Boolean(app.forum.attribute('allowBypassPay2See'));

    if (!discussion || (!cost && !((isOwner && canUse) || canSet))) return;

    if (cost && !discussion.isPaid?.() && !isOwner && !canBypass && canPurchase) {
      items.add(
        'pay2seePurchase',
        <Button
          className="Button Button--primary Button--block"
          icon={currencyIcon()}
          onclick={() => app.modal.show(PayToSeePurchaseModal, { cost, onsubmit: () => purchaseDiscussion(discussion) })}
        >
          {costLabel(cost)}
        </Button>,
        20
      );
    }

    if ((isOwner && canUse) || canSet) {
      items.add(
        'pay2seeManage',
        <Button
          className="Button Button--block"
          icon="fas fa-sliders-h"
          onclick={() =>
            app.modal.show(PayToSeePriceModal, {
              cost,
              canRemove: cost !== null && cost !== undefined,
              onsubmit: (newCost) => setDiscussionPrice(discussion, newCost),
            })
          }
        >
          {cost ? app.translator.trans('pay-to-see.forum.modify_pay_to_see_price') : app.translator.trans('pay-to-see.forum.set_pay_to_see_price')}
        </Button>,
        19
      );
    }

    if (cost && ((isOwner && canUse) || canSet)) {
      items.add(
        'pay2seePurchasedUsers',
        <Button className="Button Button--block" icon="fas fa-users" onclick={() => app.modal.show(PayToSeePurchasedUsersModal, { discussion })}>
          {app.translator.trans('pay-to-see.forum.purchased_users')}
        </Button>,
        18
      );
    }
  });
});
