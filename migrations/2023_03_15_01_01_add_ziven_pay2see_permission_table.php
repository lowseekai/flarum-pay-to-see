<?php

use Flarum\Database\Migration;
use Flarum\Group\Group;

return Migration::addPermissions([
    'pay2see.allowSetPay2See' => Group::MODERATOR_ID,
]);
