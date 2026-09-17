import Extend from 'flarum/common/extenders';
import app from 'flarum/forum/app';
import Button from 'flarum/common/components/Button';
import FormModal from 'flarum/common/components/FormModal';
import Modal from 'flarum/common/components/Modal';
import Notification from 'flarum/forum/components/Notification';
import TextEditorButton from 'flarum/common/components/TextEditorButton';
import Discussion from 'flarum/common/models/Discussion';
import Post from 'flarum/common/models/Post';
import Stream from 'flarum/common/utils/Stream';
import { extend as extendComponent } from 'flarum/common/extend';

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
    Promise.resolve(this.attrs.onsubmit(cost))
      .then(() => this.hide())
      .catch(() => {
        this.loading = false;
        m.redraw();
      });
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
    })
    .catch((error) => {
      const detail = error?.response?.errors?.[0]?.detail;
      showError(detail || app.translator.trans('pay-to-see.forum.purchase_error_insufficient_fund'));
      throw error;
    });
}

function payToSeeComposerButton(editor) {
  editor.insertAtCursor('[pay][/pay]');
  const selection = editor.getSelectionRange();
  editor.moveCursorTo(Math.max(0, selection[1] - 6));
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
  extendComponent('flarum/forum/components/NotificationGrid', 'notificationTypes', (items) => {
    items.add('pay2see', {
      name: 'pay2see',
      icon: 'fas fa-lock-open',
      label: app.translator.trans('pay-to-see.forum.notifications.notification_setting_some_one_purchase_content'),
    });
  });

  extendComponent('flarum/common/components/TextEditor', 'toolbarItems', function (items) {
    if (!app.forum.attribute('allowUsePay2See')) return;

    items.add(
      'pay2see',
      <TextEditorButton icon="fas fa-lock" title={app.translator.trans('pay-to-see.forum.toolbar_tooltip')} onclick={() => payToSeeComposerButton(this.attrs.composer.editor)} />,
      10
    );
  });

  extendComponent('flarum/forum/components/DiscussionComposer', 'oninit', function () {
    this.composer.fields.pay2seeAmount = this.composer.fields.pay2seeAmount || Stream(null);
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
        onclick={() =>
          app.modal.show(PayToSeePriceModal, {
            cost: amount,
            onsubmit: (cost) => {
              this.composer.fields.pay2seeAmount(cost);
              m.redraw();
            },
          })
        }
      >
        <span className="TagLabel untagged Pay2SeeTagLabel">
          {hasAmount && <span id="payAmountSet">✅</span>}
          {' '}
          {app.translator.trans('pay-to-see.forum.pay_to_see_content')}
          {hasAmount && (
            <span id="payAmount" className="Pay2SeeAmount">
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
      data.attributes = data.attributes || {};
      data.attributes.pay2seeAmount = amount;
    }
  });

  extendComponent('flarum/forum/components/ComposerPostPreview', 'oncreate', function (vnode) {
    decoratePayToSeePreview(vnode.dom);
  });

  extendComponent('flarum/forum/components/ComposerPostPreview', 'onupdate', function (vnode) {
    decoratePayToSeePreview(vnode.dom);
  });

  extendComponent('flarum/forum/components/ComposerPostPreview', 'onremove', function () {
    this.pay2seePreviewInterval && clearInterval(this.pay2seePreviewInterval);
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
