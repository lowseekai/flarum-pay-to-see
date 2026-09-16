<?php

/*
 * Purchase costs use integer points. Keep this historical migration as a
 * no-op so fresh Flarum 2 installations do not attempt a FLOAT conversion.
 */
use Illuminate\Database\Schema\Builder;

return [
    'up' => static function (Builder $schema): void {
    },
    'down' => static function (Builder $schema): void {
    },
];
