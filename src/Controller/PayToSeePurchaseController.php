<?php

declare(strict_types=1);

namespace Ziven\pay2see\Controller;

use Flarum\Discussion\Discussion;
use Flarum\Http\RequestUtil;
use Flarum\Notification\NotificationSyncer;
use Flarum\User\User;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Carbon;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Ramon\PointSystem\Repository\PointsRepository;
use Ziven\pay2see\Model\PaidDiscussion;
use Ziven\pay2see\Notification\PayToSeeBlueprint;

final class PayToSeePurchaseController implements RequestHandlerInterface
{
    public function __construct(
        private NotificationSyncer $notifications,
        private PointsRepository $points,
        private ConnectionInterface $db,
    ) {
    }

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        $actor->assertRegistered();

        $body = (array) $request->getParsedBody();
        $attributes = (array) ($body['data']['attributes'] ?? $body);
        $discussionId = (int) ($attributes['discussionID'] ?? 0);

        if ($discussionId <= 0) {
            return $this->error('invalid_discussion', 'Invalid discussion.', 422);
        }

        if (! $actor->hasPermission('pay2see.allowPurchasePay2See')) {
            return $this->error('no_permission', 'Permission denied.', 403);
        }

        $alreadyPurchased = false;

        try {
            $purchase = $this->db->transaction(function () use ($actor, $discussionId, &$alreadyPurchased): PaidDiscussion {
                $discussion = Discussion::query()->lockForUpdate()->find($discussionId);

                if (! $discussion || $discussion->pay2see_cost === null) {
                    throw new \DomainException('not_found');
                }

                if ((int) $discussion->user_id === (int) $actor->id) {
                    throw new \DomainException('owner');
                }

                $existing = PaidDiscussion::query()
                    ->where('discussion_id', $discussionId)
                    ->where('user_id', $actor->id)
                    ->lockForUpdate()
                    ->first();

                if ($existing) {
                    $alreadyPurchased = true;
                    return $existing->load(['purchasedByUser', 'purchasedDiscussion']);
                }

                $owner = User::query()->lockForUpdate()->find((int) $discussion->user_id);
                if (! $owner) {
                    throw new \DomainException('not_found');
                }

                $cost = max(1, (int) round((float) $discussion->pay2see_cost));
                try {
                    $this->points->deduct($actor, $cost, 'pay2see.purchase', 'discussion', $discussionId);
                } catch (\DomainException) {
                    throw new \DomainException('insufficient_fund');
                }
                $this->points->award(
                    $owner,
                    $cost,
                    'pay2see.income',
                    'discussion',
                    $discussionId,
                    ['buyer_id' => (int) $actor->id],
                );

                $purchase = PaidDiscussion::create([
                    'user_id' => (int) $actor->id,
                    'owner_id' => (int) $owner->id,
                    'discussion_id' => $discussionId,
                    'cost' => $cost,
                    'assigned_at' => Carbon::now(),
                ]);

                $discussion->pay2see_count = (int) $discussion->pay2see_count + 1;
                $discussion->save();

                return $purchase->load(['purchasedByUser', 'purchasedDiscussion']);
            });
        } catch (\DomainException $e) {
            $code = $e->getMessage();
            $detail = match ($code) {
                'owner' => 'The discussion owner does not need to purchase this content.',
                'not_found' => 'Cannot purchase this content.',
                default => 'Insufficient points.',
            };

            return $this->error($code, $detail, 422);
        }

        $owner = User::find((int) $purchase->owner_id);
        if ($owner && ! $alreadyPurchased) {
            $this->notifications->sync(new PayToSeeBlueprint($purchase), [$owner]);
        }

        return new JsonResponse(['data' => $this->resource($purchase)], $alreadyPurchased ? 200 : 201, [
            'Content-Type' => 'application/vnd.api+json',
        ]);
    }

    private function resource(PaidDiscussion $purchase): array
    {
        return [
            'type' => 'pay2seePurchase',
            'id' => (string) $purchase->id,
            'attributes' => [
                'discussion_id' => (int) $purchase->discussion_id,
                'user_id' => (int) $purchase->user_id,
                'owner_id' => (int) $purchase->owner_id,
                'cost' => (int) $purchase->cost,
                'assigned_at' => (string) $purchase->assigned_at,
            ],
        ];
    }

    private function error(string $code, string $detail, int $status): JsonResponse
    {
        return new JsonResponse([
            'errors' => [['code' => $code, 'detail' => $detail]],
        ], $status, ['Content-Type' => 'application/vnd.api+json']);
    }
}
