import app from 'flarum/admin/app';

app.initializers.add('ziiven-pay-to-see-admin', () => {
  app.registry
    .for('ziiven-pay-to-see')
    .registerSetting({
      setting: 'pay2see.pay2seeContentBadge',
      type: 'text',
      label: app.translator.trans('pay-to-see.admin.settings.badge_icon'),
      help: app.translator.trans('pay-to-see.admin.settings.badge_icon_desc'),
    })
    .registerSetting({
      setting: 'pay2see.pay2seeAllowTags',
      type: 'text',
      label: app.translator.trans('pay-to-see.admin.settings.allowed_tags'),
      help: app.translator.trans('pay-to-see.admin.settings.allowed_tags_help'),
    })
    .registerPermission(
      {
        icon: 'fas fa-lock',
        label: app.translator.trans('pay-to-see.admin.permission.allow_use_pay2see'),
        permission: 'pay2see.allowUsePay2See',
      },
      'start'
    )
    .registerPermission(
      {
        icon: 'fas fa-coins',
        label: app.translator.trans('pay-to-see.admin.permission.allow_purchase_pay2see'),
        permission: 'pay2see.allowPurchasePay2See',
      },
      'reply'
    )
    .registerPermission(
      {
        icon: 'fas fa-unlock',
        label: app.translator.trans('pay-to-see.admin.permission.allow_bypass_pay2see'),
        permission: 'pay2see.allowBypassPay2See',
      },
      'moderate'
    )
    .registerPermission(
      {
        icon: 'fas fa-sliders-h',
        label: app.translator.trans('pay-to-see.admin.permission.allow_set_pay2see'),
        permission: 'pay2see.allowSetPay2See',
      },
      'moderate'
    );
});
