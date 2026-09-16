<?php

use Flarum\Database\Migration;
use Flarum\Group\Group;

return Migration::addPermissions([
    'pay2see.allowUsePay2See' => Group::MEMBER_ID,
    'pay2see.allowPurchasePay2See' => Group::MEMBER_ID,
    'pay2see.allowBypassPay2See' => Group::MODERATOR_ID
]);
