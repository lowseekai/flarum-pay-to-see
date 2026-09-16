<?php

declare(strict_types=1);

namespace Ziven\pay2see\Controller;

use Flarum\Discussion\Discussion;
use Flarum\Http\RequestUtil;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Ziven\pay2see\Model\PaidDiscussion;

final class ListPayToSeePurchasedUserController implements RequestHandlerInterface
{
    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        $actor->assertRegistered();

        $query = $request->getQueryParams();
        $discussionId = (int) ($query['discussionID'] ?? 0);
        $discussion = $discussionId > 0 ? Discussion::find($discussionId) : null;

        if (! $discussion) {
            return new JsonResponse([
                'errors' => [['code' => 'not_found', 'detail' => 'Discussion not found.']],
            ], 404, ['Content-Type' => 'application/vnd.api+json']);
        }

        if ((int) $discussion->user_id !== (int) $actor->id && ! $actor->hasPermission('pay2see.allowSetPay2See')) {
            return new JsonResponse([
                'errors' => [['code' => 'no_permission', 'detail' => 'Permission denied.']],
            ], 403, ['Content-Type' => 'application/vnd.api+json']);
        }

        $page = is_array($query['page'] ?? null) ? $query['page'] : [];
        $offset = max(0, (int) ($page['offset'] ?? 0));
        $limit = min(100, max(1, (int) ($page['limit'] ?? 20)));

        $builder = PaidDiscussion::query()
            ->with('purchasedByUser')
            ->where('discussion_id', $discussionId)
            ->orderByDesc('id');
        $total = (clone $builder)->count();
        $rows = $builder->offset($offset)->limit($limit)->get();

        $data = $rows->map(fn (PaidDiscussion $purchase) => [
            'type' => 'pay2seePurchase',
            'id' => (string) $purchase->id,
            'attributes' => [
                'discussion_id' => (int) $purchase->discussion_id,
                'user_id' => (int) $purchase->user_id,
                'owner_id' => (int) $purchase->owner_id,
                'cost' => (int) $purchase->cost,
                'assigned_at' => (string) $purchase->assigned_at,
            ],
            'relationships' => [
                'purchasedByUser' => [
                    'data' => $purchase->purchasedByUser ? [
                        'type' => 'users',
                        'id' => (string) $purchase->purchasedByUser->id,
                    ] : null,
                ],
            ],
        ])->values()->all();

        $included = $rows
            ->filter(fn (PaidDiscussion $purchase) => $purchase->purchasedByUser)
            ->map(fn (PaidDiscussion $purchase) => [
                'type' => 'users',
                'id' => (string) $purchase->purchasedByUser->id,
                'attributes' => [
                    'username' => (string) $purchase->purchasedByUser->username,
                    'displayName' => (string) ($purchase->purchasedByUser->display_name ?: $purchase->purchasedByUser->username),
                    'avatarUrl' => $purchase->purchasedByUser->avatar_url,
                ],
            ])
            ->unique('id')
            ->values()
            ->all();

        return new JsonResponse([
            'data' => $data,
            'included' => $included,
            'meta' => [
                'page' => [
                    'offset' => $offset,
                    'limit' => $limit,
                    'total' => $total,
                ],
            ],
            'links' => [
                'self' => (string) $request->getUri(),
                'next' => $offset + $limit < $total
                    ? $this->pageUrl($request, $offset + $limit, $limit)
                    : null,
            ],
        ], 200, ['Content-Type' => 'application/vnd.api+json']);
    }

    private function pageUrl(ServerRequestInterface $request, int $offset, int $limit): string
    {
        $query = $request->getQueryParams();
        $query['page']['offset'] = $offset;
        $query['page']['limit'] = $limit;

        return (string) $request->getUri()->withQuery(http_build_query($query));
    }
}
