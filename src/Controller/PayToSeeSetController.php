<?php

declare(strict_types=1);

namespace Ziven\pay2see\Controller;

use Flarum\Discussion\Discussion;
use Flarum\Http\RequestUtil;
use Flarum\Settings\SettingsRepositoryInterface;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;

final class PayToSeeSetController implements RequestHandlerInterface
{
    public function __construct(
        private SettingsRepositoryInterface $settings,
    ) {
    }

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        $actor->assertRegistered();

        $body = (array) $request->getParsedBody();
        $attributes = (array) ($body['data']['attributes'] ?? $body);
        $discussionId = (int) ($attributes['discussionID'] ?? 0);
        $rawCost = $attributes['cost'] ?? null;
        $discussion = $discussionId > 0 ? Discussion::find($discussionId) : null;

        if (! $discussion || $rawCost === null) {
            return $this->error('not_found', 'Discussion or price not found.', 422);
        }

        $isOwner = (int) $discussion->user_id === (int) $actor->id;
        $canUse = $actor->hasPermission('pay2see.allowUsePay2See');
        $canSet = $actor->hasPermission('pay2see.allowSetPay2See');

        if ((! $isOwner || ! $canUse) && ! $canSet) {
            return $this->error('no_permission', 'Permission denied.', 403);
        }

        if (! $this->allowedByTag($discussion)) {
            return $this->error('tag_not_allowed', 'The selected tags do not allow paid content.', 422);
        }

        if ($discussion->anonymous_user_id !== null) {
            return $this->error('anonymous_not_supported', 'Anonymous discussions are not supported.', 422);
        }

        $cost = (float) $rawCost;
        $discussion->pay2see_cost = $cost < 0 ? null : max(1, (int) round($cost));
        $discussion->save();

        return new JsonResponse([
            'data' => [
                'type' => 'pay2seeSet',
                'id' => (string) $discussion->id,
                'attributes' => ['pay2see_cost' => $discussion->pay2see_cost],
            ],
        ], 200, ['Content-Type' => 'application/vnd.api+json']);
    }

    private function allowedByTag(Discussion $discussion): bool
    {
        $allowed = $this->parseTagIds($this->settings->get('pay2see.pay2seeAllowTags', []));

        if ($allowed === []) {
            return true;
        }

        $tagIds = $discussion->tags()
            ->pluck('tags.id')
            ->map(fn ($id) => (int) $id)
            ->all();

        return (bool) array_intersect($allowed, $tagIds);
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

    private function error(string $code, string $detail, int $status): JsonResponse
    {
        return new JsonResponse([
            'errors' => [['code' => $code, 'detail' => $detail]],
        ], $status, ['Content-Type' => 'application/vnd.api+json']);
    }
}
