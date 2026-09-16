<?php

declare(strict_types=1);

namespace Ziven\pay2see\Listeners;

use Flarum\Foundation\ValidationException;
use Flarum\Locale\TranslatorInterface;
use Flarum\Post\Event\Saving;
use Illuminate\Support\Arr;

final class AddPayToSeePost
{
    public function __construct(
        private TranslatorInterface $translator,
    ) {
    }

    public function handle(Saving $event): void
    {
        $discussion = $event->post->discussion;

        if (
            $discussion?->pay2see_cost !== null
            && (int) $event->actor->id === (int) $discussion->user_id
            && Arr::get($event->data, 'attributes.isAnonymous') === true
        ) {
            throw new ValidationException([
                'message' => $this->translator->trans('pay-to-see.forum.not_support_anonymous'),
            ]);
        }
    }
}
