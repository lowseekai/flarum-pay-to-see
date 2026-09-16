<?php

use Flarum\Database\Migration;

return Migration::addColumns('discussions', [
    'pay2see_cost' => ['integer', 'nullable' => true],
    'pay2see_count' => ['integer','default' => 0]
]);
