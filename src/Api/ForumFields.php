<?php

declare(strict_types=1);

namespace Ziven\pay2see\Api;

use Flarum\Api\Context;
use Flarum\Api\Schema;
use Flarum\User\User;

final class ForumFields
{
    public function __invoke(): array
    {
        return [
            Schema\Boolean::make('allowUsePay2See')
                ->get(fn (object $_, Context $context): bool => $this->can($context, 'pay2see.allowUsePay2See')),
            Schema\Boolean::make('allowSetPay2See')
                ->get(fn (object $_, Context $context): bool => $this->can($context, 'pay2see.allowSetPay2See')),
            Schema\Boolean::make('allowPurchasePay2See')
                ->get(fn (object $_, Context $context): bool => $this->can($context, 'pay2see.allowPurchasePay2See')),
            Schema\Boolean::make('allowBypassPay2See')
                ->get(fn (object $_, Context $context): bool => $this->can($context, 'pay2see.allowBypassPay2See')),
        ];
    }

    private function can(Context $context, string $permission): bool
    {
        $actor = $context->getActor();

        return $actor instanceof User && $actor->hasPermission($permission);
    }
}
