<?php

declare(strict_types=1);

namespace Ziven\pay2see\Api;

use Flarum\Api\Context;
use Flarum\Api\Schema;
use Flarum\Discussion\Discussion;
use Ziven\pay2see\Model\PaidDiscussion;

final class DiscussionFields
{
    public function __invoke(): array
    {
        return [
            Schema\Boolean::make('isPaid')
                ->get(function (Discussion $discussion, Context $context): bool {
                    $actor = $context->getActor();

                    if ($actor->isGuest()) {
                        return false;
                    }

                    return PaidDiscussion::query()
                        ->where('user_id', $actor->id)
                        ->where('discussion_id', $discussion->id)
                        ->exists();
                }),
            Schema\Integer::make('pay2seeCost')
                ->property('pay2see_cost')
                ->nullable(),
            Schema\Integer::make('pay2seeCount')
                ->property('pay2see_count'),
            // This is a create-only request field. The saving listener validates
            // it and stores the normalized value in pay2see_cost.
            Schema\Integer::make('pay2seeAmount')
                ->writableOnCreate()
                ->min(1)
                ->set(static function (Discussion $discussion, mixed $value): void {
                    // Do not map this transient API field to a database column.
                }),
        ];
    }
}
