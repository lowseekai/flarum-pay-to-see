<?php

declare(strict_types=1);

namespace Ziven\pay2see\Listeners;

use Flarum\Discussion\Event\Saving;
use Flarum\Foundation\ValidationException;
use Flarum\Locale\TranslatorInterface;
use Flarum\Settings\SettingsRepositoryInterface;
use Illuminate\Support\Arr;

final class AddPayToSeeDiscussion
{
    public function __construct(
        private TranslatorInterface $translator,
        private SettingsRepositoryInterface $settings,
    ) {
    }

    public function handle(Saving $event): void
    {
        if (
            Arr::get($event->data, 'relationships.recipientUsers')
            || Arr::get($event->data, 'relationships.recipientGroups')
        ) {
            return;
        }

        $rawAmount = Arr::get($event->data, 'attributes.pay2seeAmount');
        if ($rawAmount === null) {
            return;
        }

        $allowedTags = $this->parseTagIds($this->settings->get('pay2see.pay2seeAllowTags', []));

        $tagData = Arr::get($event->data, 'relationships.tags.data', []);
        $tagIds = array_map(
            'intval',
            array_map(
                fn (array $tag): int => (int) ($tag['id'] ?? 0),
                is_array($tagData) ? $tagData : []
            )
        );
        $allowedInTag = $allowedTags === [] || (bool) array_intersect($allowedTags, $tagIds);

        if (! $event->actor->hasPermission('pay2see.allowUsePay2See') || ! $allowedInTag) {
            throw new ValidationException([
                'message' => $this->translator->trans('pay-to-see.forum.set_error_no_permission'),
            ]);
        }

        if (Arr::get($event->data, 'attributes.isAnonymous') === true) {
            throw new ValidationException([
                'message' => $this->translator->trans('pay-to-see.forum.not_support_anonymous'),
            ]);
        }

        $amount = (float) $rawAmount;
        $event->discussion->pay2see_cost = $amount < 0 ? null : max(1, (int) round($amount));
    }

    /**
     * Accept both the old JSON setting format and the simpler admin text input
     * format: "2,3".
     */
    private function parseTagIds(mixed $value): array
    {
        if (is_string($value)) {
            $decoded = json_decode($value, true);
            $value = is_array($decoded) ? $decoded : preg_split('/\s*,\s*/', trim($value), -1, PREG_SPLIT_NO_EMPTY);
        }

        return array_values(array_unique(array_filter(
            array_map('intval', is_array($value) ? $value : []),
            fn (int $id): bool => $id > 0,
        )));
    }
}
